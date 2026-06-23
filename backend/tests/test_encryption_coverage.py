"""Coverage for db.encryption branches (cipher init, prod guards, failure paths)."""

import pytest
from cryptography.fernet import Fernet

from core import config
from db import encryption


@pytest.fixture
def fresh_cipher():
    """Clear the lru_cache around _get_cipher before/after each test (guarded so it
    is safe even when a test monkeypatches _get_cipher to a plain callable)."""
    if hasattr(encryption._get_cipher, "cache_clear"):
        encryption._get_cipher.cache_clear()
    yield
    if hasattr(encryption._get_cipher, "cache_clear"):
        encryption._get_cipher.cache_clear()


def test_no_keys_returns_none(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", [])
    monkeypatch.setattr(config, "IS_PRODUCTION", False)
    assert encryption._get_cipher() is None


def test_no_keys_in_production_logs_and_none(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", [])
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    assert encryption._get_cipher() is None


def test_invalid_keys_dev_returns_none(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", ["not-a-valid-fernet-key"])
    monkeypatch.setattr(config, "IS_PRODUCTION", False)
    assert encryption._get_cipher() is None


def test_invalid_keys_in_production_raises(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", ["not-a-valid-fernet-key"])
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    with pytest.raises(Exception):
        encryption._get_cipher()


def test_roundtrip_with_valid_key(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", [Fernet.generate_key().decode()])
    col = encryption.EncryptedString()
    enc = col.process_bind_param("secret@example.com", None)
    assert enc != "secret@example.com"
    assert col.process_result_value(enc, None) == "secret@example.com"


def test_passthrough_when_disabled(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", [])
    monkeypatch.setattr(config, "IS_PRODUCTION", False)
    col = encryption.EncryptedString()
    assert col.process_bind_param(None, None) is None
    assert col.process_result_value(None, None) is None
    assert col.process_bind_param("plain", None) == "plain"
    assert col.process_result_value("plain", None) == "plain"


def test_decrypt_legacy_plaintext_passthrough(monkeypatch, fresh_cipher):
    monkeypatch.setattr(config, "PII_ENCRYPTION_KEYS", [Fernet.generate_key().decode()])
    col = encryption.EncryptedString()
    # Not valid ciphertext for this key → decrypt fails → returned unchanged.
    assert col.process_result_value("legacy-plaintext-value", None) == "legacy-plaintext-value"


class _BadCipher:
    def encrypt(self, _b):
        raise RuntimeError("boom")


def test_encrypt_failure_dev_passthrough(monkeypatch, fresh_cipher):
    monkeypatch.setattr(encryption, "_get_cipher", lambda: _BadCipher())
    monkeypatch.setattr(config, "IS_PRODUCTION", False)
    col = encryption.EncryptedString()
    assert col.process_bind_param("x", None) == "x"


def test_encrypt_failure_production_raises(monkeypatch, fresh_cipher):
    monkeypatch.setattr(encryption, "_get_cipher", lambda: _BadCipher())
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    col = encryption.EncryptedString()
    with pytest.raises(RuntimeError):
        col.process_bind_param("x", None)
