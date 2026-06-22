"""Tests for ORM enum wrappers."""

from models.enums import (
    JobStatus,
    ProjectStatus,
    RepoProvider,
    RepoRole,
    UserRole,
)


def test_user_role_values() -> None:
    assert UserRole.ADMIN.value == "admin"
    assert UserRole.DEVELOPER.value == "developer"


def test_repo_enums() -> None:
    assert RepoProvider.GITHUB.value == "github"
    assert RepoRole.BACKEND.value == "backend"


def test_project_and_job_status() -> None:
    assert ProjectStatus.INDEXING.value == "indexing"
    assert JobStatus.PENDING.value == "pending"
