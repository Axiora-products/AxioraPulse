"""Unit tests for services.content_extraction.

Pure, DB-free extraction logic. Real in-memory fixtures are used where a parser is
available (txt/csv/xlsx/docx); pypdf, sockets and requests are mocked to exercise
the branch logic deterministically and without network access. (Image OCR removed.)
"""

import io

import pytest

from services import content_extraction as ce


# ── sanitize_extracted / _text_confidence ──────────────────────────────────────
def test_sanitize_extracted_empty():
    assert ce.sanitize_extracted("") == ("", False)


def test_sanitize_extracted_strips_control_and_truncates():
    text = "Hello\x00World​\nLine2"
    clean, truncated = ce.sanitize_extracted(text)
    assert "\x00" not in clean and "​" not in clean
    assert "Hello" in clean and "Line2" in clean
    assert truncated is False

    long_text = "a" * (ce.MAX_CHARS + 50)
    clean, truncated = ce.sanitize_extracted(long_text)
    assert truncated is True
    assert len(clean) == ce.MAX_CHARS


def test_text_confidence_tiers():
    assert ce._text_confidence("") == 0
    assert ce._text_confidence("x", structured=True) == 96
    assert ce._text_confidence("a" * 500) == 95
    assert ce._text_confidence("a" * 200) == 86
    assert ce._text_confidence("a" * 50) == 72
    assert ce._text_confidence("short") == 45


# ── PDF ─────────────────────────────────────────────────────────────────────────
class _FakePage:
    def __init__(self, text):
        self._text = text

    def extract_text(self):
        return self._text


class _FakeReader:
    def __init__(self, _stream):
        self.pages = [_FakePage("Hello from page one with enough text to score."), _FakePage("Second page content.")]


def test_extract_pdf_happy(monkeypatch):
    import pypdf

    monkeypatch.setattr(pypdf, "PdfReader", _FakeReader)
    r = ce._extract_pdf(b"%PDF-fake")
    assert r.source == "pdf"
    assert "page one" in r.text
    assert r.confidence > 0


def test_extract_pdf_no_text(monkeypatch):
    import pypdf

    class _EmptyReader:
        def __init__(self, _s):
            self.pages = [_FakePage(""), _FakePage("   ")]

    monkeypatch.setattr(pypdf, "PdfReader", _EmptyReader)
    r = ce._extract_pdf(b"%PDF-fake")
    assert r.text == ""
    assert r.confidence == 25
    assert any("scanned PDF" in w for w in r.warnings)


def test_extract_pdf_corrupt():
    r = ce._extract_pdf(b"not a pdf at all")
    assert r.source == "pdf"
    assert any("could not read this PDF" in w for w in r.warnings)


# ── DOCX ─────────────────────────────────────────────────────────────────────────
def test_extract_docx_happy():
    docx = pytest.importorskip("docx")
    doc = docx.Document()
    doc.add_paragraph("First paragraph with some readable content here.")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Cell A"
    table.rows[0].cells[1].text = "Cell B"
    buf = io.BytesIO()
    doc.save(buf)
    r = ce._extract_docx(buf.getvalue())
    assert r.source == "word"
    assert "First paragraph" in r.text
    assert "Cell A | Cell B" in r.text


def test_extract_docx_corrupt():
    r = ce._extract_docx(b"garbage-not-a-docx")
    assert any("Word document" in w for w in r.warnings)


# ── XLSX ─────────────────────────────────────────────────────────────────────────
def test_extract_xlsx_happy():
    openpyxl = pytest.importorskip("openpyxl")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["Name", "Score"])
    ws.append(["Alice", 10])
    buf = io.BytesIO()
    wb.save(buf)
    r = ce._extract_xlsx(buf.getvalue())
    assert r.source == "spreadsheet"
    assert "# Sheet: Data" in r.text
    assert "Alice" in r.text
    assert r.confidence == 96  # structured


def test_extract_xlsx_corrupt():
    r = ce._extract_xlsx(b"garbage-not-a-xlsx")
    assert any("spreadsheet" in w for w in r.warnings)


# ── CSV / TXT ────────────────────────────────────────────────────────────────────
def test_extract_csv_happy():
    r = ce._extract_csv(b"name,score\nAlice,10\nBob,20\n")
    assert r.source == "spreadsheet"
    assert "name | score" in r.text
    assert "Alice | 10" in r.text


def test_extract_csv_empty():
    r = ce._extract_csv(b"\n\n")
    assert r.text == ""
    assert any("No rows" in w for w in r.warnings)


def test_extract_txt_utf8():
    r = ce._extract_txt("Plain text content.".encode("utf-8"))
    assert r.source == "text"
    assert r.text == "Plain text content."
    assert r.confidence == 97


def test_extract_txt_invalid_bytes():
    r = ce._extract_txt(b"valid \xff\xfe bytes")
    assert r.confidence == 80
    assert any("could not be decoded" in w for w in r.warnings)


# ── Dispatcher ───────────────────────────────────────────────────────────────────
def test_extract_from_document_dispatch():
    assert ce.extract_from_document(b"text", "text/plain").source == "text"
    assert ce.extract_from_document(b"a,b\n1,2", "text/csv").source == "spreadsheet"
    assert ce.extract_from_document(b"x", "", "notes.csv").source == "spreadsheet"
    unsupported = ce.extract_from_document(b"x", "application/zip", "a.zip")
    assert unsupported.source == "file"
    assert any("not supported" in w for w in unsupported.warnings)


