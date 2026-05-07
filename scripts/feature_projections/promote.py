"""Promote a model's projections to the production player_projections table."""

from __future__ import annotations

import os
import sys

script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from config import get_supabase_client


def promote_model(model_name: str) -> int:
    """Copy model_projections → player_projections for the given model.

    Also sets the model's is_active flag and clears it from all other models.

    Returns the number of projections promoted.
    """
    supabase = get_supabase_client()

    # Look up model
    model_res = (
        supabase.table("projection_models")
        .select("id, name")
        .eq("name", model_name)
        .execute()
    )
    if not model_res.data:
        raise ValueError(f"Model '{model_name}' not found in projection_models table")

    model_id = model_res.data[0]["id"]

    # Fetch all projections for this model (paginated to avoid 1000-row default limit)
    records = []
    page_size = 1000
    offset = 0
    while True:
        proj_res = (
            supabase.table("model_projections")
            .select("player_id, season, projected_ppg")
            .eq("model_id", model_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = proj_res.data or []
        for row in page:
            records.append({
                "player_id": row["player_id"],
                "season": row["season"],
                "projected_ppg": row["projected_ppg"],
                "projection_method": model_name,
            })
        if len(page) < page_size:
            break
        offset += page_size

    if not records:
        print(f"No projections found for model '{model_name}'")
        return 0

    print(f"Promoting {len(records)} projections from model '{model_name}' to player_projections...")

    # Idempotency: clear ghost rows from previously-active models before upserting.
    # Without this, a player projected by the prior active model but NOT by the new
    # one keeps the stale row forever (upsert is keyed on player_id+season, so it
    # only overwrites rows the new model actually generates). College/rookie
    # fallback rows are preserved — update_projections.py layers them on after
    # promotion using projection_method='college_prospect'.
    seasons_to_clear = sorted({rec["season"] for rec in records})
    for season in seasons_to_clear:
        deleted = (
            supabase.table("player_projections")
            .delete()
            .eq("season", season)
            .neq("projection_method", "college_prospect")
            .execute()
        )
        print(
            f"  Cleared {len(deleted.data or [])} prior-model rows "
            f"for season {season} (kept college_prospect rows)"
        )

    # Batch upsert to player_projections
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        supabase.table("player_projections").upsert(
            batch, on_conflict="player_id,season"
        ).execute()
        print(f"  Upserted batch {i // batch_size + 1} ({len(batch)} records)")

    # Clear is_active from all models, set on promoted model
    supabase.table("projection_models").update({"is_active": False}).eq(
        "is_active", True
    ).execute()
    supabase.table("projection_models").update({"is_active": True}).eq(
        "id", model_id
    ).execute()

    print(f"Model '{model_name}' promoted and set as active.")
    return len(records)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/feature_projections/promote.py <model_name>")
        sys.exit(1)
    promote_model(sys.argv[1])
