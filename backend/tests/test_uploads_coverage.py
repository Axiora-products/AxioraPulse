"""Targeted coverage tests for routes/uploads.py.

These exercise the still-uncovered helper branches, the link-extraction endpoint,
the Google Drive failure path, and the signed-download token rejection branch.
"""

import asyncio
import io

import pytest
from fastapi.testclient import TestClient

from app.main import app
from routes import uploads as uploads_module
from routes.uploads import (
    _make_download_token,
    _read_capped,
    _validate_magic,
    _verify_download_token,
)
from services.content_extraction import ExtractionError, ExtractionResult

client = TestClient(app)


# ── _verify_download_token: JWTError branch (lines 70-71) ───────────────────────
def test_verify_download_token_rejects_garbage():
    # A non-JWT string makes jwt.decode raise JWTError -> the except returns False.
    assert _verify_download_token("not-a-real-jwt", "any-file-id") is False


def test_verify_download_token_accepts_matching_token():
    token = _make_download_token("11111111-1111-1111-1111-111111111111")
    assert _verify_download_token(token, "11111111-1111-1111-1111-111111111111") is True
    # Scope/fid mismatch path: valid signature but wrong file id.
    assert _verify_download_token(token, "22222222-2222-2222-2222-222222222222") is False


# ── _read_capped: over-limit abort (line 94) ────────────────────────────────────
class _FakeUploadFile:
    """Minimal async-read stand-in for starlette's UploadFile."""

    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)

    async def read(self, size: int = -1) -> bytes:
        return self._buf.read(size)


def test_read_capped_raises_when_too_large():
    # Two chunks worth of data with a 1-byte cap forces the >max_bytes branch.
    fake = _FakeUploadFile(b"abcdef")
    with pytest.raises(uploads_module.HTTPException) as exc:
        asyncio.run(_read_capped(fake, max_bytes=1))
    assert exc.value.status_code == 413
    assert "too large" in exc.value.detail.lower()


def test_read_capped_returns_full_contents_under_limit():
    fake = _FakeUploadFile(b"hello world")
    result = asyncio.run(_read_capped(fake, max_bytes=1024))
    assert result == b"hello world"


# ── _validate_magic: signature lookup / mismatch / webp marker (lines 122-129) ──
def test_validate_magic_unknown_content_type_is_allowed():
    # No signature registered for this type -> early return (lines 122-124).
    _validate_magic(b"anything at all", "application/json")


def test_validate_magic_rejects_mismatched_signature():
    # Declared PDF but the bytes are not a PDF header (lines 126-127).
    with pytest.raises(uploads_module.HTTPException) as exc:
        _validate_magic(b"<html>not a pdf</html>", "application/pdf")
    assert exc.value.status_code == 400


def test_validate_magic_accepts_valid_pdf_signature():
    _validate_magic(b"%PDF-1.7 rest of file", "application/pdf")


def test_validate_magic_image_type_no_longer_recognized():
    # Image types were removed from the allowlist/signatures; _validate_magic now
    # treats them as unknown (no signature) and returns without raising.
    _validate_magic(b"RIFF\x00\x00\x00\x00WEBP", "image/webp")


# ── upload_file: magic mismatch -> audit + re-raise (lines 456-457, 466) ────────
def test_upload_file_magic_mismatch_is_audited_and_rejected(auth_headers):
    # Declared as PDF but the content is not -> _validate_magic raises HTTPException,
    # which is caught, audited, and re-raised by the endpoint.
    bad_pdf = io.BytesIO(b"<html>definitely not a pdf</html>")
    response = client.post(
        "/uploads/file",
        files={"file": ("evil.pdf", bad_pdf, "application/pdf")},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]


# ── extract_link endpoint (lines 528-533, 535-538, 547-550, 553, 563-568) ───────
def test_extract_link_empty_url_returns_422(auth_headers):
    # Empty url -> 422 short-circuit (lines 529-531).
    response = client.post("/uploads/link", json={"url": "   "}, headers=auth_headers)
    assert response.status_code == 422
    assert "website link" in response.json()["detail"].lower()


def test_extract_link_success_prepends_scheme_and_persists(auth_headers, monkeypatch):
    # No scheme -> "https://" is prepended (lines 532-533); successful extraction
    # persists the link row and returns the payload (lines 535-536, 553, 563-568).
    captured = {}

    def fake_extract(url):
        captured["url"] = url
        return ExtractionResult(text="Extracted page text", confidence=90, source=url)

    monkeypatch.setattr(uploads_module, "extract_from_url", fake_extract)

    response = client.post("/uploads/link", json={"url": "example.com/page"}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert captured["url"] == "https://example.com/page"
    assert data["upload_type"] == "link"
    assert data["extracted_text"] == "Extracted page text"
    assert data["source"] == "https://example.com/page"
    assert "id" in data


def test_extract_link_extraction_error_is_audited_and_422(auth_headers, monkeypatch):
    # ExtractionError -> audit + 422 (lines 537-538, 547).
    def fake_extract(url):
        raise ExtractionError("That website link cannot be processed.")

    monkeypatch.setattr(uploads_module, "extract_from_url", fake_extract)

    response = client.post("/uploads/link", json={"url": "https://blocked.example"}, headers=auth_headers)
    assert response.status_code == 422
    assert "cannot be processed" in response.json()["detail"]


def test_extract_link_unexpected_error_returns_502(auth_headers, monkeypatch):
    # Any other exception -> generic 502 without leaking detail (lines 548-550).
    def fake_extract(url):
        raise RuntimeError("boom internal detail")

    monkeypatch.setattr(uploads_module, "extract_from_url", fake_extract)

    response = client.post("/uploads/link", json={"url": "https://flaky.example"}, headers=auth_headers)
    assert response.status_code == 502
    assert "could not read that website link" in response.json()["detail"].lower()
    assert "boom internal detail" not in response.json()["detail"]


# ── download_file: token rejection branch (line 880) ────────────────────────────
def test_download_missing_token_is_rejected(auth_headers):
    # Valid UUID format but no token -> 403 (the `not token` half of line 879).
    file_id = "33333333-3333-3333-3333-333333333333"
    response = client.get(f"/uploads/download/{file_id}", headers=auth_headers)
    assert response.status_code == 403
    assert "Invalid or expired download link" in response.json()["detail"]


def test_download_invalid_token_is_rejected(auth_headers):
    # Valid UUID format but a bogus token -> _verify_download_token False -> 403.
    file_id = "44444444-4444-4444-4444-444444444444"
    response = client.get(f"/uploads/download/{file_id}?token=bogus", headers=auth_headers)
    assert response.status_code == 403
    assert "Invalid or expired download link" in response.json()["detail"]
