"""Workflow structure checks for steps that depend on a gated Checkout."""
from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"


def test_arbitration_revalidate_is_gated_like_checkout():
    """Out of season Checkout is skipped; a local action step must be skipped too."""
    wf = yaml.safe_load((WORKFLOWS / "scrape-arbitration-progress.yml").read_text())
    steps = wf["jobs"]["scrape"]["steps"]
    checkout = next(s for s in steps if s.get("name") == "Checkout")
    revalidate = next(s for s in steps if s.get("name") == "Revalidate site")
    assert checkout["if"] in revalidate.get("if", ""), (
        "Revalidate site uses a local action, so it must carry the same `if:` as Checkout"
    )
