"""
routes/uploads.py
Whisper-only file and audio upload endpoints.
"""

import os
import uuid
import tempfile
import traceback
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Form
from fastapi.responses import FileResponse
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

LANGUAGE_MAP = {
    "auto": None,
    "english": "en",
    "hindi": "hi",
    "telugu": "te",
    "en": "en",
    "hi": "hi",
    "te": "te",
}

WHISPER_CACHE_DIR = os.path.join(UPLOAD_DIR, "whisper_cache")
os.makedirs(WHISPER_CACHE_DIR, exist_ok=True)

_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        import whisper

        # Cache the Whisper model weights in the mounted uploads store so they persist across container rebuilds
        _whisper_model = whisper.load_model("base", download_root=WHISPER_CACHE_DIR)
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


def _transcribe_with_whisper(audio_path: str, language: str = "auto") -> dict:
    lang_code = LANGUAGE_MAP.get((language or "auto").lower(), None)
    model = get_whisper_model()

    result = model.transcribe(
        audio_path,
        language=lang_code,
        task="transcribe",
        fp16=False,
        temperature=0,
        condition_on_previous_text=False,
        initial_prompt="This audio may contain English, Hindi, or Telugu.",
    )

    return {
        "text": result.get("text", "").strip(),
        "language": result.get("language"),
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

    base_url = str(request.base_url).rstrip('/')
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

        base_url = str(request.base_url).rstrip('/')
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
    language: str = Form("auto"),
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
    ext = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    stored_name = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    with open(filepath, "wb") as f:
        f.write(contents)

    try:
        result = await run_in_threadpool(_transcribe_with_whisper, filepath, language)
        transcript = result["text"]
        detected_language = result["language"]

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {repr(e)}",
        )

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

    base_url = str(request.base_url).rstrip('/')
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
    language: str = Form("auto"),
    current_user: UserProfile = Depends(get_current_user),
):
    contents = await audio.read()

    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25 MB)")

    suffix = os.path.splitext(audio.filename or "recording.webm")[1] or ".webm"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(contents)
            temp_path = temp.name

        result = await run_in_threadpool(_transcribe_with_whisper, temp_path, language)

        return {
            "text": result["text"],
            "language": result["language"],
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {repr(e)}",
        )

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

    base_url = str(request.base_url).rstrip('/')
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
    print(f"[DEBUG_DELETE] Incoming delete request: file_id={file_id}, user={current_user.email}, tenant={current_user.tenant_id}")
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
