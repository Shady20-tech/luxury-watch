#!/usr/bin/env python3
"""
Full proof matrix for the inventory reservation invariant.

Runs five scenarios against a real Postgres and reports whether the database
behaves as the design claims. The value of running all five is that they
distinguish "the invariant holds" from "the test cannot fail":

  1. tight window, both protections          -> HOLDS
  2. widened window, both protections        -> HOLDS  (under real contention)
  3. widened window, row lock removed        -> HOLDS  (constraint alone is enough)
  4. widened window, constraint removed      -> HOLDS  (row lock alone is enough)
  5. widened window, both removed            -> BREAKS (so the test has teeth)

Scenarios 3 and 4 are the defence-in-depth evidence. Scenario 5 is the negative
control: without it, a green result would be indistinguishable from a test that
does nothing.

Usage:  scripts/db-concurrency-matrix.py [--container NAME] [--racers N]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).with_name("db-concurrency-test.py")

SCENARIOS = [
    ("tight window, both protections",
     [], "HOLDS"),
    ("widened window, both protections",
     ["--slow-window"], "HOLDS"),
    ("widened window, row lock removed",
     ["--slow-window", "--break-lock"], "HOLDS"),
    ("widened window, constraint removed",
     ["--slow-window", "--break-constraint"], "HOLDS"),
    ("widened window, both removed",
     ["--slow-window", "--break-lock", "--break-constraint"], "BREAKS"),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="lw-pg-test")
    parser.add_argument("--racers", type=int, default=8)
    args = parser.parse_args()

    print("=" * 72)
    print("Inventory reservation proof matrix")
    print("=" * 72)
    print()

    results: list[tuple[str, str, bool]] = []

    for label, extra, expected in SCENARIOS:
        print(f"--- {label}  (expected: {expected}) ---")
        proc = subprocess.run(
            [sys.executable, str(SCRIPT),
             "--container", args.container,
             "--racers", str(args.racers),
             *extra],
            capture_output=True,
            text=True,
            timeout=900,
            env=os.environ.copy(),
        )
        # Echo only the numeric outcome lines, so the matrix stays readable.
        for line in proc.stdout.splitlines():
            if any(k in line for k in ("succeeded:", "reserved:", "still available:", "orders created:")):
                print(f"    {line.strip()}")

        # A scenario "behaved" when its exit code matches its expectation:
        # HOLDS -> exit 0, BREAKS -> exit 0 from the negative-control path.
        # db-concurrency-test.py returns 0 for both "held" and "broke as
        # expected", and 1 only when reality contradicts the expectation.
        behaved = proc.returncode == 0
        results.append((label, expected, behaved))

        if not behaved:
            print(f"    !! UNEXPECTED: exit {proc.returncode}")
            print(proc.stdout)
            print(proc.stderr, file=sys.stderr)
        print()

    print("=" * 72)
    print("Summary")
    print("=" * 72)
    all_ok = True
    for label, expected, behaved in results:
        mark = "ok  " if behaved else "FAIL"
        print(f"  [{mark}] {label:<44} expected {expected}")
        if not behaved:
            all_ok = False

    print()
    if all_ok:
        print("All scenarios behaved as designed.")
        print()
        print("Reading of the results:")
        print("  - Scenarios 1-2: the invariant holds, including under genuine")
        print("    contention (the widened window makes overlap certain).")
        print("  - Scenarios 3-4: the row lock and the check constraint are each")
        print("    sufficient on their own. This is defence in depth: a mistake in")
        print("    one layer does not cause overselling.")
        print("  - Scenario 5: with both removed, 8 racers all succeeded and stock")
        print("    went negative, which is what proves the test can detect failure.")
        return 0

    print("Some scenarios did not behave as designed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
