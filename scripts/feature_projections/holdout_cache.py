"""On-disk cache for held-out learned/residual predictions (GH #597).

``holdout_eval.gather_predictions`` retrains every learned/residual model from
scratch (plus full DB fetches + feature computation) on every invocation, and
``significance.py`` calls it once per pair. That makes the honest workflow much
slower than the leaked ``accuracy-report`` flow it must replace — a friction tax
that pushes agents back toward the in-sample shortcut. With the rolling protocol
(#594) multiplying folds, it gets worse.

This module caches a learned model's held-out output per
``(model_name, train_window, eval_window, model-definition fingerprint)``. The
fingerprint hashes the model's definition *chain* (its own + every base it
depends on: features, interactions, combiner type, base chain, training filter)
plus a global feature-code version (the hash of the feature modules + the
training/combiner code). Editing a model's definition — or any feature code —
invalidates only the affected entries; everything else is reused.

The cached payload stores both the trained ``params`` (so a dependent residual
can still load its base from the sandbox on a cache hit) and the per-season
``preds`` ``{season: {player_id: projected_ppg}}``.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Optional

from scripts.feature_projections.model_config import get_model

_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_DIR = Path(_repo_root) / ".cache" / "holdout"

# Source files whose contents define how a learned model is trained / how its
# features are computed. Any edit here conservatively invalidates the whole
# cache (the predictions could change), which is the safe default.
_FEATURE_DIR = Path(os.path.dirname(os.path.abspath(__file__))) / "features"
_CODE_FILES = [
    Path(os.path.dirname(os.path.abspath(__file__))) / "train_model.py",
    Path(os.path.dirname(os.path.abspath(__file__))) / "learned_combiner.py",
    Path(os.path.dirname(os.path.abspath(__file__))) / "combiner.py",
]

_feature_code_version_cache: Optional[str] = None


def feature_code_version() -> str:
    """Hash the feature modules + training/combiner code (memoized per process)."""
    global _feature_code_version_cache
    if _feature_code_version_cache is not None:
        return _feature_code_version_cache
    h = hashlib.sha256()
    files = sorted(_FEATURE_DIR.glob("*.py")) + _CODE_FILES
    for f in files:
        try:
            h.update(f.read_bytes())
        except OSError:
            h.update(f"missing:{f.name}".encode())
    _feature_code_version_cache = h.hexdigest()[:16]
    return _feature_code_version_cache


def _definition_chain(model_name: str) -> list:
    """Serializable definition of a model and every base it depends on."""
    chain: list = []
    cur: Optional[str] = model_name
    seen: set = set()
    while cur and cur not in seen:
        seen.add(cur)
        m = get_model(cur)
        chain.append(
            {
                "name": cur,
                "features": list(m.features),
                "interaction_terms": list(m.interaction_terms),
                "combiner_type": m.combiner_type,
                "base_model_name": m.base_model_name,
                "training_filter": dict(m.training_filter),
            }
        )
        cur = m.base_model_name
    return chain


def model_fingerprint(model_name: str) -> str:
    """Stable hash of a model's definition chain + the feature-code version."""
    payload = json.dumps(
        {"chain": _definition_chain(model_name), "code": feature_code_version()},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _cache_path(model_name: str, train_seasons: list, eval_seasons: list) -> Path:
    train = "-".join(str(s) for s in sorted(train_seasons))
    ev = "-".join(str(s) for s in sorted(eval_seasons))
    fp = model_fingerprint(model_name)
    return CACHE_DIR / f"{model_name}__train{train}__eval{ev}__{fp}.json"


def load(
    model_name: str, train_seasons: list, eval_seasons: list
) -> Optional[dict]:
    """Return ``{"params": ..., "preds": {season:int -> {pid: ppg}}}`` or None."""
    path = _cache_path(model_name, train_seasons, eval_seasons)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    preds = {int(s): v for s, v in raw.get("preds", {}).items()}
    return {"params": raw.get("params"), "preds": preds}


def store(
    model_name: str,
    train_seasons: list,
    eval_seasons: list,
    params: dict,
    preds: dict,
) -> None:
    """Persist a model's held-out params + per-season predictions."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(model_name, train_seasons, eval_seasons)
    payload = {"params": params, "preds": {str(s): v for s, v in preds.items()}}
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload))
    tmp.replace(path)
