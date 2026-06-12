from fastapi.testclient import TestClient
from app.main import app
import io

client = TestClient(app)


def test_upload_file(auth_headers):
    # Upload text file
    file_content = b"This is some mock text file content for testing."
    file_obj = io.BytesIO(file_content)

    response = client.post("/uploads/file", files={"file": ("test.txt", file_obj, "text/plain")}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "test.txt"
    assert data["content_type"] == "text/plain"
    assert data["extracted_text"] == "This is some mock text file content for testing."


def test_upload_invalid_file_type(auth_headers):
    # Upload an unsupported file type
    file_content = b"<html>some html</html>"
    file_obj = io.BytesIO(file_content)

    response = client.post("/uploads/file", files={"file": ("test.html", file_obj, "text/html")}, headers=auth_headers)
    assert response.status_code == 400


def test_upload_from_drive(auth_headers):
    payload = {
        "accessToken": "mock-access-token",
        "fileId": "mock-file-id-123",
        "filename": "GoogleDocFeedback.pdf",
        "mimeType": "application/pdf",
    }
    response = client.post("/uploads/drive", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "GoogleDocFeedback.pdf"
    assert "id" in data


def test_upload_audio(auth_headers):
    audio_content = b"dummy audio bytes"
    audio_obj = io.BytesIO(audio_content)

    # Use a filename without an extension to trigger the MIME-type suffix fallback
    response = client.post(
        "/uploads/audio",
        files={"file": ("recording", audio_obj, "audio/wav")},
        data={"language": "english"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert data["text"] == "This is a mocked audio transcription from Whisper."


def test_transcribe_audio(auth_headers):
    audio_content = b"dummy audio bytes"
    audio_obj = io.BytesIO(audio_content)

    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "auto"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert data["text"] == "This is a mocked audio transcription from Whisper."


def test_transcribe_audio_empty(auth_headers):
    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", io.BytesIO(b""), "audio/mp3")},
        data={"language": "auto"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"]


def test_transcribe_audio_invalid_type(auth_headers):
    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", io.BytesIO(b"dummy"), "text/plain")},
        data={"language": "auto"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "Unsupported audio type" in response.json()["detail"]


def test_transcribe_audio_exception(auth_headers, monkeypatch):
    import routes.uploads

    model = routes.uploads.get_whisper_model()

    def mock_transcribe(*args, **kwargs):
        raise Exception("Transcription error")

    monkeypatch.setattr(model, "transcribe", mock_transcribe)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "auto"},
        headers=auth_headers,
    )
    assert response.status_code == 500
    assert "Audio transcription failed" in response.json()["detail"]


def test_upload_audio_exception(auth_headers, monkeypatch):
    import routes.uploads

    model = routes.uploads.get_whisper_model()

    def mock_transcribe(*args, **kwargs):
        raise Exception("Transcription error")

    monkeypatch.setattr(model, "transcribe", mock_transcribe)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio",
        files={"file": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "english"},
        headers=auth_headers,
    )
    assert response.status_code == 500
    assert "Audio transcription failed" in response.json()["detail"]


def test_transcribe_audio_ffmpeg_missing(auth_headers, monkeypatch):
    import routes.uploads
    from fastapi import HTTPException

    def mock_ensure_ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail="FFmpeg is required for audio transcription but was not found.",
        )

    monkeypatch.setattr(
        routes.uploads,
        "_ensure_ffmpeg_available",
        mock_ensure_ffmpeg_available,
    )

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "auto"},
        headers=auth_headers,
    )
    assert response.status_code == 503
    assert "FFmpeg is required" in response.json()["detail"]


