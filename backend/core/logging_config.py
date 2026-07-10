"""
core/logging_config.py
──────────────────────
Central logging configuration with secret/PII redaction. (AP-SEC-027, AP-SEC-014)

Call configure_logging() once at startup. Replaces ad-hoc print() logging with a
single configured root logger so logs are consistent and searchable, and a filter
strips obvious secrets that may slip into a log message.
"""

import logging
import os
import re

# Patterns that should never appear in logs even if accidentally interpolated.
_REDACTIONS = [
    (re.compile(r"(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)"), "[REDACTED_JWT]"),
    (re.compile(r"(sk-[A-Za-z0-9_\-]{8,})"), "[REDACTED_KEY]"),
    (re.compile(r"(rzp_(?:live|test)_[A-Za-z0-9]+)"), "[REDACTED_KEY]"),
    (re.compile(r"(AKIA[0-9A-Z]{16})"), "[REDACTED_AWS_KEY]"),
    (re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._\-]+"), r"\1[REDACTED]"),
]


class _RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        redacted = msg
        for pattern, repl in _REDACTIONS:
            redacted = pattern.sub(repl, redacted)
        if redacted != msg:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(_RedactionFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Tame noisy third-party loggers.
    for noisy in ("botocore", "urllib3", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
