import sys
from types import SimpleNamespace

import pytest

from services import offline_translation as offline


def setup_function():
    offline._load_nllb.cache_clear()
    offline._translate_text_cached.cache_clear()


def test_installed_translation_pairs_when_argos_missing(monkeypatch):
    monkeypatch.setattr(offline, "_argos_translate_module", lambda: None)

    assert offline._installed_translation_pairs() == frozenset()


def test_installed_translation_pairs_from_argos(monkeypatch):
    hindi = SimpleNamespace(code="hi")
    telugu = SimpleNamespace(code="te")
    english = SimpleNamespace(
        code="en",
        translations_from=[
            SimpleNamespace(to_lang=hindi),
            SimpleNamespace(to_lang=telugu),
        ],
    )
    monkeypatch.setattr(
        offline,
        "_argos_translate_module",
        lambda: SimpleNamespace(get_installed_languages=lambda: [english]),
    )

    assert offline._installed_translation_pairs() == frozenset({("en", "hi"), ("en", "te")})


def test_translation_status_reports_local_nllb(monkeypatch):
    class FakeAutoConfig:
        @staticmethod
        def from_pretrained(model, local_files_only):
            assert model == "local-nllb"
            assert local_files_only is True

    monkeypatch.setenv("OFFLINE_TRANSLATION_MODEL", "local-nllb")
    monkeypatch.setattr(offline, "_installed_translation_pairs", lambda: {("en", "hi")})
    monkeypatch.setitem(sys.modules, "transformers", SimpleNamespace(AutoConfig=FakeAutoConfig))

    status = offline.translation_status()

    assert status["mode"] == "offline"
    assert status["argos_installed_pairs"] == ["en->hi"]
    assert status["nllb_model"] == "local-nllb"
    assert status["nllb_dependencies_installed"] is True
    assert status["nllb_model_available_locally"] is True


def test_assert_language_supported_rejects_unknown_language():
    with pytest.raises(offline.OfflineTranslationError, match="Unsupported offline translation language"):
        offline.assert_language_supported("fr")


def test_load_nllb_uses_local_model(monkeypatch):
    class FakeTokenizer:
        @classmethod
        def from_pretrained(cls, model_path, local_files_only, src_lang):
            assert model_path == "local-nllb"
            assert local_files_only is True
            assert src_lang == "eng_Latn"
            return cls()

    class FakeModel:
        @classmethod
        def from_pretrained(cls, model_path, local_files_only):
            assert model_path == "local-nllb"
            assert local_files_only is True
            return cls()

    monkeypatch.setenv("OFFLINE_TRANSLATION_MODEL", "local-nllb")
    monkeypatch.setitem(
        sys.modules,
        "transformers",
        SimpleNamespace(AutoModelForSeq2SeqLM=FakeModel, AutoTokenizer=FakeTokenizer),
    )

    tokenizer, model = offline._load_nllb()

    assert isinstance(tokenizer, FakeTokenizer)
    assert isinstance(model, FakeModel)


def test_load_nllb_raises_when_local_model_missing(monkeypatch):
    class FakeTokenizer:
        @classmethod
        def from_pretrained(cls, *args, **kwargs):
            raise OSError("missing")

    class FakeModel:
        @classmethod
        def from_pretrained(cls, *args, **kwargs):
            return cls()

    monkeypatch.setitem(
        sys.modules,
        "transformers",
        SimpleNamespace(AutoModelForSeq2SeqLM=FakeModel, AutoTokenizer=FakeTokenizer),
    )

    with pytest.raises(offline.OfflineTranslationError, match="model is not available locally"):
        offline._load_nllb()


def test_translate_with_argos_returns_none_without_installed_pair(monkeypatch):
    monkeypatch.setattr(offline, "_installed_translation_pairs", lambda: set())

    assert offline._translate_with_argos("hello", "hi") is None


