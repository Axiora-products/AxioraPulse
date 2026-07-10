"""
db/encryption.py
────────────────
Application-level (field-level) encryption for PII columns.

Encrypting at the field level means that even with direct database access, a DB
dump, or a logical-replication leak, sensitive respondent data is ciphertext —
defense-in-depth on top of RDS volume encryption.

Design:
  - Symmetric authenticated encryption via Fernet (AES-128-CBC + HMAC) from the
    `cryptography` library (already a dependency).
  - Key rotation supported: PII_ENCRYPTION_KEYS is a comma-separated list; the
    FIRST key encrypts new data, ALL keys are tried on decrypt (MultiFernet).
  - Rolling adoption: if a value can't be decrypted (legacy plaintext written
    before encryption was enabled), it is returned as-is, so enabling encryption
    never breaks reads of existing rows.
  - If no key is configured (e.g. local dev), the type is a transparent
    passthrough so the app still works; production MUST set PII_ENCRYPTION_KEYS.

Generate a key:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import logging
from functools import lru_cache

from sqlalchemy.types import TypeDecorator, Text

from core import config

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_cipher():
    """Build a MultiFernet from configured keys, or None if encryption is off."""
    keys = config.PII_ENCRYPTION_KEYS
    if not keys:
        if config.IS_PRODUCTION:
            logger.error(
                "PII_ENCRYPTION_KEYS is not set in production — PII columns will be "
                "stored in PLAINTEXT. Configure it to enable field-level encryption."
            )
        return None
    try:
        from cryptography.fernet import Fernet, MultiFernet

        return MultiFernet([Fernet(k.encode()) for k in keys])
    except Exception as exc:  # invalid key material
        logger.error("Failed to initialize PII encryption cipher: %s", type(exc).__name__)
        if config.IS_PRODUCTION:
            raise
        return None


class EncryptedString(TypeDecorator):
    """A Text column whose value is transparently encrypted at rest.

    Safe to apply to existing plaintext columns: encryption is applied on write,
    and decrypt failures (legacy plaintext) fall back to returning the raw value.
    Ciphertext is longer than plaintext, so the underlying column is TEXT.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        cipher = _get_cipher()
        if cipher is None:
            return value  # passthrough when encryption is disabled
        try:
            return cipher.encrypt(str(value).encode("utf-8")).decode("utf-8")
        except Exception as exc:
            logger.error("PII encryption failed: %s", type(exc).__name__)
            if config.IS_PRODUCTION:
                raise
            return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        cipher = _get_cipher()
        if cipher is None:
            return value
        try:
            return cipher.decrypt(str(value).encode("utf-8")).decode("utf-8")
        except Exception:
            # Legacy plaintext (written before encryption) or value from another
            # key set — return as-is so reads never break during rollout.
            return value
