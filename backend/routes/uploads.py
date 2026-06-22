"""
routes/uploads.py
Whisper-only file and audio upload endpoints.
"""

import io
import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError

from db.database import get_db
from db.models import UserProfile, UploadedFile
from dependencies import get_current_user
from core.rate_limiter import limiter
from core.config import OPENAI_KEY, SECRET_KEY
from services.audit import record_audit
from services.content_extraction import (
    extract_from_document,
    extract_from_url,
    ExtractionError,
)

import openai
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

router = APIRouter(prefix="/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "uploaded_files_store",
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── Signed download URLs (AP-SEC-007) ──────────────────────────────────────────
# Uploaded files are tenant-private. Browser <a>/<img> requests can't carry the
# Bearer token, so authenticated listing/upload responses hand out a short-lived
# signed URL that the download endpoint verifies (capability URL, S3-presign style).
_DOWNLOAD_TOKEN_TTL = timedelta(hours=1)


def _make_download_token(file_id) -> str:
    payload = {
        "fid": str(file_id),
        "scope": "file-download",
        "exp": datetime.now(timezone.utc) + _DOWNLOAD_TOKEN_TTL,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def _verify_download_token(token: str, file_id: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return False
    return payload.get("scope") == "file-download" and payload.get("fid") == file_id


def _signed_download_url(base_url: str, file_id) -> str:
    return f"{base_url}/uploads/download/{file_id}?token={_make_download_token(file_id)}"


# ── Upload size + content validation (AP-SEC-011, AP-SEC-030) ──────────────────
_UPLOAD_CHUNK = 1024 * 1024  # 1 MB


async def _read_capped(file: "UploadFile", max_bytes: int) -> bytes:
    """Read an upload in chunks, aborting as soon as it exceeds max_bytes so a
    huge body can't be fully buffered into memory first. (AP-SEC-011)"""
    chunks = []
    total = 0
    while True:
        chunk = await file.read(_UPLOAD_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="File too large")
        chunks.append(chunk)
    return b"".join(chunks)


# Magic-byte signatures for the content types we accept. text/plain has no
# reliable signature and is allowed through (it is never executed).
_OOXML_SIG = [b"PK\x03\x04", b"PK\x05\x06"]  # DOCX/XLSX are ZIP containers
_OLE_SIG = [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"]  # legacy DOC/XLS compound file
_MAGIC_SIGNATURES = {
    "application/pdf": [b"%PDF"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/jpg": [b"\xff\xd8\xff"],
    "image/webp": [b"RIFF"],  # 'WEBP' marker checked separately at offset 8
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _OOXML_SIG,
    "application/msword": _OLE_SIG + [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": _OOXML_SIG,
    "application/vnd.ms-excel": _OLE_SIG + _OOXML_SIG,
}


def _validate_magic(contents: bytes, content_type: str) -> None:
    """Reject files whose bytes don't match their declared content type so a
    client cannot smuggle, e.g., an HTML/script payload as application/pdf.
    (AP-SEC-030)"""
    if content_type == "text/plain":
        return
    signatures = _MAGIC_SIGNATURES.get(content_type)
    if not signatures:
        return
    head = contents[:16]
    if not any(head.startswith(sig) for sig in signatures):
        raise HTTPException(status_code=400, detail="File content does not match its declared type")
    if content_type == "image/webp" and contents[8:12] != b"WEBP":
        raise HTTPException(status_code=400, detail="File content does not match its declared type")


ALLOWED_FILE_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}

ALLOWED_AUDIO_TYPES = {
    "audio/mpeg",
    "audio/wav",
    "audio/mp4",
    "audio/ogg",
    "audio/webm",
    "audio/x-wav",
    "audio/mp3",
    "audio/m4a",
    "audio/x-m4a",
    "video/webm",
    "video/mp4",
    "application/octet-stream",
}

ALLOWED_AUDIO_SUFFIXES = {
    ".mp3",
    ".wav",
    ".webm",
    ".mp4",
    ".mpeg",
    ".ogg",
    ".m4a",
}

AUDIO_SUFFIX_BY_CONTENT_TYPE = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/mp4": ".mp4",
    "video/mp4": ".mp4",
    "audio/ogg": ".ogg",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
}

WHISPER_CACHE_DIR = os.path.join(UPLOAD_DIR, "whisper_cache")
os.makedirs(WHISPER_CACHE_DIR, exist_ok=True)

FFMPEG_TIMEOUT_SECONDS = 60
TRANSCRIPTION_TIMEOUT_SECONDS = 180
MAX_AUDIO_DURATION_SECONDS = 10 * 60

_whisper_model = None
_whisper_model_lock = threading.Lock()


def _ensure_ffmpeg_available() -> str:
    ffmpeg_path = shutil.which("ffmpeg")
    logger.info("shutil.which('ffmpeg'): %s", ffmpeg_path)
    logger.info("PATH: %s", os.environ.get("PATH"))

    if not ffmpeg_path:
        possible_paths = [
            "/usr/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            r"C:\ffmpeg\bin\ffmpeg.exe",
        ]

        for path in possible_paths:
            if os.path.exists(path):
                ffmpeg_path = path
                break

    logger.info("Detected ffmpeg path: %s", ffmpeg_path)

    if ffmpeg_path:
        # Whisper invokes the command name "ffmpeg", so fallback locations must
        # also be visible on PATH in the transcription worker process.
        ffmpeg_dir = os.path.dirname(ffmpeg_path)
        path_entries = os.environ.get("PATH", "").split(os.pathsep)
        if ffmpeg_dir not in path_entries:
            os.environ["PATH"] = os.pathsep.join([ffmpeg_dir, *path_entries])
            logger.info("Added ffmpeg directory to PATH: %s", ffmpeg_dir)

        return ffmpeg_path

    raise HTTPException(
        status_code=503,
        detail=(
            "FFmpeg is required for audio transcription but was not found. "
            "On Windows run `winget install Gyan.FFmpeg` and restart the server. "
            "On Debian/Ubuntu run `apt-get update && apt-get install -y ffmpeg`."
        ),
    )


def _get_audio_suffix(filename: str | None, content_type: str | None) -> str:
    filename_suffix = os.path.splitext(filename or "")[1].lower()
    if filename_suffix in ALLOWED_AUDIO_SUFFIXES:
        return filename_suffix

    return AUDIO_SUFFIX_BY_CONTENT_TYPE.get(
        _normalize_content_type(content_type),
        ".webm",
    )


def _normalize_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def get_whisper_model():
    global _whisper_model

    if _whisper_model is None:
        with _whisper_model_lock:
            if _whisper_model is None:
                try:
                    import whisper
                except ImportError as exc:
                    raise RuntimeError("Whisper is not installed. Install backend requirements.") from exc

                _whisper_model = whisper.load_model(
                    "base",
                    download_root=WHISPER_CACHE_DIR,
                )

    return _whisper_model


def _extract_text_from_file(filepath: str, content_type: str) -> str:
    try:
        if content_type == "text/plain":
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()[:8000]

        if content_type == "application/pdf":
            try:
                import PyPDF2

                with open(filepath, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text = ""
                    for page in reader.pages[:20]:
                        text += page.extract_text() or ""
                    return text[:8000]
            except ImportError:
                return "[PDF text extraction unavailable — install PyPDF2]"

        if "wordprocessingml" in content_type or content_type == "application/msword":
            try:
                import docx

                doc = docx.Document(filepath)
                text = "\n".join(p.text for p in doc.paragraphs)
                return text[:8000]
            except ImportError:
                return "[DOCX text extraction unavailable — install python-docx]"

        if content_type and content_type.startswith("image/"):
            return f"[Image file: {os.path.basename(filepath)}]"

    except Exception as e:
        return f"[Error extracting text: {str(e)}]"

    return ""


def _get_audio_duration(audio_path: str) -> float:
    ffmpeg_path = _ensure_ffmpeg_available()
    ffprobe_path = shutil.which("ffprobe") or os.path.join(
        os.path.dirname(ffmpeg_path),
        "ffprobe.exe" if os.name == "nt" else "ffprobe",
    )

    try:
        result = subprocess.run(
            [
                ffprobe_path,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
        )
        return float(result.stdout.strip())
    except (FileNotFoundError, ValueError, subprocess.CalledProcessError) as exc:
        raise ValueError("Could not determine audio duration") from exc
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("Audio duration check timed out") from exc


def _convert_to_whisper_wav(audio_path: str, wav_path: str) -> None:
    ffmpeg_path = _ensure_ffmpeg_available()

    try:
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                audio_path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                wav_path,
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("Audio conversion timed out") from exc
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise ValueError("FFmpeg could not decode the uploaded audio") from exc


def _transcribe_via_api(audio_path: str) -> dict:
    """
    Transcribe audio using OpenAI's Whisper API.
    """
    client = openai.OpenAI(api_key=OPENAI_KEY)

    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(model="whisper-1", file=audio_file, response_format="json")

    return {
        "text": response.text.strip(),
        "language": "en",  # OpenAI API handles detection, but we return en as default for consistency
    }


def _transcribe_via_local_model(audio_path: str) -> dict:
    """
    Transcribe audio using a locally loaded Whisper model.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        wav_path = os.path.join(temp_dir, "audio.wav")
        _convert_to_whisper_wav(audio_path, wav_path)

        result = get_whisper_model().transcribe(
            wav_path,
            task="translate",
            language=None,
            fp16=False,
            temperature=0,
            condition_on_previous_text=False,
        )

    return {
        "text": result.get("text", "").strip(),
        "language": "en",
    }


def _transcribe_with_whisper(audio_path: str) -> dict:
    duration = _get_audio_duration(audio_path)
    if duration <= 0:
        raise ValueError("Uploaded audio has no playable content")
    if duration > MAX_AUDIO_DURATION_SECONDS:
        raise ValueError("Audio is too long (max 10 minutes)")

    # Use OpenAI API if key is available (QA/Prod)
    if OPENAI_KEY and not OPENAI_KEY.startswith("mock-"):
        try:
            logger.info("Using OpenAI API for transcription")
            return _transcribe_via_api(audio_path)
        except Exception as e:
            logger.error("OpenAI API transcription failed, falling back to local: %s", str(e))
            # Fallback to local if API fails for any reason
            return _transcribe_via_local_model(audio_path)

    # Otherwise use local model (Dev)
    logger.info("Using local Whisper model for transcription")
    return _transcribe_via_local_model(audio_path)


@router.post("/file")
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    ip = request.client.host if getattr(request, "client", None) else None

    if file.content_type not in ALLOWED_FILE_TYPES:
        # Log rejected uploads for security monitoring (blocks executables/scripts).
        record_audit(
            db, action="upload.rejected", actor=current_user, tenant_id=current_user.tenant_id,
            target_type="file", ip_address=ip,
            detail={"reason": "unsupported_type", "content_type": file.content_type, "filename": file.filename},
        )
        raise HTTPException(status_code=400, detail="This file type is not supported.")

    try:
        contents = await _read_capped(file, 10 * 1024 * 1024)  # (AP-SEC-011)
        _validate_magic(contents, file.content_type)  # (AP-SEC-030)
    except HTTPException as exc:
        record_audit(
            db, action="upload.rejected", actor=current_user, tenant_id=current_user.tenant_id,
            target_type="file", ip_address=ip,
            detail={"reason": "size_or_magic", "status": exc.status_code, "content_type": file.content_type},
        )
        raise

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    with open(filepath, "wb") as f:
        f.write(contents)

    # Traditional parser / OCR extraction with confidence (AI is not used here).
    result = extract_from_document(contents, file.content_type, file.filename or "")

    db_file = UploadedFile(
        id=uuid.UUID(file_id),
        filename=file.filename or "Untitled",
        content_type=file.content_type,
        file_size=len(contents),
        extracted_text=result.text,
        upload_type="file",
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )

    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    base_url = str(request.base_url).rstrip("/")
    payload = result.as_dict()
    return {
        "id": str(db_file.id),
        "filename": db_file.filename,
        "content_type": db_file.content_type,
        "file_size": db_file.file_size,
        "extracted_text": result.text,
        "upload_type": "file",
        "file_url": _signed_download_url(base_url, db_file.id),
        # Extraction metadata for the user-verification step.
        "confidence": payload["confidence"],
        "ocr_quality": payload["ocr_quality"],
        "warnings": payload["warnings"],
        "needs_review": payload["needs_review"],
        "source": db_file.filename,
    }


class LinkExtractRequest(BaseModel):
    url: str


@router.post("/link")
@limiter.limit("10/minute")
async def extract_link(
    request: Request,
    body: LinkExtractRequest,
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    """Extract page title / description / headings / main content from a website
    link using a traditional HTML parser behind an SSRF guard. Returns the same
    extraction-metadata shape as file upload for the verification step."""
    ip = request.client.host if getattr(request, "client", None) else None
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=422, detail="Please enter a website link.")
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url

    try:
        result = extract_from_url(url)
    except ExtractionError as exc:
        record_audit(
            db, action="link.rejected", actor=current_user, tenant_id=current_user.tenant_id,
            target_type="link", ip_address=ip, detail={"url": url[:300], "reason": str(exc)},
        )
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.warning("Link extraction error: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="We could not read that website link. Please try another.")

    # Persist as a tenant-scoped context source so it can be reused/removed.
    db_file = UploadedFile(
        id=uuid.uuid4(),
        filename=url[:500],
        content_type="text/uri-list",
        file_size=len(result.text or ""),
        extracted_text=result.text,
        upload_type="link",
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    payload = result.as_dict()
    return {
        "id": str(db_file.id),
        "filename": url,
        "upload_type": "link",
        "extracted_text": result.text,
        "confidence": payload["confidence"],
        "ocr_quality": payload["ocr_quality"],
        "warnings": payload["warnings"],
        "needs_review": payload["needs_review"],
        "source": url,
    }


class DriveUploadRequest(BaseModel):
    fileId: str
    accessToken: str
    filename: str
    mimeType: str


@router.post("/drive")
@limiter.limit("10/minute")
async def upload_from_drive(
    request: Request,
    body: DriveUploadRequest,
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Downloads a file from Google Drive and processes it like a normal upload.
    """
    try:
        creds = Credentials(token=body.accessToken)
        service = build("drive", "v3", credentials=creds)

        # Handle Google Docs formats by exporting them as PDF
        is_google_doc = body.mimeType.startswith("application/vnd.google-apps.")

        file_id = str(uuid.uuid4())
        ext = os.path.splitext(body.filename)[1]

        # If it's a Google Doc (Doc, Sheet, Slide), export as PDF
        content_type = body.mimeType
        if is_google_doc:
            if "spreadsheet" in body.mimeType:
                export_mime = "application/pdf"
            elif "presentation" in body.mimeType:
                export_mime = "application/pdf"
            else:
                export_mime = "application/pdf"

            drive_request = service.files().export_media(fileId=body.fileId, mimeType=export_mime)
            ext = ".pdf"
            content_type = "application/pdf"
        else:
            drive_request = service.files().get_media(fileId=body.fileId)

        stored_name = f"{file_id}{ext}"
        filepath = os.path.join(UPLOAD_DIR, stored_name)

        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, drive_request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()

        contents = fh.getvalue()
        if len(contents) > 15 * 1024 * 1024:  # 15 MB limit for Drive
            raise HTTPException(status_code=400, detail="File too large (max 15 MB)")

        with open(filepath, "wb") as f:
            f.write(contents)

        # Extract text using existing logic
        extracted = _extract_text_from_file(filepath, content_type)

        # Save to DB
        db_file = UploadedFile(
            id=uuid.UUID(file_id),
            filename=body.filename,
            content_type=content_type,
            file_size=len(contents),
            extracted_text=extracted,
            upload_type="file",
            tenant_id=current_user.tenant_id,
            created_by=current_user.id,
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)

        base_url = str(request.base_url).rstrip("/")
        return {
            "id": str(db_file.id),
            "filename": db_file.filename,
            "content_type": db_file.content_type,
            "file_size": db_file.file_size,
            "extracted_text": extracted,
            "upload_type": "file",
            "file_url": _signed_download_url(base_url, db_file.id),
        }

    except Exception as exc:
        # Don't leak raw upstream error detail to the client. (AP-SEC-038)
        logger.error("Google Drive import failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Failed to import file from Google Drive")


@router.post("/audio")
@limiter.limit("5/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    content_type = _normalize_content_type(file.content_type)
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {file.content_type}",
        )

    contents = await _read_capped(file, 25 * 1024 * 1024)  # (AP-SEC-011)

    file_id = str(uuid.uuid4())
    ext = _get_audio_suffix(file.filename, content_type)
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    with open(filepath, "wb") as f:
        f.write(contents)

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_transcribe_with_whisper, filepath),
            timeout=TRANSCRIPTION_TIMEOUT_SECONDS,
        )
        transcript = result["text"]
        detected_language = result["language"]

    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Audio transcription timed out",
        ) from exc
    except HTTPException:
        raise
    except (TimeoutError, ValueError) as exc:
        logger.warning(
            "Uploaded audio processing failed (%s): %s",
            type(exc).__name__,
            str(exc),
        )
        raise HTTPException(
            status_code=400,
            detail="Audio could not be processed. Check the file and try again.",
        ) from exc
    except Exception as e:
        logger.exception("Whisper transcription failed for uploaded audio")
        raise HTTPException(
            status_code=500,
            detail="Audio transcription failed. Please try again.",
        ) from e

    db_file = UploadedFile(
        id=uuid.UUID(file_id),
        filename=file.filename or "Audio recording",
        content_type=file.content_type,
        file_size=len(contents),
        extracted_text=transcript,
        upload_type="audio",
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )

    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    base_url = str(request.base_url).rstrip("/")
    return {
        "id": str(db_file.id),
        "filename": db_file.filename,
        "content_type": db_file.content_type,
        "file_size": db_file.file_size,
        "extracted_text": transcript,
        "text": transcript,
        "language": detected_language,
        "upload_type": "audio",
        "file_url": _signed_download_url(base_url, db_file.id),
    }


@router.post("/audio/transcribe")
@limiter.limit("5/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
    current_user: UserProfile = Depends(get_current_user),
):
    upload = audio or file
    if upload is None:
        raise HTTPException(
            status_code=400,
            detail="No audio file uploaded. Expected form field 'audio' or 'file'.",
        )

    content_type = _normalize_content_type(upload.content_type)
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {upload.content_type}",
        )

    contents = await _read_capped(upload, 25 * 1024 * 1024)  # (AP-SEC-011)

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    suffix = _get_audio_suffix(upload.filename, content_type)
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(contents)
            temp_path = temp.name

        result = await asyncio.wait_for(
            asyncio.to_thread(_transcribe_with_whisper, temp_path),
            timeout=TRANSCRIPTION_TIMEOUT_SECONDS,
        )

        return {
            "text": result["text"],
            "language": "en",
        }

    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Audio transcription timed out",
        ) from exc
    except HTTPException:
        raise
    except (TimeoutError, ValueError) as exc:
        logger.warning(
            "Temporary audio processing failed (%s): %s",
            type(exc).__name__,
            str(exc),
        )
        raise HTTPException(
            status_code=400,
            detail="Audio could not be processed. Check the recording and try again.",
        ) from exc
    except Exception as e:
        logger.exception("Whisper transcription failed for temporary audio upload")
        raise HTTPException(
            status_code=500,
            detail="Audio transcription failed. Please try again.",
        ) from e

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/files")
@limiter.limit("30/minute")
async def list_uploaded_files(
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    files = (
        db.query(UploadedFile)
        .filter(UploadedFile.tenant_id == current_user.tenant_id)
        .order_by(UploadedFile.created_at.desc())
        .all()
    )

    base_url = str(request.base_url).rstrip("/")
    return [
        {
            "id": str(f.id),
            "filename": f.filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "upload_type": f.upload_type,
            "extracted_text": f.extracted_text,
            "file_url": _signed_download_url(base_url, f.id),
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    token: str = "",
    db: Session = Depends(get_db),
):
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID format")

    # Require a valid short-lived signed token issued by an authenticated
    # listing/upload response for this file. (AP-SEC-007)
    if not token or not _verify_download_token(token, str(file_uuid)):
        raise HTTPException(status_code=403, detail="Invalid or expired download link")

    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_uuid).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(db_file.filename)[1]
    stored_name = f"{db_file.id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=filepath,
        filename=db_file.filename,
        media_type=db_file.content_type,
    )


@router.delete("/{file_id}")
@limiter.limit("10/minute")
async def delete_file(
    request: Request,
    file_id: str,
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    print(
        f"[DEBUG_DELETE] Incoming delete request: file_id={file_id}, user={current_user.email}, tenant={current_user.tenant_id}"
    )
    try:
        file_uuid = uuid.UUID(file_id)
        print(f"[DEBUG_DELETE] Successfully parsed UUID: {file_uuid}")
    except ValueError:
        print(f"[DEBUG_DELETE] Failed to parse UUID from: {file_id}")
        raise HTTPException(status_code=400, detail="Invalid file ID format")

    db_file = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.id == file_uuid,
            UploadedFile.tenant_id == current_user.tenant_id,
        )
        .first()
    )

    if not db_file:
        print(f"[DEBUG_DELETE] File not found in DB: id={file_uuid}, tenant={current_user.tenant_id}")
        raise HTTPException(status_code=404, detail="File not found")

    print(f"[DEBUG_DELETE] Found file in DB: filename={db_file.filename}")
    ext = os.path.splitext(db_file.filename)[1]
    stored_name = f"{db_file.id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)
    print(f"[DEBUG_DELETE] Looking for file on disk at: {filepath}")

    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            print("[DEBUG_DELETE] Successfully deleted file from disk")
        except Exception as e:
            print(f"[DEBUG_DELETE] Failed to delete file from disk: {e}")
    else:
        print("[DEBUG_DELETE] File was not found on disk, skipping disk delete")

    db.delete(db_file)
    db.commit()
    print("[DEBUG_DELETE] Successfully deleted database record")

    return {"success": True, "message": "File deleted successfully"}