def test_translate_with_argos_uses_installed_pair(monkeypatch):
    monkeypatch.setattr(offline, "_installed_translation_pairs", lambda: {("en", "hi")})
    monkeypatch.setattr(
        offline,
        "_require_argos",
        lambda: SimpleNamespace(translate=lambda source, src, dst: f"{src}:{dst}:{source}"),
    )

    assert offline._translate_with_argos("hello", "hi") == "en:hi:hello"


def test_translate_with_nllb_decodes_generated_text(monkeypatch):
    class FakeTokenizer:
        src_lang = None

        def __call__(self, source, return_tensors, truncation, max_length):
            assert source == "hello"
            assert return_tensors == "pt"
            assert truncation is True
            assert max_length == 512
            return {"input_ids": [1]}

        def convert_tokens_to_ids(self, target_code):
            assert target_code == "hin_Deva"
            return 99

        def batch_decode(self, generated, skip_special_tokens):
            assert generated == [[42]]
            assert skip_special_tokens is True
            return [" namaste "]

    class FakeModel:
        def generate(self, **kwargs):
            assert kwargs["forced_bos_token_id"] == 99
            assert kwargs["max_length"] == 512
            return [[42]]

    tokenizer = FakeTokenizer()
    monkeypatch.setattr(offline, "_load_nllb", lambda: (tokenizer, FakeModel()))

    assert offline._translate_with_nllb("hello", "hi") == "namaste"
    assert tokenizer.src_lang == "eng_Latn"


def test_translate_text_handles_blank_and_cached_success(monkeypatch):
    calls = []

    def fake_cached(source, target_language, model_signature):
        calls.append((source, target_language, model_signature))
        return "translated"

    monkeypatch.setattr(offline, "translation_model_signature", lambda: "sig")
    monkeypatch.setattr(offline, "_translate_text_cached", fake_cached)

    assert offline.translate_text("   ", "hi") == "   "
    assert offline.translate_text(" hello ", "hi") == "translated"
    assert calls == [("hello", "hi", "sig")]


def test_translate_text_cached_falls_back_to_nllb_after_argos_error(monkeypatch):
    monkeypatch.setattr(
        offline, "_translate_with_argos", lambda source, language: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    monkeypatch.setattr(offline, "_translate_with_nllb", lambda source, language: "nllb")

    assert offline._translate_text_cached("hello", "hi", "sig") == "nllb"


def test_translate_text_cached_raises_with_all_errors(monkeypatch):
    monkeypatch.setattr(offline, "_translate_with_argos", lambda source, language: None)
    monkeypatch.setattr(
        offline,
        "_translate_with_nllb",
        lambda source, language: (_ for _ in ()).throw(RuntimeError("missing")),
    )

    with pytest.raises(offline.OfflineTranslationError, match="Offline translation failed"):
        offline._translate_text_cached("hello", "hi", "sig")


def test_translate_texts_deduplicates_and_validates(monkeypatch):
    monkeypatch.setattr(offline, "translate_text", lambda text, language: f"{language}:{text}")

    assert offline.translate_texts([" Hello ", "Hello", "", None], languages=("hi",)) == {"Hello": {"hi": "hi:Hello"}}

    with pytest.raises(offline.OfflineTranslationError):
        offline.translate_texts(["Hello"], languages=("fr",))


def test_translate_options_for_lists_dicts_and_passthrough(monkeypatch):
    monkeypatch.setattr(offline, "translate_text", lambda text, language: f"{language}:{text}")

    list_options = [
        {"label": "Label", "description": "Desc", "value": "v"},
        "leave me",
    ]
    assert offline.translate_options(list_options, "hi") == [
        {"label": "hi:Label", "description": "hi:Desc", "value": "v"},
        "leave me",
    ]

    dict_options = {
        "rows": [{"label": "Row"}],
        "columns": [{"description": "Column desc"}],
        "label": "Top",
        "min_label": "Min",
        "max_label": "Max",
    }
    assert offline.translate_options(dict_options, "te") == {
        "rows": [{"label": "te:Row"}],
        "columns": [{"description": "te:Column desc"}],
        "label": "te:Top",
        "min_label": "te:Min",
        "max_label": "te:Max",
    }
    assert offline.translate_options("plain", "hi") == "plain"
