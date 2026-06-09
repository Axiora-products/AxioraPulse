"""
services/ai_provider.py
───────────────────────
Centralized multi-provider AI service with automatic failover.

Supports: Gemini 2.5 Flash, OpenAI GPT-5.4 Mini, Anthropic Claude Sonnet.
Priority order: Gemini → OpenAI → Anthropic.

Each provider returns raw JSON text. On failure (rate limit, network error,
parse error), the next provider is tried automatically. Raises HTTP 503
only when all configured providers have failed.
"""

import os
import logging
import requests
from typing import Optional

import anthropic
import openai

from fastapi import HTTPException

logger = logging.getLogger("ai_provider")

# ── Provider Models ───────────────────────────────────────────────────────────

GEMINI_MODEL = "gemini-2.5-flash-lite"
OPENAI_MODEL = "gpt-5.4-mini"
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"

# ── Default System Instruction ────────────────────────────────────────────────

_DEFAULT_SYSTEM = "You are a helpful AI assistant. Always respond with valid JSON only — no markdown, no explanation."

# ── Provider Timeout (seconds) ────────────────────────────────────────────────

_GEMINI_TIMEOUT = 90
_OPENAI_TIMEOUT = 90
_ANTHROPIC_TIMEOUT = 90


# ── Truncated JSON Repair ─────────────────────────────────────────────────────


def _repair_truncated_json(text: str) -> str:
    """
    Attempt to repair JSON that was truncated due to max_tokens exhaustion.

    Handles unterminated strings, unclosed arrays/brackets/objects by appending
    the minimum closing characters needed.  This is best-effort — it cannot
    recover data that was never generated, but it prevents json.loads() from
    raising on an otherwise-valid prefix.
    """
    import json as _json

    # Fast path: already valid
    try:
        _json.loads(text)
        return text
    except _json.JSONDecodeError:
        pass

    repaired = text.rstrip()

    # Remove trailing comma (invalid in JSON)
    repaired = repaired.rstrip(",")

    # Close unterminated string literal
    quote_count = repaired.count('"') - repaired.count('\\"')
    if quote_count % 2 != 0:
        repaired += '"'

    # Walk the repaired text to find unclosed brackets
    stack: list[str] = []
    in_string = False
    escape_next = False
    for ch in repaired:
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in ("{", "["):
            stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif ch == "]" and stack and stack[-1] == "[":
            stack.pop()

    # Remove trailing comma before closing
    repaired = repaired.rstrip().rstrip(",")

    # Close unclosed structures in reverse order
    for opener in reversed(stack):
        repaired += "]" if opener == "[" else "}"

    try:
        _json.loads(repaired)
        logger.info("[AI] Repaired truncated JSON (%d closers added)", len(stack))
        return repaired
    except _json.JSONDecodeError:
        # Repair failed — return the original so the caller gets the real error
        return text


# ── Internal Provider Callers ─────────────────────────────────────────────────


