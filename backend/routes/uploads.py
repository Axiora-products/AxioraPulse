"""
routes/uploads.py
Whisper-only file and audio upload endpoints.
"""

import asyncio
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.database import get_db
from db.models import UserProfile, UploadedFile
from dependencies import get_current_user
from core.rate_limiter import limiter

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from fastapi.concurrency import run_in_threadpool

router = APIRouter(prefix="/uploads", tags=["uploads"])
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.INFO)

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "uploaded_files_store",
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_FILE_TYPES = {
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "image/png",
    "image/jpeg",
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
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small").strip() or "small"
MAX_AUDIO_DURATION_SECONDS = 30
TRANSCRIPTION_TIMEOUT_SECONDS = 90

_whisper_model = None
_whisper_model_lock = threading.Lock()
_whisper_transcription_lock = threading.Lock()


def _get_memory_usage() -> dict[str, int | None]:
    memory = {
        "rss_kb": None,
        "peak_rss_kb": None,
        "cgroup_current_bytes": None,
        "cgroup_peak_bytes": None,
    }

    try:
        with open("/proc/self/status", "r", encoding="utf-8") as status_file:
            for line in status_file:
                if line.startswith("VmRSS:"):
                    memory["rss_kb"] = int(line.split()[1])
                elif line.startswith("VmHWM:"):
                    memory["peak_rss_kb"] = int(line.split()[1])
    except (OSError, ValueError):
        pass

    for key, path in (
        ("cgroup_current_bytes", "/sys/fs/cgroup/memory.current"),
        ("cgroup_peak_bytes", "/sys/fs/cgroup/memory.peak"),
    ):
        try:
            with open(path, "r", encoding="utf-8") as memory_file:
                memory[key] = int(memory_file.read().strip())
        except (OSError, ValueError):
            pass

    return memory


def _ensure_ffmpeg_available() -> str:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise HTTPException(
            status_code=500,
            detail="FFmpeg is not available in PATH. Please install FFmpeg and restart backend.",
        )
    logger.info("FFmpeg executable available: %s", ffmpeg_path)
    return ffmpeg_path


def _convert_to_wav(input_path: str) -> str:
    ffmpeg_path = _ensure_ffmpeg_available()
    output_path = input_path + ".wav"
    command = [
        ffmpeg_path,
        "-y",
        "-i",
        input_path,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        output_path,
    ]
    print("FFmpeg conversion command:", " ".join(command))

    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        error_message = (exc.stderr or str(exc)).strip()
        raise RuntimeError(f"FFmpeg audio conversion failed: {error_message}") from exc

    if not os.path.isfile(output_path):
        raise RuntimeError(f"FFmpeg did not create the expected WAV file: {output_path}")

    logger.info(
        "FFmpeg conversion succeeded: return_code=%s output=%s size=%s",
        completed.returncode,
        output_path,
        os.path.getsize(output_path),
    )
    return output_path


def _get_audio_duration(wav_path: str) -> float:
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        raise HTTPException(
            status_code=500,
            detail="FFprobe is not available in PATH. Please install FFmpeg and restart backend.",
        )

    command = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        wav_path,
    ]

    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
        duration = float(completed.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as exc:
        raise RuntimeError("Unable to determine audio duration.") from exc

    logger.info("Converted audio duration: %.3f seconds", duration)
    if duration > MAX_AUDIO_DURATION_SECONDS:
        raise HTTPException(
            status_code=400,
            detail="Audio too long. Please record under 30 seconds.",
        )
    return duration


def _get_audio_suffix(filename: str | None, content_type: str | None) -> str:
    filename_suffix = os.path.splitext(filename or "")[1].lower()
    if filename_suffix in ALLOWED_AUDIO_SUFFIXES:
        return filename_suffix

    return AUDIO_SUFFIX_BY_CONTENT_TYPE.get(
        (content_type or "").lower(),
        ".webm",
    )


def get_whisper_model():
    global _whisper_model

    if _whisper_model is None:
        with _whisper_model_lock:
            if _whisper_model is None:
                try:
                    import whisper
                except ImportError as exc:
                    raise RuntimeError("Whisper is not installed. Install backend requirements.") from exc

                checkpoint_path = os.path.join(
                    WHISPER_CACHE_DIR,
                    f"{WHISPER_MODEL}.pt",
                )
                logger.info(
                    "Loading Whisper model: name=%s cache=%s checkpoint_exists=%s memory=%s",
                    WHISPER_MODEL,
                    WHISPER_CACHE_DIR,
                    os.path.isfile(checkpoint_path),
                    _get_memory_usage(),
                )
                try:
                    _whisper_model = whisper.load_model(
                        WHISPER_MODEL,
                        download_root=WHISPER_CACHE_DIR,
                    )
                except Exception:
                    logger.exception(
                        "Whisper model loading failed: name=%s cache=%s",
                        WHISPER_MODEL,
                        WHISPER_CACHE_DIR,
                    )
                    raise

                logger.info(
                    "Whisper model loaded successfully: name=%s checkpoint=%s memory=%s",
                    WHISPER_MODEL,
                    checkpoint_path,
                    _get_memory_usage(),
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


def _validate_repetition(text: str) -> None:
    if not text.strip():
        print("Repetition validation result: valid=False empty_transcription=True")
        raise HTTPException(
            status_code=422,
            detail="Low-confidence transcription detected. Please retry.",
        )

    words = [
        word
        for word in re.findall(r"[^\W\d_]+", text.casefold(), flags=re.UNICODE)
        if word
    ]

    repeated = False
    for phrase_length in range(1, min(6, len(words) + 1)):
        for start in range(0, len(words) - phrase_length * 11 + 1):
            phrase = words[start:start + phrase_length]
            if all(
                words[start + repeat * phrase_length:start + (repeat + 1) * phrase_length] == phrase
                for repeat in range(1, 11)
            ):
                repeated = True
                break
        if repeated:
            break

    print("Repetition validation result:", f"valid={not repeated}")
    if repeated:
        raise HTTPException(
            status_code=422,
            detail="Low-confidence transcription detected. Please retry.",
        )


def _transcribe_with_whisper(audio_path: str) -> dict:
    _ensure_ffmpeg_available()

    if not os.path.isfile(audio_path):
        raise FileNotFoundError(f"Audio file does not exist before transcription: {audio_path}")

    model = _get_whisper_model()
    logger.info(
        "Waiting for Whisper inference lock: audio=%s size=%s memory=%s",
        audio_path,
        os.path.getsize(audio_path),
        _get_memory_usage(),
    )

    started_at = time.monotonic()
    with _whisper_transcription_lock:
        logger.info(
            "Whisper transcription started: audio=%s model=%s memory=%s",
            audio_path,
            WHISPER_MODEL,
            _get_memory_usage(),
        )
        result = model.transcribe(
            audio_path,
            language=None,
            task="translate",
            fp16=False,
            temperature=0,
            condition_on_previous_text=False,
        )

    final_text = result.get("text", "").strip()
    logger.info(
        "Whisper transcription completed: elapsed=%.3fs text_length=%s memory=%s",
        time.monotonic() - started_at,
        len(final_text),
        _get_memory_usage(),
    )
    _validate_repetition(final_text)

    return {
        "text": final_text,
        "language": "en",
    }


async def _transcribe_with_timeout(audio_path: str) -> dict:
    started_at = time.monotonic()
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_transcribe_with_whisper, audio_path),
            timeout=TRANSCRIPTION_TIMEOUT_SECONDS,
        )
        logger.info(
            "Transcription finished before timeout: elapsed=%.3fs timeout=%ss",
            time.monotonic() - started_at,
            TRANSCRIPTION_TIMEOUT_SECONDS,
        )
        return result
    except asyncio.TimeoutError as exc:
        logger.exception(
            "Transcription timed out: elapsed=%.3fs timeout=%ss audio=%s",
            time.monotonic() - started_at,
            TRANSCRIPTION_TIMEOUT_SECONDS,
            audio_path,
        )
        raise HTTPException(
            status_code=504,
            detail="Transcription timed out. Please try a shorter/clearer recording.",
        ) from exc


