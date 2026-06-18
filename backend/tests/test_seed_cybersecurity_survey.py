"""
tests/test_seed_cybersecurity_survey.py
────────────────────────────────────────
Tests that seed_cybersecurity_survey.py executes without errors when given
a mock database session.  Because the script runs module-level code on import,
we patch SessionLocal before each fresh import.
"""

import sys
import uuid
import importlib
from unittest.mock import MagicMock, patch


class _ChainedQuery:
    """Minimal stand-in for a SQLAlchemy query chain."""

    def __init__(self, value=None):
        self._value = value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._value

    def all(self):
        return []


class _MockDB:
    """Mock SQLAlchemy session that records added objects without touching a DB."""

    def __init__(self, user=None, tenant=None):
        self._user = user
        self._tenant = tenant
        self.added_objects = []

    def query(self, model):
        from db import models as m

        if model is m.UserProfile:
            return _ChainedQuery(self._user)
        if model is m.Tenant:
            return _ChainedQuery(self._tenant)
        return _ChainedQuery(None)

    def add(self, obj):
        self.added_objects.append(obj)

    def flush(self):
        pass

    def commit(self):
        pass

    def close(self):
        pass

    def refresh(self, obj):
        pass


def _run_seed(mock_db):
    """Remove any cached module then import with the provided mock session."""
    sys.modules.pop("seed_cybersecurity_survey", None)
    with patch("db.database.SessionLocal", return_value=mock_db):
        importlib.import_module("seed_cybersecurity_survey")


def test_seed_creates_all_entity_types_when_nothing_exists():
    """When neither tenant nor user exist, the script creates them both."""
    mock_db = _MockDB(user=None, tenant=None)
    _run_seed(mock_db)

    from db.models import Survey, SurveyQuestion, SurveyResponse, SurveyAnswer, UserProfile, Tenant

    types_added = {type(o) for o in mock_db.added_objects}
    assert Tenant in types_added
    assert UserProfile in types_added
    assert Survey in types_added
    assert SurveyQuestion in types_added
    assert SurveyResponse in types_added
    assert SurveyAnswer in types_added


def test_seed_skips_tenant_creation_when_tenant_exists():
    """When a tenant already exists, no new Tenant should be created."""
    mock_tenant = MagicMock()
    mock_tenant.id = uuid.uuid4()
    mock_tenant.name = "Existing Tenant"

    mock_db = _MockDB(user=None, tenant=mock_tenant)
    _run_seed(mock_db)

    from db.models import Tenant

    added_types = [type(o) for o in mock_db.added_objects]
    assert Tenant not in added_types


def test_seed_skips_user_and_tenant_creation_when_user_exists():
    """When user already exists, neither UserProfile nor Tenant should be created."""
    mock_tenant = MagicMock()
    mock_tenant.id = uuid.uuid4()
    mock_tenant.name = "Existing Tenant"

    mock_user = MagicMock()
    mock_user.email = "varshinibobbarala22@gmail.com"
    mock_user.tenant_id = mock_tenant.id
    mock_user.id = uuid.uuid4()

    mock_db = _MockDB(user=mock_user, tenant=mock_tenant)
    _run_seed(mock_db)

    from db.models import UserProfile, Tenant

    added_types = [type(o) for o in mock_db.added_objects]
    assert UserProfile not in added_types
    assert Tenant not in added_types


def test_seed_creates_30_questions():
    """Exactly 30 SurveyQuestion objects should be created."""
    mock_db = _MockDB(user=None, tenant=None)
    _run_seed(mock_db)

    from db.models import SurveyQuestion

    questions = [o for o in mock_db.added_objects if isinstance(o, SurveyQuestion)]
    assert len(questions) == 30


def test_seed_creates_55_responses():
    """Exactly 55 SurveyResponse objects should be created."""
    mock_db = _MockDB(user=None, tenant=None)
    _run_seed(mock_db)

    from db.models import SurveyResponse

    responses = [o for o in mock_db.added_objects if isinstance(o, SurveyResponse)]
    assert len(responses) == 55


def test_seed_creates_1650_answers():
    """55 responses × 30 questions = 1650 SurveyAnswer objects."""
    mock_db = _MockDB(user=None, tenant=None)
    _run_seed(mock_db)

    from db.models import SurveyAnswer

    answers = [o for o in mock_db.added_objects if isinstance(o, SurveyAnswer)]
    assert len(answers) == 1650


def test_seed_survey_has_expected_title():
    """The created Survey should have the cybersecurity investor readiness title."""
    mock_db = _MockDB(user=None, tenant=None)
    _run_seed(mock_db)

    from db.models import Survey

    surveys = [o for o in mock_db.added_objects if isinstance(o, Survey)]
    assert len(surveys) == 1
    assert "Cybersecurity" in surveys[0].title or "cybersecurity" in surveys[0].title.lower()
