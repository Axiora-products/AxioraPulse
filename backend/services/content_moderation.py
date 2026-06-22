"""
services/content_moderation.py
──────────────────────────────
Authoritative input-validation & content-safety layer for AI survey generation.

This is the FINAL security layer — the frontend mirrors these checks for instant
feedback, but the backend decision is what counts. It validates length, sanitizes
the input, and rejects prohibited content (illegal activity, cyber abuse, hate,
explicit content, violence, and prompt-injection attempts) with clear,
user-friendly messages. Rejections are also counted per-actor so repeated abuse
can be rate-limited by the caller.

Detection is intentionally phrase/word-boundary based to minimize false positives
on legitimate businesses (e.g. "fraud detection SaaS", "home security cameras",
"adult education", "suicide-prevention nonprofit").
"""

import re
import time
import threading
import unicodedata

# ── Limits ─────────────────────────────────────────────────────────────────────
MIN_LENGTH = 10
MAX_LENGTH = 4000

# ── Categories & user-facing messages ──────────────────────────────────────────
CATEGORY_MESSAGES = {
    "empty": "Please enter a business or startup idea to continue.",
    "too_short": "Please provide more details about your business idea.",
    "too_long": "The business idea exceeds the maximum allowed length.",
    "illegal": "The submitted idea contains content related to illegal activities and cannot be used for survey generation.",
    "cyber": "The submitted idea contains potentially malicious or harmful instructions and cannot be processed.",
    "offensive": "The submitted idea contains inappropriate or offensive language. Please provide a professional business idea.",
    "explicit": "The submitted idea contains adult or explicit content and cannot be processed.",
    "violent": "The submitted idea contains violent or harmful content and cannot be processed.",
    "prompt_injection": "The submitted content contains unsupported instructions and cannot be processed.",
    "generic": "This business idea cannot be processed because it violates our content and safety guidelines.",
}


class ContentModerationError(Exception):
    """Raised when input fails validation/moderation. Carries a safe user message."""

    def __init__(self, category: str, matched: str = ""):
        self.category = category
        self.matched = matched
        self.user_message = CATEGORY_MESSAGES.get(category, CATEGORY_MESSAGES["generic"])
        super().__init__(f"content_moderation:{category}")