@router.post("/file")
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}",
        )

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    with open(filepath, "wb") as f:
        f.write(contents)

    extracted = _extract_text_from_file(filepath, file.content_type)

    db_file = UploadedFile(
        id=uuid.UUID(file_id),
        filename=file.filename or "Untitled",
        content_type=file.content_type,
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
        "file_url": f"{base_url}/uploads/download/{db_file.id}",
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
            "file_url": f"{base_url}/uploads/download/{db_file.id}",
        }

    except Exception as e:
        print(f"Drive upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Google Drive error: {str(e)}")


@router.post("/audio")
@limiter.limit("5/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    print("Audio content type:", file.content_type)

    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {file.content_type}",
        )

    contents = await file.read()
    print("Audio byte size:", len(contents))
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25 MB)")

    file_id = str(uuid.uuid4())
    ext = _get_audio_suffix(file.filename, file.content_type)
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    with open(filepath, "wb") as f:
        f.write(contents)

    wav_path = None
    try:
        wav_path = await run_in_threadpool(_convert_to_wav, filepath)
        await run_in_threadpool(_get_audio_duration, wav_path)
        result = await _transcribe_with_timeout(wav_path)
        transcript = result["text"]
        detected_language = result["language"]

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Whisper transcription failed for uploaded audio")
        raise HTTPException(
            status_code=500,
            detail=f"Audio transcription failed: {str(e)}",
        ) from e
    finally:
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)

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
        "file_url": f"{base_url}/uploads/download/{db_file.id}",
    }


