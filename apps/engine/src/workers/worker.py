"""Background job consumer loop."""

import threading

from config import Settings
from workers.consumer import run_job_consumer


def run_worker_loop(settings: Settings, stop_event: threading.Event) -> None:
    """Run the Postgres job consumer until ``stop_event`` is set.

    @param settings - Application settings loaded at startup.
    @param stop_event - Event signalled on application shutdown.
    """
    run_job_consumer(settings, stop_event)