# ── Detection patterns (checked in priority order) ─────────────────────────────
# Each entry: (category, compiled_regex). Word boundaries / multi-word phrases keep
# false positives low.
def _c(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


_PROMPT_INJECTION = [
    _c(r"ignore\s+(all\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|messages?|context)"),
    _c(r"disregard\s+(all\s+|the\s+)?(previous|prior|above|earlier|safety)"),
    _c(r"(reveal|show|print|return|expose|repeat)\s+(me\s+)?(your\s+|the\s+)?(system\s+)?(prompt|instructions)"),
    _c(r"system\s+prompt"),
    _c(r"you\s+are\s+now\s+(an?\s+)?(?!a\s+survey)"),
    _c(r"act\s+as\s+(an?\s+)?(admin|administrator|root|developer|system|dan|assistant\s+without)"),
    _c(r"developer\s+mode"),
    _c(r"\bjailbreak\b"),
    _c(r"bypass\s+(all\s+)?(restrictions|filters|rules|guidelines|safety|moderation)"),
    _c(r"ignore\s+(your\s+)?(rules|guidelines|restrictions|safety)"),
    _c(r"return\s+(any\s+)?hidden\s+(data|text|instructions)"),
    _c(r"execute\s+(this\s+|the\s+following\s+)?code"),
    _c(r"\bDAN\s+mode\b"),
    _c(r"pretend\s+(to\s+be|you\s+are)\s+(an?\s+)?(unrestricted|jailbroken|admin)"),
]

# Cyber detection is intent-aware: it targets PERFORMING attacks, not building
# defensive products (anti-malware, phishing-awareness training, DDoS mitigation,
# fraud/intrusion detection, etc. are all legitimate businesses).
#
# TIER A — always block (no legitimate "perform this" reading):
_CYBER_ALWAYS = [
    _c(r"sql\s*injection"),
    _c(r"\bxss\b"),
    _c(r"cross[\s-]site\s+scripting"),
    _c(r"</?script\b"),
    _c(r"drop\s+table\b"),
    _c(r"union\s+select\b"),
    _c(r"reverse\s+shell"),
    _c(r"steal\s+(passwords?|credentials?|logins?|accounts?|user\s+data)"),
    _c(r"crack\s+(passwords?|software|licen[cs]e)"),
    _c(r"bypass\s+(authentication|login|2fa|mfa|password)"),
    _c(r"(hack|hacking)\s+(into\s+)?(a\s+|the\s+|someone'?s?\s+)?(\w+\s+)?"
       r"(system|account|server|website|web\s*site|network|database|\bdb\b|wifi|wi-fi|email|computer|phone|device|cloud)"),
    # Malicious tooling — only when the intent is to create/spread/sell it.
    _c(
        r"(creat\w*|build\w*|develop\w*|writ\w*|mak\w*|launch\w*|deploy\w*|sell\w*|"
        r"distribut\w*|spread\w*|generat\w*|design\w*|how\s+to\s+(make|build|create|use|deploy|write|spread))"
        r"\s+(a\s+|an\s+|the\s+|your\s+|some\s+)?"
        r"(malware|ransomware|spyware|keylogger|botnet|trojan\w*|computer\s+virus|worm|rootkit)"
    ),
    _c(r"phishing\s+(attack|campaign|kit|page|site|scam|email\w*\s+to)"),
    _c(r"(creat\w*|build\w*|launch\w*|run\w*|send\w*|design\w*)\s+(a\s+)?phishing"),
]

# TIER B — attack *names* that legitimate security vendors also reference; only
# block when the text is NOT clearly about defending against them.
_CYBER_OFFENSIVE_ONLY = [
    _c(r"credential\s+(theft|stuffing|harvest\w*)"),
    _c(r"brute[\s-]?force\s+(attack|tool|passwords?|login)"),
    _c(r"\bddos\s+(attack|tool|for[\s-]hire)"),
    _c(r"privilege\s+escalation"),
    _c(r"exploit\s+(a\s+|the\s+)?(system|vulnerab\w*|server|network|database)"),
]

_DEFENSIVE_CONTEXT = _c(
    r"(detect\w*|prevent\w*|protect\w*|mitigat\w*|defen[cs]\w*|awareness|train\w*|"
    r"education|block\w*|stop\w*|against|scanner|firewall|audit\w*|monitor\w*|"
    r"secur\w*|safeguard|anti[\s-]?\w+|simulat\w*|aware)"
)


def _detect_cyber(text: str):
    """Return the matched offending phrase, or None, applying defensive-context exemption."""
    for pat in _CYBER_ALWAYS:
        m = pat.search(text)
        if m:
            return m.group(0)[:60]
    if not _DEFENSIVE_CONTEXT.search(text):
        for pat in _CYBER_OFFENSIVE_ONLY:
            m = pat.search(text)
            if m:
                return m.group(0)[:60]
    return None

_ILLEGAL = [
    _c(r"money\s+launder\w*|launder\w*\s+money"),
    _c(r"human\s+trafficking|sex\s+trafficking|drug\s+trafficking"),
    _c(r"(sell|selling|buy|buying|distribut\w*|manufactur\w*)\s+(illegal\s+)?(drugs|narcotics|cocaine|heroin|meth\w*)"),
    _c(r"meth(amphetamine)?\s+lab"),
    _c(r"\bcocaine\b|\bheroin\b|\bfentanyl\b"),
    _c(r"counterfeit\s+(money|currency|cash|products?|goods|items?)"),
    _c(r"fake\s+(passports?|ids?|identit\w*|currency|cash)"),
    _c(r"\bponzi\b|pyramid\s+scheme"),
    _c(r"credit\s+card\s+(fraud|skimming|dump\w*|number)"),
    _c(r"\bcarding\b"),
    _c(r"(commit|committing|run(ning)?\s+an?)\s+(fraud|scam)"),
    _c(r"scam\s+(people|users|victims|customers|investors)"),
    _c(r"illegal\s+(gambling|weapons?|firearms?|arms|betting)"),
    _c(r"(weapons?|arms|firearms?)\s+(trafficking|smuggl\w*|dealing)"),
    _c(r"untraceable\s+(gun|weapon|firearm)"),
]

_VIOLENT = [
    _c(r"\bterroris[mt]\b"),
    _c(r"how\s+to\s+(make|build|create)\s+(a\s+)?(bomb|explosive|ied)"),
    _c(r"\bbomb[\s-]?making"),
    _c(r"mass\s+(shooting|murder|killing)"),
    _c(r"how\s+to\s+kill\s+(a\s+)?(person|people|someone|him|her|them|my)"),
    _c(r"(promote|promoting|incit\w*|glorif\w*)\s+(violence|terrorism)"),
    _c(r"(promote|promoting|encourage|encouraging)\s+self[\s-]?harm"),
    _c(r"how\s+to\s+(commit\s+suicide|kill\s+myself|harm\s+myself)"),
]

_EXPLICIT = [
    _c(r"\bporn(o|ography|ographic)?\b"),
    _c(r"\bxxx\b"),
    _c(r"escort\s+(service|agency|business)"),
    _c(r"sexual\s+services"),
    _c(r"prostitut\w*|\bbrothel\b"),
    _c(r"\bcamgirl\b|\bonlyfans\b"),
    _c(r"adult\s+(entertainment|content|webcam|video\s+chat)"),
    _c(r"explicit\s+(sexual|adult|porn\w*)\s+content"),
]

# A deliberately small set of unambiguous threat/hate patterns. General profanity
# is not blocked (it isn't a safety issue); targeted hate/harassment is.
_HATE = [
    _c(r"i\s+(will|'?ll|am\s+going\s+to|wanna|want\s+to)\s+(kill|hurt|murder|rape|beat)\s+(you|him|her|them)"),
    _c(r"kill\s+(all\s+)?(the\s+)?(jews|muslims|christians|blacks|whites|asians|gays|immigrants|women|men)\b"),
    _c(r"(hate\s+speech|racial\s+slur\w*|ethnic\s+cleansing|white\s+power)"),
    _c(r"\bn[i1]gg(er|a)\b|\bfagg?ot\b|\bk[i1]ke\b|\bsp[i1]c\b|\bch[i1]nk\b|\bret(ard|arded)\b"),
]

# Priority order: injection first (most security-sensitive), then the rest.
# (cyber is handled separately via _detect_cyber for defensive-context exemption.)
_CATEGORY_PATTERNS = [
    ("prompt_injection", _PROMPT_INJECTION),
    ("illegal", _ILLEGAL),
    ("violent", _VIOLENT),
    ("explicit", _EXPLICIT),
    ("offensive", _HATE),
]


def sanitize_text(text: str) -> str:
    """Normalize unicode, strip control/zero-width chars and collapse whitespace."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    # Remove zero-width and other invisible/control characters (except newlines/tabs)
    text = "".join(
        ch for ch in text
        if ch in ("\n", "\t") or (unicodedata.category(ch)[0] != "C")
    )
    return text.strip()


def validate_ai_context(text: str) -> str:
    """
    Validate, sanitize and moderate an AI-context business idea.

    Returns the sanitized text on success. Raises ContentModerationError with a
    user-friendly message on any failure (length or prohibited content).
    """
    if text is None or not str(text).strip():
        raise ContentModerationError("empty")

    cleaned = sanitize_text(str(text))

    if len(cleaned) < MIN_LENGTH:
        raise ContentModerationError("too_short")
    if len(cleaned) > MAX_LENGTH:
        raise ContentModerationError("too_long")

    # Prompt injection first (most security-sensitive).
    for pattern in _PROMPT_INJECTION:
        m = pattern.search(cleaned)
        if m:
            raise ContentModerationError("prompt_injection", matched=m.group(0)[:60])

    # Cyber abuse (intent-aware, with defensive-context exemption).
    cyber_match = _detect_cyber(cleaned)
    if cyber_match:
        raise ContentModerationError("cyber", matched=cyber_match)

    # Remaining categories.
    for category, patterns in _CATEGORY_PATTERNS:
        if category == "prompt_injection":
            continue
        for pattern in patterns:
            m = pattern.search(cleaned)
            if m:
                raise ContentModerationError(category, matched=m.group(0)[:60])

    return cleaned


# ── Repeated-violation rate limiting (best-effort, per-process) ─────────────────
# For multi-instance deployments back this with Redis; the in-memory window is a
# safety net so a single client cannot hammer the moderation layer.
_VIOLATION_WINDOW_SECONDS = 600  # 10 minutes
_VIOLATION_MAX = 5
_violation_lock = threading.Lock()
_violations: dict = {}  # key -> list[timestamps]


def register_violation(key: str) -> int:
    """Record a moderation violation for an actor; returns the count in the window."""
    if not key:
        return 0
    now = time.monotonic()
    with _violation_lock:
        hits = [t for t in _violations.get(key, []) if now - t < _VIOLATION_WINDOW_SECONDS]
        hits.append(now)
        _violations[key] = hits
        return len(hits)


def is_violation_blocked(key: str) -> bool:
    """True if the actor has exceeded the allowed number of violations recently."""
    if not key:
        return False
    now = time.monotonic()
    with _violation_lock:
        hits = [t for t in _violations.get(key, []) if now - t < _VIOLATION_WINDOW_SECONDS]
        _violations[key] = hits
        return len(hits) >= _VIOLATION_MAX
