"""Tests for field-level PII encryption (db/encryption.py)."""

import importlib

from cryptography.fernet import Fernet, MultiFernet


def _reload_with_keys(monkeypatch, keys):
    monkeypatch.setenv("PII_ENCRYPTION_KEYS", keys)
    import core.config as cfg
    importlib.reload(cfg)
    import db.encryption as enc
    importlib.reload(enc)
    enc._get_cipher.cache_clear()
    return enc


def test_roundtrip_and_ciphertext(monkeypatch):
    k = Fernet.generate_key().decode()
    enc = _reload_with_keys(monkeypatch, k)
    t = enc.EncryptedString()
    ct = t.process_bind_param("respondent@example.com", None)
    assert ct != "respondent@example.com"          # stored value is ciphertext
    assert t.process_result_value(ct, None) == "respondent@example.com"


def test_legacy_plaintext_passthrough(monkeypatch):
    k = Fernet.generate_key().decode()
    enc = _reload_with_keys(monkeypatch, k)
    t = enc.EncryptedString()
    # A value written before encryption was enabled is returned as-is.
    assert t.process_result_value("legacy@example.com", None) == "legacy@example.com"


def test_key_rotation(monkeypatch):
    k1 = Fernet.generate_key().decode()
    k2 = Fernet.generate_key().decode()
    # Encrypt with the old key only.
    old = MultiFernet([Fernet(k2.encode())]).encrypt(b"old@example.com").decode()
    # New config: primary k1, secondary k2 — must still decrypt old values.
    enc = _reload_with_keys(monkeypatch, f"{k1},{k2}")
    t = enc.EncryptedString()
    assert t.process_result_value(old, None) == "old@example.com"


def test_passthrough_when_no_key(monkeypatch):
    enc = _reload_with_keys(monkeypatch, "")
    t = enc.EncryptedString()
    assert t.process_bind_param("plain@example.com", None) == "plain@example.com"
    assert t.process_result_value("plain@example.com", None) == "plain@example.com"


def test_none_values(monkeypatch):
    k = Fernet.generate_key().decode()
    enc = _reload_with_keys(monkeypatch, k)
    t = enc.EncryptedString()
    assert t.process_bind_param(None, None) is None
    assert t.process_result_value(None, None) is None
