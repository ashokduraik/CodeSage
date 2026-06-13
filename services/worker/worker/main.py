"""Worker process entrypoint.

Phase 0 skeleton: stays alive but consumes no jobs yet. Real Procrastinate worker startup
(`app.run_worker(...)`) is wired in Phase 3 once the queue schema + handlers exist.
"""

import time


def main() -> None:  # pragma: no cover
    print(
        "codesage worker skeleton: ready (Procrastinate job consumption lands in Phase 3)",
        flush=True,
    )
    while True:
        time.sleep(3600)


if __name__ == "__main__":  # pragma: no cover
    main()
