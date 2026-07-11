"""Reference retrieval distances used to calibrate the abstain threshold.

These values are synthetic stand-ins for observed cosine-distance bands during
developer QA. They document why ``retrieval_max_distance`` was tightened from
``0.55`` to ``0.45``: strong code matches stay well below the gate, while generic
short inputs like ``hi`` and borderline weak matches sit above it.
"""

from __future__ import annotations

# Typical strong match when the question aligns with indexed source.
STRONG_CODE_MATCH_DISTANCE = 0.28

# Tangentially related chunk — should abstain rather than ground an answer.
BORDERLINE_WEAK_MATCH_DISTANCE = 0.48

# Generic greeting embedding often lands near unrelated service files.
GENERIC_GREETING_MATCH_DISTANCE = 0.52

# Default threshold chosen so strong matches pass and weak/generic inputs fail.
CALIBRATED_MAX_DISTANCE = 0.45
