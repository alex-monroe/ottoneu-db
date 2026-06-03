"""Structural tests that keep the local ``migrations/`` directory consistent.

The remote database is the system of record for *which* migrations have been
applied (Supabase tracks them in ``supabase_migrations.schema_migrations``,
auditable via the ``list_migrations`` MCP tool). The local ``migrations/*.sql``
files are the hand-authored *source of intent*. These tests prevent the local
side from drifting in the ways we can catch offline — bad filenames, gaps, or
duplicate numbers — so new files always map cleanly to a tracked version.

See: migrations/README.md for the full convention and workflow.
"""

import re
from pathlib import Path

# Resolve project root (two levels up from this test file)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "migrations"

# Canonical migration filename: 3-digit zero-padded sequence number, an
# underscore, then a lowercase snake_case slug, then ``.sql``.
#   e.g. 027_create_draft_sharks_values.sql
MIGRATION_RE = re.compile(r"^(\d{3})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$")


def _migration_files() -> list[Path]:
    """Return all ``.sql`` files in the migrations directory, sorted by name."""
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


class TestMigrationNaming:
    """Enforce the ``NNN_snake_case.sql`` convention and a gapless sequence."""

    def test_migrations_directory_exists(self):
        assert MIGRATIONS_DIR.is_dir(), (
            f"Expected a migrations directory at {MIGRATIONS_DIR}.\n"
            "Migration files are the hand-authored source of intent for schema "
            "changes — see migrations/README.md."
        )

    def test_filenames_follow_convention(self):
        """Every migration must be named ``NNN_snake_case.sql``.

        WHY: A consistent, zero-padded, sortable name lets a human (or agent)
        match a local file to its remote ``schema_migrations`` entry at a glance
        and keeps the directory listing in apply-order.

        FIX: Rename the offending file to ``NNN_lowercase_snake_case.sql`` where
        NNN is the next sequential number.
        """
        offenders = [
            p.name for p in _migration_files() if not MIGRATION_RE.match(p.name)
        ]
        assert not offenders, (
            "Migration filenames must match `NNN_snake_case.sql` "
            "(3-digit number, underscore, lowercase snake_case slug).\n"
            f"Offending files: {offenders}\n"
            "FIX: Rename them to the convention documented in migrations/README.md."
        )

    def test_numbers_are_sequential_with_no_gaps_or_duplicates(self):
        """Migration numbers must be 001, 002, … N with no gaps or repeats.

        WHY: A gap means a migration was lost; a duplicate means two files claim
        the same slot and will apply in an ambiguous order. Either is a sign the
        local directory has drifted from what was actually applied.

        FIX: Renumber so the sequence is contiguous starting at 001. If a number
        is duplicated, bump the later file(s) to the next free number.
        """
        numbers = [
            int(MIGRATION_RE.match(p.name).group(1))
            for p in _migration_files()
            if MIGRATION_RE.match(p.name)
        ]
        assert numbers, "No migration files found — expected at least one."

        duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
        assert not duplicates, (
            f"Duplicate migration numbers found: {duplicates}.\n"
            "FIX: Two files share a sequence number — bump the later one."
        )

        expected = list(range(1, len(numbers) + 1))
        actual = sorted(numbers)
        assert actual == expected, (
            "Migration numbers must form a gapless sequence starting at 001.\n"
            f"Expected {expected[0]:03d}..{expected[-1]:03d}, "
            f"but found gaps/jumps: {[f'{n:03d}' for n in actual]}.\n"
            "FIX: Renumber so the sequence is contiguous."
        )
