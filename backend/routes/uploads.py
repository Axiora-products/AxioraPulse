"""
routes/uploads.py
Whisper-only file and audio upload endpoints.
"""

import os
import uuid
import tempfile
import asyncio
import logging
import shutil
import subprocess
import threading

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import UserProfile, UploadedFile
from dependencies import get_current_user
from core.rate_limiter import limiter

router = APIRouter(prefix="/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

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
        (content_type or "").lower(),
        ".webm",
    )


def _get_whisper_model():
    global _whisper_model

    if _whisper_model is None:
        with _whisper_model_lock:
            if _whisper_model is None:
                try:
                    import whisper
                except ImportError as exc:
                    raise RuntimeError(
                        "Whisper is not installed. Install backend requirements."
                    ) from exc

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


def _transcribe_with_whisper(audio_path: str) -> dict:
    duration = _get_audio_duration(audio_path)
    if duration <= 0:
        raise ValueError("Uploaded audio has no playable content")
    if duration > MAX_AUDIO_DURATION_SECONDS:
        raise ValueError("Audio is too long (max 10 minutes)")

    with tempfile.TemporaryDirectory() as temp_dir:
        wav_path = os.path.join(temp_dir, "audio.wav")
        _convert_to_whisper_wav(audio_path, wav_path)

        result = _get_whisper_model().transcribe(
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

    return {
        "id": str(db_file.id),
        "filename": db_file.filename,
        "content_type": db_file.content_type,
        "file_size": db_file.file_size,
        "extracted_text": extracted,
        "upload_type": "file",
    }


@router.post("/audio")
@limiter.limit("5/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {file.content_type}",
        )

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25 MB)")

    file_id = str(uuid.uuid4())
    ext = _get_audio_suffix(file.filename, file.content_type)
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

    except asyncio.TimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail="Audio transcription timed out",
        ) from e
    except HTTPException:
        raise
    except (TimeoutError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Whisper transcription failed for uploaded audio")
        raise HTTPException(
            status_code=500,
            detail=f"Audio transcription failed: {str(e)}",
        ) from e

    db_file = UploadedFile(
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

    return {
        "id": str(db_file.id),
        "filename": db_file.filename,
        "content_type": db_file.content_type,
        "file_size": db_file.file_size,
        "extracted_text": transcript,
        "text": transcript,
        "language": detected_language,
        "upload_type": "audio",
    }


@router.post("/audio/transcribe")
async def transcribe_audio(
    request: Request,
    audio: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
):
    print("Transcribe endpoint called")
    print("Content-Type:", request.headers.get("content-type"))
    print("Audio param exists:", audio is not None)
    print("File param exists:", file is not None)

    upload = audio or file
    if not upload:
        raise HTTPException(
            status_code=400,
            detail="No audio file uploaded. Expected form field 'audio'.",
        )

    content_type = (upload.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {upload.content_type}",
        )

    contents = await upload.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25 MB)")

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

    except asyncio.TimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail="Audio transcription timed out",
        ) from e
    except HTTPException:
        raise
    except (TimeoutError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Whisper transcription failed for temporary audio upload")
        raise HTTPException(
            status_code=500,
            detail=f"Audio transcription failed: {str(e)}",
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

    return [
        {
            "id": str(f.id),
            "filename": f.filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "upload_type": f.upload_type,
            "extracted_text": f.extracted_text,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]