def _call_gemini(
    api_key: str,
    prompt: str,
    max_tokens: int = 2048,
    system_instruction: Optional[str] = None,
) -> str:
    """Call Google Gemini REST API and return raw JSON text."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system_instruction or _DEFAULT_SYSTEM}]},
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": max_tokens,
        },
    }

    response = requests.post(url, headers=headers, json=payload, timeout=_GEMINI_TIMEOUT)
    response.raise_for_status()
    result = response.json()

    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Unexpected Gemini response structure: {exc}") from exc

    # Strip markdown code fences if Gemini wraps JSON despite instructions
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]

    return text.strip()


def _call_openai(
    api_key: str,
    prompt: str,
    max_tokens: int = 2048,
    system_instruction: Optional[str] = None,
) -> str:
    """Call OpenAI Chat Completions API and return raw JSON text."""
    client = openai.OpenAI(api_key=api_key, timeout=_OPENAI_TIMEOUT)

    # Newer or reasoning models (e.g. gpt-5, o1, o3) don't support max_tokens and require max_completion_tokens
    use_completion_tokens = OPENAI_MODEL.startswith(("o1-", "o3-", "gpt-5"))

    try:
        if use_completion_tokens:
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_instruction or _DEFAULT_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        else:
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_instruction or _DEFAULT_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
    except Exception as e:
        err_msg = str(e).lower()
        if "max_completion_tokens" in err_msg and not use_completion_tokens:
            logger.info("[AI] Fallback: Retrying OpenAI call with max_completion_tokens")
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_instruction or _DEFAULT_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        elif "max_tokens" in err_msg and use_completion_tokens:
            logger.info("[AI] Fallback: Retrying OpenAI call with max_tokens")
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_instruction or _DEFAULT_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        else:
            raise e

    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise ValueError("Empty response from OpenAI API")

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]

    return text.strip()


def _call_anthropic(
    api_key: str,
    prompt: str,
    max_tokens: int = 2048,
    system_instruction: Optional[str] = None,
) -> str:
    """Call Anthropic Messages API and return raw JSON text."""
    client = anthropic.Anthropic(api_key=api_key, timeout=_ANTHROPIC_TIMEOUT)

    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system_instruction or _DEFAULT_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract text from content blocks
    text_parts = [block.text for block in response.content if hasattr(block, "text")]
    text = "".join(text_parts).strip()
    if not text:
        raise ValueError("Empty response from Anthropic API")

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]

    return text.strip()


# ── Provider Registry ─────────────────────────────────────────────────────────

_PROVIDERS = [
    {
        "name": "gemini",
        "env_key": "GEMINI_KEY",
        "caller": _call_gemini,
    },
    {
        "name": "openai",
        "env_key": "OPENAI_KEY",
        "caller": _call_openai,
    },
    {
        "name": "anthropic",
        "env_key": "ANTHROPIC_KEY",
        "caller": _call_anthropic,
    },
]


def _mask_key(key: str) -> str:
    """Mask an API key for safe logging (show only last 4 chars)."""
    if len(key) <= 8:
        return "****"
    return f"****{key[-4:]}"


# ── Public API ────────────────────────────────────────────────────────────────

# Transient HTTP status codes that warrant a retry before failover
_RETRYABLE_STATUS_CODES = {429, 502, 503}
_MAX_RETRIES = 2
_RETRY_BASE_DELAY = 2  # seconds; doubles each attempt (2s, 4s)


def call_ai_sync(
    prompt: str,
    max_tokens: int = 2048,
    system_instruction: Optional[str] = None,
) -> str:
    """
    Synchronous multi-provider AI call with automatic failover.

    Tries each configured provider in priority order (Gemini → OpenAI → Anthropic).
    For transient errors (429/502/503), retries the same provider up to 2 times
    with exponential backoff before moving to the next provider.
    Returns the raw JSON text from the first successful provider.
    Raises HTTPException 503 if all providers fail.
    """
    import time

    errors: list[str] = []
    attempted = 0

    for provider in _PROVIDERS:
        api_key = os.getenv(provider["env_key"], "").strip()
        if not api_key or api_key.startswith("mock-"):
            continue

        attempted += 1
        provider_name = provider["name"]

        for attempt in range(_MAX_RETRIES + 1):
            try:
                logger.info("[AI] Trying provider: %s (attempt %d)", provider_name, attempt + 1)
                text = provider["caller"](
                    api_key=api_key,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    system_instruction=system_instruction,
                )
                logger.info("[AI] Success with provider: %s", provider_name)
                return _repair_truncated_json(text)

            except Exception as exc:
                # Sanitize — never log the API key
                safe_msg = str(exc).replace(api_key, _mask_key(api_key))

                # Check if this is a retryable transient error
                is_retryable = any(str(code) in str(exc) for code in _RETRYABLE_STATUS_CODES)
                has_retries_left = attempt < _MAX_RETRIES

                if is_retryable and has_retries_left:
                    delay = _RETRY_BASE_DELAY * (2**attempt)
                    logger.warning(
                        "[AI] Provider %s returned transient error (attempt %d/%d), retrying in %ds: %s",
                        provider_name,
                        attempt + 1,
                        _MAX_RETRIES + 1,
                        delay,
                        safe_msg,
                    )
                    time.sleep(delay)
                    continue

                logger.warning("[AI] Provider %s failed: %s", provider_name, safe_msg)
                errors.append(f"{provider_name}: {safe_msg}")
                break  # Move to next provider

    if attempted == 0:
        raise HTTPException(
            status_code=500,
            detail="No AI provider API key is configured on the server",
        )

    error_summary = " | ".join(errors)
    logger.error("[AI] All providers failed: %s", error_summary)
    raise HTTPException(
        status_code=503,
        detail="All AI providers are currently unavailable. Please try again shortly.",
    )
