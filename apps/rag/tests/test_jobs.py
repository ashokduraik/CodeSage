from workers.jobs import JOB_TYPES, is_known_job


def test_known_job_types() -> None:
    assert set(JOB_TYPES) == {"sync", "parse", "embed"}
    for job_type in JOB_TYPES:
        assert is_known_job(job_type) is True


def test_unknown_job_type() -> None:
    assert is_known_job("nope") is False
