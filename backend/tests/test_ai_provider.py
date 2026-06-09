"""
Unit tests for services/ai_provider.py.

Covers _repair_truncated_json, individual provider callers (_call_gemini,
_call_openai, _call_anthropic), and the call_ai_sync public API including
provider failover and retry logic.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

import services.ai_provider as ai_provider
from services.ai_provider import (
    _repair_truncated_json,
    _call_gemini,
    _call_openai,
    _call_anthropic,
    call_ai_sync,
)


# ── _repair_truncated_json ────────────────────────────────────────────────────


class TestRepairTruncatedJson:
    def test_already_valid_returns_unchanged(self):
        data = '{"key": "value"}'
        assert _repair_truncated_json(data) == data

    def test_unclosed_object(self):
        result = _repair_truncated_json('{"key": "value"')
        assert json.loads(result) == {"key": "value"}

    def test_unclosed_array(self):
        result = _repair_truncated_json("[1, 2, 3")
        assert json.loads(result) == [1, 2, 3]

    def test_nested_unclosed(self):
        result = _repair_truncated_json('{"a": {"b": [1')
        parsed = json.loads(result)
        assert parsed["a"]["b"] == [1]

    def test_unterminated_string(self):
        result = _repair_truncated_json('{"key": "val')
        assert "key" in json.loads(result)

    def test_trailing_comma_removed(self):
        result = _repair_truncated_json('{"key": "value",')
        assert json.loads(result) == {"key": "value"}

    def test_escape_sequence_in_string(self):
        data = '{"msg": "say \\"hello\\""}'
        assert _repair_truncated_json(data) == data

    def test_unrepairable_returns_original(self):
        garbage = "}{not json at all"
        assert _repair_truncated_json(garbage) == garbage

    def test_unclosed_nested_array_in_object(self):
        result = _repair_truncated_json('{"list": [{"a": 1}, {"b": 2')
        parsed = json.loads(result)
        assert len(parsed["list"]) == 2


# ── _call_gemini ──────────────────────────────────────────────────────────────


def _gemini_response(text: str):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    return resp


class TestCallGemini:
    def test_success(self):
        with patch("services.ai_provider.requests.post", return_value=_gemini_response('{"ok": 1}')):
            assert _call_gemini("key", "prompt") == '{"ok": 1}'

    def test_strips_markdown_fences(self):
        with patch("services.ai_provider.requests.post", return_value=_gemini_response('```json\n{"ok":1}\n```')):
            result = _call_gemini("key", "prompt")
        assert "```" not in result

    def test_bad_structure_raises_value_error(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"unexpected": "no candidates key"}
        with patch("services.ai_provider.requests.post", return_value=resp):
            with pytest.raises(ValueError, match="Unexpected Gemini response structure"):
                _call_gemini("key", "prompt")

    def test_uses_custom_system_instruction(self):
        with patch("services.ai_provider.requests.post", return_value=_gemini_response('{"ok":1}')) as mock_post:
            _call_gemini("key", "prompt", system_instruction="Be concise")
        payload = mock_post.call_args.kwargs["json"]
        assert payload["systemInstruction"]["parts"][0]["text"] == "Be concise"

    def test_uses_default_system_when_none(self):
        with patch("services.ai_provider.requests.post", return_value=_gemini_response('{"ok":1}')) as mock_post:
            _call_gemini("key", "prompt")
        payload = mock_post.call_args.kwargs["json"]
        assert "valid JSON" in payload["systemInstruction"]["parts"][0]["text"]


# ── _call_openai ──────────────────────────────────────────────────────────────


def _openai_response(content: str):
    msg = MagicMock()
    msg.content = content
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


class TestCallOpenAI:
    def test_success_with_gpt5_model(self):
        mc = MagicMock()
        mc.chat.completions.create.return_value = _openai_response('{"ok":1}')
        with patch("services.ai_provider.openai.OpenAI", return_value=mc):
            assert _call_openai("key", "prompt") == '{"ok":1}'

    def test_success_with_non_gpt5_model(self):
        mc = MagicMock()
        mc.chat.completions.create.return_value = _openai_response('{"ok":1}')
        with patch("services.ai_provider.OPENAI_MODEL", "gpt-4o"):
            with patch("services.ai_provider.openai.OpenAI", return_value=mc):
                assert _call_openai("key", "prompt") == '{"ok":1}'

    def test_empty_response_raises(self):
        mc = MagicMock()
        mc.chat.completions.create.return_value = _openai_response("")
        with patch("services.ai_provider.openai.OpenAI", return_value=mc):
            with pytest.raises(ValueError, match="Empty response"):
                _call_openai("key", "prompt")

    def test_strips_markdown_fences(self):
        mc = MagicMock()
        mc.chat.completions.create.return_value = _openai_response('```\n{"ok":1}\n```')
        with patch("services.ai_provider.openai.OpenAI", return_value=mc):
            assert "```" not in _call_openai("key", "prompt")

    def test_fallback_to_completion_tokens_for_legacy_model(self):
        """Non-gpt-5 model receives 'max_completion_tokens' error → retries with that param."""
        mc = MagicMock()
        mc.chat.completions.create.side_effect = [
            Exception("max_completion_tokens not supported"),
            _openai_response('{"ok":1}'),
        ]
        with patch("services.ai_provider.OPENAI_MODEL", "gpt-4o"):
            with patch("services.ai_provider.openai.OpenAI", return_value=mc):
                assert _call_openai("key", "prompt") == '{"ok":1}'

    def test_fallback_to_max_tokens_for_gpt5_model(self):
        """gpt-5 model receives 'max_tokens' error → retries with max_tokens param."""
        mc = MagicMock()
        mc.chat.completions.create.side_effect = [
            Exception("max_tokens not supported for this model"),
            _openai_response('{"ok":1}'),
        ]
        with patch("services.ai_provider.openai.OpenAI", return_value=mc):
            assert _call_openai("key", "prompt") == '{"ok":1}'

    def test_unhandled_exception_reraises(self):
        mc = MagicMock()
        mc.chat.completions.create.side_effect = Exception("network error")
        with patch("services.ai_provider.openai.OpenAI", return_value=mc):
            with pytest.raises(Exception, match="network error"):
                _call_openai("key", "prompt")


# ── _call_anthropic ───────────────────────────────────────────────────────────


class TestCallAnthropic:
    def test_success(self):
        block = MagicMock()
        block.text = '{"ans":1}'
        mock_resp = MagicMock()
        mock_resp.content = [block]
        mc = MagicMock()
        mc.messages.create.return_value = mock_resp
        with patch("services.ai_provider.anthropic.Anthropic", return_value=mc):
            assert _call_anthropic("key", "prompt") == '{"ans":1}'

    def test_empty_content_raises(self):
        mock_resp = MagicMock()
        mock_resp.content = []
        mc = MagicMock()
        mc.messages.create.return_value = mock_resp
        with patch("services.ai_provider.anthropic.Anthropic", return_value=mc):
            with pytest.raises(ValueError, match="Empty response"):
                _call_anthropic("key", "prompt")

    def test_strips_markdown_fences(self):
        block = MagicMock()
        block.text = '```json\n{"ans":1}\n```'
        mock_resp = MagicMock()
        mock_resp.content = [block]
        mc = MagicMock()
        mc.messages.create.return_value = mock_resp
        with patch("services.ai_provider.anthropic.Anthropic", return_value=mc):
            assert "```" not in _call_anthropic("key", "prompt")

    def test_block_without_text_attr_skipped(self):
        # Block without .text attribute should be skipped, not crash
        block_no_text = MagicMock(spec=[])  # no .text attribute
        block_with_text = MagicMock()
        block_with_text.text = '{"ok":1}'
        mock_resp = MagicMock()
        mock_resp.content = [block_no_text, block_with_text]
        mc = MagicMock()
        mc.messages.create.return_value = mock_resp
        with patch("services.ai_provider.anthropic.Anthropic", return_value=mc):
            assert _call_anthropic("key", "prompt") == '{"ok":1}'


# ── call_ai_sync ──────────────────────────────────────────────────────────────


class TestCallAiSync:
    def test_uses_first_available_provider(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "real-key-abc")
        mock_caller = MagicMock(return_value='{"ok":1}')
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [{"name": "gemini", "env_key": "GEMINI_KEY", "caller": mock_caller}],
        )
        assert call_ai_sync("prompt") == '{"ok":1}'
        mock_caller.assert_called_once()

    def test_failover_to_next_provider(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "real-key-abc")
        monkeypatch.setenv("OPENAI_KEY", "real-key-def")
        mock_gemini = MagicMock(side_effect=Exception("Gemini down"))
        mock_openai = MagicMock(return_value='{"ok":1}')
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [
                {"name": "gemini", "env_key": "GEMINI_KEY", "caller": mock_gemini},
                {"name": "openai", "env_key": "OPENAI_KEY", "caller": mock_openai},
            ],
        )
        assert call_ai_sync("prompt") == '{"ok":1}'
        mock_openai.assert_called_once()

    def test_all_providers_fail_raises_503(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "real-key-abc")
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [{"name": "gemini", "env_key": "GEMINI_KEY", "caller": MagicMock(side_effect=Exception("down"))}],
        )
        with pytest.raises(HTTPException) as exc:
            call_ai_sync("prompt")
        assert exc.value.status_code == 503

    def test_no_configured_keys_raises_500(self, monkeypatch):
        monkeypatch.delenv("ABSENT_KEY_XYZ", raising=False)
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [{"name": "gemini", "env_key": "ABSENT_KEY_XYZ", "caller": MagicMock()}],
        )
        with pytest.raises(HTTPException) as exc:
            call_ai_sync("prompt")
        assert exc.value.status_code == 500

    def test_skips_mock_prefixed_keys(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "mock-fake")
        monkeypatch.setenv("OPENAI_KEY", "real-key-def")
        mock_gemini = MagicMock(return_value='{"ok":1}')
        mock_openai = MagicMock(return_value='{"ok":1}')
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [
                {"name": "gemini", "env_key": "GEMINI_KEY", "caller": mock_gemini},
                {"name": "openai", "env_key": "OPENAI_KEY", "caller": mock_openai},
            ],
        )
        call_ai_sync("prompt")
        mock_gemini.assert_not_called()

    def test_retries_on_transient_429_error(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "real-key-abc")
        count = {"n": 0}

        def flaky(**kwargs):
            count["n"] += 1
            if count["n"] < 3:
                raise Exception("429 rate limit exceeded")
            return '{"ok":1}'

        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [{"name": "gemini", "env_key": "GEMINI_KEY", "caller": flaky}],
        )
        with patch("time.sleep"):
            result = call_ai_sync("prompt")
        assert result == '{"ok":1}'
        assert count["n"] == 3  # 1 initial + 2 retries (_MAX_RETRIES == 2)

    def test_non_retryable_error_goes_to_next_provider_immediately(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "real-key-abc")
        monkeypatch.setenv("OPENAI_KEY", "real-key-def")
        count = {"n": 0}

        def always_fail(**kwargs):
            count["n"] += 1
            raise Exception("permanent auth error")

        mock_openai = MagicMock(return_value='{"ok":1}')
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [
                {"name": "gemini", "env_key": "GEMINI_KEY", "caller": always_fail},
                {"name": "openai", "env_key": "OPENAI_KEY", "caller": mock_openai},
            ],
        )
        result = call_ai_sync("prompt")
        assert count["n"] == 1  # No retries for non-transient errors
        assert result == '{"ok":1}'

    def test_passes_system_instruction_to_caller(self, monkeypatch):
        monkeypatch.setenv("GEMINI_KEY", "real-key-abc")
        mock_caller = MagicMock(return_value='{"ok":1}')
        monkeypatch.setattr(
            ai_provider,
            "_PROVIDERS",
            [{"name": "gemini", "env_key": "GEMINI_KEY", "caller": mock_caller}],
        )
        call_ai_sync("prompt", system_instruction="Custom system")
        _, kwargs = mock_caller.call_args
        assert kwargs["system_instruction"] == "Custom system"
