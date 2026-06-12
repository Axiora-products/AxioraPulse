from fastapi.testclient import TestClient
from app.main import app
import io
import pytest

client = TestClient(app)


def test_whisper_uses_selected_telugu_language(monkeypatch):
    import routes.uploads

    class TeluguWhisperModel:
        kwargs = None

        def transcribe(self, audio_path, **kwargs):
            self.kwargs = kwargs
            return {"text": "ఇది తెలుగు పరీక్ష", "language": "te"}

    model = TeluguWhisperModel()
    monkeypatch.setattr(routes.uploads, "get_whisper_model", lambda: model)

    result = routes.uploads._transcribe_with_whisper("recording.wav", "te")

    assert result == {"text": "ఇది తెలుగు పరీక్ష", "language": "te"}
    assert model.kwargs["language"] == "te"
    assert model.kwargs["task"] == "transcribe"
    assert model.kwargs["fp16"] is False
    assert model.kwargs["temperature"] == 0
    assert model.kwargs["condition_on_previous_text"] is False
    assert "initial_prompt" not in model.kwargs


def test_whisper_rejects_wrong_script_for_selected_telugu(monkeypatch):
    import routes.uploads

    class EnglishWhisperModel:
        def transcribe(self, audio_path, **kwargs):
            return {
                "text": "Hindi output must be Telugu script.",
                "language": "en",
            }

    monkeypatch.setattr(
        routes.uploads,
        "get_whisper_model",
        lambda: EnglishWhisperModel(),
    )

    with pytest.raises(routes.uploads.HTTPException) as exc_info:
        routes.uploads._transcribe_with_whisper("recording.wav", "te")

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == (
        "Selected language output is not valid te script. "
        "Please retry clearly."
    )


def test_whisper_accepts_telugu_mixed_with_english(monkeypatch):
    import routes.uploads

    class MixedWhisperModel:
        def transcribe(self, audio_path, **kwargs):
            return {
                "text": "ఇది Telugu mixed transcription",
                "language": "te",
            }

    monkeypatch.setattr(
        routes.uploads,
        "get_whisper_model",
        lambda: MixedWhisperModel(),
    )

    result = routes.uploads._transcribe_with_whisper("recording.wav", "te")

    assert result["text"] == "ఇది Telugu mixed transcription"


def test_whisper_rejects_devanagari_for_selected_malayalam(monkeypatch):
    import routes.uploads

    class WrongScriptWhisperModel:
        def transcribe(self, audio_path, **kwargs):
            return {"text": "मैने कुछा", "language": "ml"}

    monkeypatch.setattr(
        routes.uploads,
        "get_whisper_model",
        lambda: WrongScriptWhisperModel(),
    )

    with pytest.raises(routes.uploads.HTTPException) as exc_info:
        routes.uploads._transcribe_with_whisper("recording.wav", "ml")

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == (
        "Selected language output is not valid ml script. "
        "Please retry clearly."
    )


def test_whisper_rejects_repeated_hallucination(monkeypatch):
    import routes.uploads

    class RepeatingWhisperModel:
        def transcribe(self, audio_path, **kwargs):
            return {
                "text": "మాట మాట మాట మాట మాట మాట మాట మాట మాట మాట మాట",
                "language": "te",
            }

    monkeypatch.setattr(
        routes.uploads,
        "get_whisper_model",
        lambda: RepeatingWhisperModel(),
    )

    with pytest.raises(routes.uploads.HTTPException) as exc_info:
        routes.uploads._transcribe_with_whisper("recording.wav", "te")

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Low-confidence transcription detected. Please retry."


def test_whisper_rejects_empty_transcription(monkeypatch):
    import routes.uploads

    class EmptyWhisperModel:
        def transcribe(self, audio_path, **kwargs):
            return {"text": "   ", "language": "te"}

    monkeypatch.setattr(
        routes.uploads,
        "get_whisper_model",
        lambda: EmptyWhisperModel(),
    )

    with pytest.raises(routes.uploads.HTTPException) as exc_info:
        routes.uploads._transcribe_with_whisper("recording.wav", "te")

    assert exc_info.value.status_code == 422


def test_whisper_accepts_auto_detected_english(monkeypatch):
    import routes.uploads

    class EnglishWhisperModel:
        def transcribe(self, audio_path, **kwargs):
            return {"text": "This is English speech.", "language": "en"}

    monkeypatch.setattr(
        routes.uploads,
        "get_whisper_model",
        lambda: EnglishWhisperModel(),
    )

    result = routes.uploads._transcribe_with_whisper("recording.wav")

    assert result == {"text": "This is English speech.", "language": "en"}


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
        data={"language": "en"},
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
        raise ValueError("Transcription error")

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
        raise ValueError("Transcription error")

    monkeypatch.setattr(model, "transcribe", mock_transcribe)

    audio_obj = io.BytesIO(b"dummy audio bytes")
    response = client.post(
        "/uploads/audio",
        files={"file": ("recording.mp3", audio_obj, "audio/mp3")},
        data={"language": "en"},
        headers=auth_headers,
    )
    assert response.status_code == 500
    assert "Audio transcription failed" in response.json()["detail"]


def test_transcribe_audio_ffmpeg_missing(auth_headers, monkeypatch):
    import shutil

    monkeypatch.setattr(shutil, "which", lambda cmd: None)

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
