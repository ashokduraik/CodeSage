"""Tests for audience routing."""

from services.router.classify import is_code_audience


def test_is_code_audience_for_developer() -> None:
    assert is_code_audience("developer") is True


def test_is_code_audience_for_end_user() -> None:
    assert is_code_audience("end_user") is False
