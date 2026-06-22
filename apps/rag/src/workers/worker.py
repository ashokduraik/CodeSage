"""Background job consumer loop.

Phase 0 skeleton: stays alive but consumes no jobs yet. Real Procrastinate worker startup
(``app.run_worker(...)``) is wired in Phase 3 once the queue schema + handlers exist.
"""

import threading


def run_worker_loop(stop_event: threading.Event) -> None:
    """Run the job consumer loop until ``stop_event`` is set."""
    print(
        "codesage rag worker: ready (Procrastinate job consumption lands in Phase 3)",
        flush=True,
    )
    while not stop_event.wait(timeout=3600):
        pass