@router.post("/audio/transcribe")
@limiter.limit("5/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_user),
):
    request_id = uuid.uuid4().hex[:12]
    temp_path = None
    wav_path = None
    started_at = time.monotonic()

    try:
        contents = await audio.read()
        logger.info(
            "[%s] Audio transcription upload received: filename=%s size=%s mime_type=%s",
            request_id,
            audio.filename,
            len(contents),
            audio.content_type,
        )

        if audio.content_type not in ALLOWED_AUDIO_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio type: {audio.content_type}",
            )

        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

        if len(contents) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Audio file too large (max 25 MB)")

        suffix = _get_audio_suffix(audio.filename, audio.content_type)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(contents)
            temp_path = temp.name

        logger.info(
            "[%s] Temporary audio file created: path=%s exists=%s size=%s",
            request_id,
            temp_path,
            os.path.isfile(temp_path),
            os.path.getsize(temp_path),
        )

        wav_path = await run_in_threadpool(_convert_to_wav, temp_path)
        logger.info(
            "[%s] Converted WAV verified: path=%s exists=%s size=%s",
            request_id,
            wav_path,
            os.path.isfile(wav_path),
            os.path.getsize(wav_path),
        )
        duration = await run_in_threadpool(_get_audio_duration, wav_path)
        logger.info("[%s] Audio duration verified: %.3f seconds", request_id, duration)
        result = await _transcribe_with_timeout(wav_path)

        logger.info(
            "[%s] Audio transcription request completed: elapsed=%.3fs memory=%s",
            request_id,
            time.monotonic() - started_at,
            _get_memory_usage(),
        )
        return {
            "text": result["text"],
            "language": result["language"],
        }

    except HTTPException as exc:
        if exc.status_code < 500:
            raise

        logger.exception(
            "[%s] Audio transcription HTTP failure: status=%s detail=%s",
            request_id,
            exc.status_code,
            exc.detail,
        )
        error_code = (
            "transcription_timeout"
            if exc.status_code == 504
            else "transcription_failed"
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": error_code, "detail": str(exc.detail)},
        )
    except Exception:
        logger.exception(
            "[%s] Audio transcription failed: filename=%s mime_type=%s "
            "temp_path=%s wav_path=%s elapsed=%.3fs memory=%s",
            request_id,
            audio.filename,
            audio.content_type,
            temp_path,
            wav_path,
            time.monotonic() - started_at,
            _get_memory_usage(),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "transcription_failed",
                "detail": "Audio transcription failed. See backend logs for details.",
            },
        )

    finally:
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)
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
            "file_url": f"{base_url}/uploads/download/{f.id}",
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    db: Session = Depends(get_db),
):
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file ID format")

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
