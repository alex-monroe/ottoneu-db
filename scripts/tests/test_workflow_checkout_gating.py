"""Workflow structure checks for steps that depend on a gated Checkout."""
import re
from pathlib import Path

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"


def _step_block(text: str, name: str) -> str:
    """Return the YAML text of the step named `name` (up to the next step)."""
    match = re.search(rf"^ +- name: {re.escape(name)}\n(.*?)(?=^ +- name: |\Z)", text, re.S | re.M)
    assert match, f"step {name!r} not found"
    return match.group(1)


def test_arbitration_revalidate_is_gated_like_checkout():
    """Out of season Checkout is skipped; a local action step must be skipped too."""
    text = (WORKFLOWS / "scrape-arbitration-progress.yml").read_text()
    checkout_if = re.search(r"^ +if: (.+)$", _step_block(text, "Checkout"), re.M)
    assert checkout_if, "Checkout should be gated on the season gate"
    assert checkout_if.group(1) in _step_block(text, "Revalidate site"), (
        "Revalidate site uses a local action, so it must carry the same `if:` as Checkout"
    )
