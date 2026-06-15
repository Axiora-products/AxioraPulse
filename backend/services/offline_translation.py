"""
Offline survey translation helpers.

This module uses local translation engines and does not require
Gemini/OpenAI/Anthropic keys. Model files must be installed on the
machine/container before runtime.

Install examples:
  python -m pip install argostranslate
  python -m pip install transformers sentencepiece
  python -c "import argostranslate.package as p; p.update_package_index(); \
[p.install_from_path(pkg.download()) for pkg in p.get_available_packages() \
if pkg.from_code == 'en' and pkg.to_code in ('hi', 'te')]"
  python tools/install_offline_translation_models.py
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any


SUPPORTED_OFFLINE_LANGUAGES = {"hi", "te"}
NLLB_LANGUAGE_CODES = {
    "hi": "hin_Deva",
    "te": "tel_Telu",
}
DEFAULT_NLLB_MODEL = "facebook/nllb-200-distilled-600M"
DEFAULT_MODEL_VERSION = "offline-v1"


class OfflineTranslationError(RuntimeError):
    """Raised when the offline translator cannot translate a requested language."""


def _require_argos():
    try:
        import argostranslate.translate as translate  # type: ignore
    except ImportError as exc:
        raise OfflineTranslationError(
            "Offline translation is not available because 'argostranslate' is not installed. "
            "Install backend requirements and the en->hi/en->te Argos model packages."
        ) from exc
    return translate


def _argos_translate_module():
    try:
        return _require_argos()
    except OfflineTranslationError:
        return None


def _installed_translation_pairs() -> frozenset[tuple[str, str]]:
    translate = _argos_translate_module()
    if translate is None:
        return frozenset()
    pairs: set[tuple[str, str]] = set()
    for language in translate.get_installed_languages():
        for translation in language.translations_from:
            pairs.add((language.code, translation.to_lang.code))
    return frozenset(pairs)


def translation_model_signature() -> str:
    """Cache namespace: source text + target language + this signature."""
    nllb_model = os.getenv("OFFLINE_TRANSLATION_MODEL", DEFAULT_NLLB_MODEL)
    model_version = os.getenv("OFFLINE_TRANSLATION_MODEL_VERSION", DEFAULT_MODEL_VERSION)
    argos_pairs = ",".join(f"{src}->{dst}" for src, dst in sorted(_installed_translation_pairs()))
    return f"model={nllb_model}|version={model_version}|argos={argos_pairs or 'none'}"


def translation_status() -> dict[str, Any]:
    argos_pairs = sorted(f"{src}->{dst}" for src, dst in _installed_translation_pairs())
    nllb_model = os.getenv("OFFLINE_TRANSLATION_MODEL", DEFAULT_NLLB_MODEL)
    status = {
        "mode": "offline",
        "supported_languages": sorted(SUPPORTED_OFFLINE_LANGUAGES),
        "cache_key": "source_text + target_language + model_signature",
        "model_signature": translation_model_signature(),
        "argos_installed_pairs": argos_pairs,
        "nllb_model": nllb_model,
        "nllb_dependencies_installed": False,
        "nllb_model_available_locally": False,
    }
    try:
        from transformers import AutoConfig  # type: ignore

        status["nllb_dependencies_installed"] = True
        AutoConfig.from_pretrained(nllb_model, local_files_only=True)
        status["nllb_model_available_locally"] = True
    except Exception as exc:
        status["nllb_status"] = str(exc)
    return status


def assert_language_supported(target_language: str) -> None:
    if target_language not in SUPPORTED_OFFLINE_LANGUAGES:
        raise OfflineTranslationError(
            f"Unsupported offline translation language '{target_language}'. "
            "Supported languages are: hi, te."
        )


@lru_cache(maxsize=1)
def _load_nllb():
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # type: ignore
    except ImportError as exc:
        raise OfflineTranslationError(
            "NLLB offline translation dependencies are missing. Install backend requirements "
            "or run: pip install transformers sentencepiece"
        ) from exc

    model_path = os.getenv("OFFLINE_TRANSLATION_MODEL", DEFAULT_NLLB_MODEL)
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            local_files_only=True,
            src_lang="eng_Latn",
        )
        model = AutoModelForSeq2SeqLM.from_pretrained(model_path, local_files_only=True)
    except Exception as exc:
        raise OfflineTranslationError(
            "NLLB offline translation model is not available locally. "
            "Run backend/tools/install_offline_translation_models.py or set "
            "OFFLINE_TRANSLATION_MODEL to a local NLLB model directory."
        ) from exc
    return tokenizer, model


def _translate_with_argos(source: str, target_language: str) -> str | None:
    if ("en", target_language) not in _installed_translation_pairs():
        return None
    translate = _require_argos()
    return translate.translate(source, "en", target_language)


def _translate_with_nllb(source: str, target_language: str) -> str:
    tokenizer, model = _load_nllb()
    target_code = NLLB_LANGUAGE_CODES[target_language]
    tokenizer.src_lang = "eng_Latn"
    encoded = tokenizer(source, return_tensors="pt", truncation=True, max_length=512)
    generated = model.generate(
        **encoded,
        forced_bos_token_id=tokenizer.convert_tokens_to_ids(target_code),
        max_length=512,
    )
    translated = tokenizer.batch_decode(generated, skip_special_tokens=True)
    return translated[0].strip() if translated else source


def translate_text(text: str, target_language: str) -> str:
    source = (text or "").strip()
    if not source:
        return text or ""
    return _translate_text_cached(source, target_language, translation_model_signature())


@lru_cache(maxsize=8192)
def _translate_text_cached(source: str, target_language: str, model_signature: str) -> str:
    # model_signature is intentionally part of the cache key.
    _ = model_signature
    assert_language_supported(target_language)

    errors: list[str] = []
    try:
        translated = _translate_with_argos(source, target_language)
        if translated:
            return translated or source
    except Exception as exc:
        errors.append(f"Argos: {exc}")

    try:
        return _translate_with_nllb(source, target_language) or source
    except Exception as exc:
        errors.append(f"NLLB: {exc}")
        detail = "; ".join(errors)
        raise OfflineTranslationError(f"Offline translation failed for en->{target_language}. {detail}") from exc


def translate_texts(
    texts: list[str],
    languages: tuple[str, ...] = ("te", "hi"),
) -> dict[str, dict[str, str]]:
    unique_texts = [text for text in dict.fromkeys(t.strip() for t in texts if t and t.strip())]
    if not unique_texts:
        return {}

    for language in languages:
        assert_language_supported(language)

    translated: dict[str, dict[str, str]] = {}
    for text in unique_texts:
        translated[text] = {
            language: translate_text(text, language)
            for language in languages
        }
    return translated


def translate_options(options: Any, target_language: str) -> Any:
    if isinstance(options, list):
        translated_options = []
        for item in options:
            if not isinstance(item, dict):
                translated_options.append(item)
                continue
            next_item = dict(item)
            for key in ("label", "description"):
                if isinstance(next_item.get(key), str):
                    next_item[key] = translate_text(next_item[key], target_language)
            translated_options.append(next_item)
        return translated_options

    if isinstance(options, dict):
        next_options = dict(options)
        for key in ("rows", "columns"):
            if isinstance(next_options.get(key), list):
                next_options[key] = translate_options(next_options[key], target_language)
        for key in ("label", "description", "min_label", "max_label"):
            if isinstance(next_options.get(key), str):
                next_options[key] = translate_text(next_options[key], target_language)
        return next_options

    return options
