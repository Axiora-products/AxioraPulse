import os

import sentry_sdk


def init_sentry() -> None:
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return

    environment = os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "local"
    traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    profiles_sample_rate = float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0"))

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
        send_default_pii=False,
    )