def test_dispatch_routes_by_content_type(monkeypatch):
    seen = {}

    def fake(name):
        def _inner(data):
            seen["called"] = name
            return ce.ExtractionResult(source=name)

        return _inner

    monkeypatch.setattr(ce, "_extract_pdf", fake("pdf"))
    monkeypatch.setattr(ce, "_extract_docx", fake("word"))
    monkeypatch.setattr(ce, "_extract_xlsx", fake("xlsx"))

    assert ce.extract_from_document(b"", "application/pdf").source == "pdf"
    assert (
        ce.extract_from_document(b"", "application/vnd.openxmlformats-officedocument.wordprocessingml.document").source
        == "word"
    )
    assert (
        ce.extract_from_document(b"", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").source
        == "xlsx"
    )
    # Images are no longer supported (OCR removed) — they fall through to "file".
    assert ce.extract_from_document(b"\x89PNG\r\n", "image/png", "shot.png").source == "file"


# ── SSRF guard ───────────────────────────────────────────────────────────────────
def _addrinfo(ip):
    return [(2, 1, 6, "", (ip, 80))]


def test_assert_safe_url_rejects_bad_scheme():
    with pytest.raises(ce.ExtractionError):
        ce._assert_safe_url("ftp://example.com")


def test_assert_safe_url_rejects_missing_host():
    with pytest.raises(ce.ExtractionError):
        ce._assert_safe_url("http:///path")


def test_assert_safe_url_rejects_bad_port():
    with pytest.raises(ce.ExtractionError):
        ce._assert_safe_url("http://example.com:8080/")


def test_assert_safe_url_rejects_private_ip(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("10.0.0.1"))
    with pytest.raises(ce.ExtractionError):
        ce._assert_safe_url("http://internal.example.com")


def test_assert_safe_url_allows_public_ip(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))
    ce._assert_safe_url("https://example.com")  # no raise


def test_assert_safe_url_unresolvable(monkeypatch):
    def boom(*a, **k):
        raise OSError("nxdomain")

    monkeypatch.setattr(ce.socket, "getaddrinfo", boom)
    with pytest.raises(ce.ExtractionError):
        ce._assert_safe_url("http://does-not-exist.example")


# ── _fetch_html / extract_from_url ──────────────────────────────────────────────
class _FakeResp:
    def __init__(self, status_code=200, headers=None, content=b"", encoding="utf-8"):
        self.status_code = status_code
        self.headers = headers or {}
        self._content = content
        self.encoding = encoding

    def raise_for_status(self):
        if self.status_code >= 400:
            raise ce.requests.HTTPError("bad status")

    def iter_content(self, chunk_size):
        yield self._content


def test_fetch_html_follows_redirect_then_reads(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))

    calls = {"n": 0}

    def fake_get(url, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _FakeResp(302, headers={"location": "https://example.com/final"})
        return _FakeResp(200, headers={"content-type": "text/html"}, content=b"<html><body>Hi</body></html>")

    monkeypatch.setattr(ce.requests, "get", fake_get)
    html = ce._fetch_html("https://example.com/start")
    assert "Hi" in html
    assert calls["n"] == 2


def test_fetch_html_rejects_non_html(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))
    monkeypatch.setattr(
        ce.requests, "get", lambda url, **k: _FakeResp(200, headers={"content-type": "application/json"})
    )
    with pytest.raises(ce.ExtractionError):
        ce._fetch_html("https://example.com")


def test_extract_from_url_parses_page(monkeypatch):
    html = """
    <html><head><title>My Page</title>
    <meta name="description" content="A description of the page."></head>
    <body><main><h1>Heading One</h1><p>%s</p></main></body></html>
    """ % ("Body content. " * 40)
    monkeypatch.setattr(ce, "_fetch_html", lambda url: html)
    r = ce.extract_from_url("https://example.com")
    assert "Page title: My Page" in r.text
    assert "Description: A description" in r.text
    assert "Heading One" in r.text
    assert r.confidence > 0


# ── is_loadable_image ───────────────────────────────────────────────────────────
def test_is_loadable_image_rejects_empty():
    assert ce.is_loadable_image("") is False
    assert ce.is_loadable_image(None) is False


def test_is_loadable_image_rejects_unsafe(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("127.0.0.1"))
    assert ce.is_loadable_image("http://localhost/x.png") is False


def test_is_loadable_image_content_type(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))
    monkeypatch.setattr(ce.requests, "head", lambda url, **k: _FakeResp(200, headers={"content-type": "image/png"}))
    assert ce.is_loadable_image("https://example.com/pic.png") is True


def test_is_loadable_image_head_rejected_then_get(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))
    monkeypatch.setattr(ce.requests, "head", lambda url, **k: _FakeResp(403))
    monkeypatch.setattr(ce.requests, "get", lambda url, **k: _FakeResp(200, headers={"content-type": "image/jpeg"}))
    assert ce.is_loadable_image("https://example.com/pic") is True


def test_is_loadable_image_by_extension(monkeypatch):
    monkeypatch.setattr(ce.socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34"))
    monkeypatch.setattr(
        ce.requests, "head", lambda url, **k: _FakeResp(200, headers={"content-type": "application/octet-stream"})
    )
    assert ce.is_loadable_image("https://example.com/pic.webp") is True
    assert ce.is_loadable_image("https://example.com/notimage") is False
