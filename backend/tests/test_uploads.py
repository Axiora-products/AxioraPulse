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

    response = client.post(
        "/uploads/audio",
        files={"file": ("recording.mp3", audio_obj, "audio/mp3")},
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


def test_get_files(auth_headers):
    response = client.get("/uploads/files", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_download_file(auth_headers):
    # Upload text file first
    file_content = b"Content for testing file download endpoint."
    file_obj = io.BytesIO(file_content)

    response = client.post("/uploads/file", files={"file": ("download_test.txt", file_obj, "text/plain")}, headers=auth_headers)
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

    response = client.post("/uploads/file", files={"file": ("delete_test.txt", file_obj, "text/plain")}, headers=auth_headers)
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