def test_get_files(auth_headers):
    response = client.get("/uploads/files", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_download_file(auth_headers):
    # Upload text file first
    file_content = b"Content for testing file download endpoint."
    file_obj = io.BytesIO(file_content)

    response = client.post(
        "/uploads/file", files={"file": ("download_test.txt", file_obj, "text/plain")}, headers=auth_headers
    )
    assert response.status_code == 200
    upload_data = response.json()

    file_id = upload_data["id"]
    assert "file_url" in upload_data
    assert f"/uploads/download/{file_id}" in upload_data["file_url"]

    # Download the file
    response = client.get(f"/uploads/download/{file_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.content == file_content

    # Try downloading with non-existent UUID
    import uuid

    random_id = str(uuid.uuid4())
    response = client.get(f"/uploads/download/{random_id}", headers=auth_headers)
    assert response.status_code == 404

    # Try downloading with invalid UUID format
    response = client.get("/uploads/download/not-a-valid-uuid", headers=auth_headers)
    assert response.status_code == 400


def test_delete_file_endpoint(auth_headers):
    # Upload text file first
    file_content = b"Content for testing file delete endpoint."
    file_obj = io.BytesIO(file_content)

    response = client.post(
        "/uploads/file", files={"file": ("delete_test.txt", file_obj, "text/plain")}, headers=auth_headers
    )
    assert response.status_code == 200
    upload_data = response.json()
    file_id = upload_data["id"]

    # Delete the file
    response = client.delete(f"/uploads/{file_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Try to download the deleted file (should fail with 404)
    response = client.get(f"/uploads/download/{file_id}", headers=auth_headers)
    assert response.status_code == 404

    # Try to delete again (should fail with 404)
    response = client.delete(f"/uploads/{file_id}", headers=auth_headers)
    assert response.status_code == 404

    # Try to delete with invalid UUID format (should fail with 400)
    response = client.delete("/uploads/not-a-valid-uuid", headers=auth_headers)
    assert response.status_code == 400


def test_get_audio_duration_exceptions(monkeypatch):
    import routes.uploads
    import subprocess

    # Test ValueError when ffprobe returns invalid duration
    def mock_run_invalid_duration(*args, **kwargs):
        class MockProcess:
            stdout = "invalid\n"
            stderr = ""
            returncode = 0

        return MockProcess()

    monkeypatch.setattr(subprocess, "run", mock_run_invalid_duration)
    try:
        routes.uploads._get_audio_duration("dummy_path")
        assert False, "Expected ValueError"
    except ValueError as e:
        assert "Could not determine audio duration" in str(e)

    # Test TimeoutExpired
    def mock_run_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=60)

    monkeypatch.setattr(subprocess, "run", mock_run_timeout)
    try:
        routes.uploads._get_audio_duration("dummy_path")
        assert False, "Expected TimeoutError"
    except TimeoutError as e:
        assert "Audio duration check timed out" in str(e)


def test_convert_to_whisper_wav_exceptions(monkeypatch):
    import routes.uploads
    import subprocess

    # Test CalledProcessError
    def mock_run_error(*args, **kwargs):
        raise subprocess.CalledProcessError(returncode=1, cmd=args[0])

    monkeypatch.setattr(subprocess, "run", mock_run_error)
    try:
        routes.uploads._convert_to_whisper_wav("dummy_path", "wav_path")
        assert False, "Expected ValueError"
    except ValueError as e:
        assert "FFmpeg could not decode the uploaded audio" in str(e)

    # Test TimeoutExpired
    def mock_run_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=60)

    monkeypatch.setattr(subprocess, "run", mock_run_timeout)
    try:
        routes.uploads._convert_to_whisper_wav("dummy_path", "wav_path")
        assert False, "Expected TimeoutError"
    except TimeoutError as e:
        assert "Audio conversion timed out" in str(e)


def test_transcribe_audio_timeout(auth_headers, monkeypatch):
    import asyncio

    async def mock_wait_for(*args, **kwargs):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", mock_wait_for)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "auto"},
        headers=auth_headers,
    )
    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]


def test_upload_audio_timeout(auth_headers, monkeypatch):
    import asyncio

    async def mock_wait_for(*args, **kwargs):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", mock_wait_for)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio",
        files={"file": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "english"},
        headers=auth_headers,
    )
    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]


def test_upload_audio_value_error(auth_headers, monkeypatch):
    import routes.uploads

    def mock_transcribe_error(*args, **kwargs):
        raise ValueError("Invalid audio duration")

    monkeypatch.setattr(routes.uploads, "_transcribe_with_whisper", mock_transcribe_error)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio",
        files={"file": ("recording.mp3", audio_obj, "audio/mp3")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "could not be processed" in response.json()["detail"]


def test_transcribe_audio_value_error(auth_headers, monkeypatch):
    import routes.uploads

    def mock_transcribe_error(*args, **kwargs):
        raise ValueError("Invalid audio duration")

    monkeypatch.setattr(routes.uploads, "_transcribe_with_whisper", mock_transcribe_error)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio/transcribe",
        files={"audio": ("recording.mp3", audio_obj, "audio/mp3")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "could not be processed" in response.json()["detail"]


def test_transcribe_audio_no_file(auth_headers):
    response = client.post(
        "/uploads/audio/transcribe",
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "No audio file uploaded" in response.json()["detail"]
