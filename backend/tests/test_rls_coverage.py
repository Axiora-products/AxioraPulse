"""Coverage for db.rls tenant-GUC plumbing (gated by config.ENABLE_DB_RLS)."""

from db import rls


class _FakeDB:
    def __init__(self, fail=False):
        self.calls = []
        self._fail = fail

    def execute(self, stmt, params=None):
        if self._fail:
            raise RuntimeError("db down")
        self.calls.append((str(stmt), params))


def test_apply_guc_disabled_is_noop(monkeypatch):
    monkeypatch.setattr(rls.config, "ENABLE_DB_RLS", False)

    class Boom:
        def execute(self, *a, **k):
            raise AssertionError("must not execute when RLS disabled")

    rls.apply_tenant_guc(Boom())  # returns immediately


def test_apply_guc_sets_tenant_and_bypass(monkeypatch):
    monkeypatch.setattr(rls.config, "ENABLE_DB_RLS", True)
    db = _FakeDB()
    rls.set_bypass_rls(True)
    rls.set_tenant_context("tenant-xyz")
    try:
        rls.apply_tenant_guc(db)
    finally:
        rls.clear_tenant_context()
    joined = " ".join(s for s, _ in db.calls)
    assert "app.bypass_rls" in joined
    assert "app.current_tenant" in joined


def test_apply_guc_swallows_errors(monkeypatch):
    monkeypatch.setattr(rls.config, "ENABLE_DB_RLS", True)
    rls.set_tenant_context("t-1")
    try:
        rls.apply_tenant_guc(_FakeDB(fail=True))  # must not raise
    finally:
        rls.clear_tenant_context()


def test_register_listener_disabled_is_noop(monkeypatch):
    monkeypatch.setattr(rls.config, "ENABLE_DB_RLS", False)
    rls.register_rls_listener(object())  # returns without registering


def test_register_listener_sets_guc(monkeypatch):
    monkeypatch.setattr(rls.config, "ENABLE_DB_RLS", True)
    captured = {}

    def fake_listens_for(target, name):
        def deco(fn):
            captured["fn"] = fn
            return fn

        return deco

    monkeypatch.setattr(rls.event, "listens_for", fake_listens_for)
    rls.register_rls_listener(object())
    assert "fn" in captured

    class _FakeConn:
        def __init__(self):
            self.calls = []

        def exec_driver_sql(self, sql, params=None):
            self.calls.append((sql, params))

    rls.set_bypass_rls(True)
    rls.set_tenant_context("tenant-abc")
    conn = _FakeConn()
    try:
        captured["fn"](None, None, conn)
    finally:
        rls.clear_tenant_context()
    joined = " ".join(c[0] for c in conn.calls)
    assert "app.bypass_rls" in joined
    assert "app.current_tenant" in joined
