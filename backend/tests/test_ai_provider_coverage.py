"""Coverage for services.ai_provider circuit-breaker helpers."""

from services import ai_provider as ap


def test_breaker_opens_after_threshold_and_resets_on_success():
    name = "test-provider-breaker-unique"
    ap._breaker_record_success(name)  # ensure clean state
    assert ap._breaker_is_open(name) is False

    for _ in range(ap._BREAKER_THRESHOLD):
        ap._breaker_record_failure(name)

    assert ap._breaker_is_open(name) is True

    # A success clears the breaker.
    ap._breaker_record_success(name)
    assert ap._breaker_is_open(name) is False
