"""Provision an OAuth client for the MCP server by hand.

Most MCP clients register themselves through dynamic client registration
(``POST /api/oauth/register``) and never need this. Use it when a client can't
do DCR — for example Gemini Spark's "Advanced features" path, where you paste a
client ID and secret into the connection dialog — or when DCR is misbehaving
and you want to bypass it.

The secret is printed once and stored only as a SHA-256 hash, matching
``sha256Hex`` in ``web/lib/oauth/crypto.ts``. There is no way to recover it
afterwards; re-run this to issue a new client.

Usage:
    venv/bin/python scripts/oauth_client.py create \\
        --name "Gemini Spark" --redirect-uri https://example.com/callback
    venv/bin/python scripts/oauth_client.py list
    venv/bin/python scripts/oauth_client.py revoke --client-id mcp_xxx
"""

from __future__ import annotations

import argparse
import hashlib
import secrets
import sys

from scripts.config import get_supabase_client


def _sha256_hex(value: str) -> str:
    """Hex SHA-256 digest — must match sha256Hex() in web/lib/oauth/crypto.ts."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_client(name: str, redirect_uris: list[str], public: bool) -> int:
    supabase = get_supabase_client()

    client_id = f"mcp_{secrets.token_urlsafe(16)}"
    client_secret = None if public else secrets.token_urlsafe(32)

    supabase.table("oauth_clients").insert(
        {
            "client_id": client_id,
            "client_secret_hash": _sha256_hex(client_secret) if client_secret else None,
            "client_name": name,
            "redirect_uris": redirect_uris,
            "grant_types": ["authorization_code", "refresh_token"],
            "scope": "league:read",
        }
    ).execute()

    print("OAuth client created.\n")
    print(f"  client_name   : {name}")
    print(f"  client_id     : {client_id}")
    if client_secret:
        print(f"  client_secret : {client_secret}")
        print("\n  Save the secret now — it is stored hashed and cannot be shown again.")
    else:
        print("  client_secret : (public client — PKCE only, no secret)")
    print(f"  redirect_uris : {', '.join(redirect_uris)}")
    return 0


def list_clients() -> int:
    supabase = get_supabase_client()
    # pagination-safe: a handful of registered clients, far under the 1000-row cap.
    result = (
        supabase.table("oauth_clients")
        .select("client_id, client_name, redirect_uris, created_at, client_secret_hash")
        .order("created_at")
        .execute()
    )
    rows = result.data or []
    if not rows:
        print("No OAuth clients registered.")
        return 0

    print(f"{len(rows)} registered OAuth client(s):\n")
    for row in rows:
        kind = "confidential" if row.get("client_secret_hash") else "public"
        print(f"  {row['client_id']}  [{kind}]  {row['client_name']}")
        print(f"    redirect_uris: {', '.join(row.get('redirect_uris') or [])}")
        print(f"    created: {row.get('created_at')}")
    return 0


def revoke_client(client_id: str) -> int:
    supabase = get_supabase_client()
    result = supabase.table("oauth_clients").delete().eq("client_id", client_id).execute()
    if not result.data:
        print(f"No client with client_id {client_id}.")
        return 1
    # Codes and refresh tokens cascade on delete (migration 034).
    print(f"Deleted client {client_id}; its codes and refresh tokens were revoked with it.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="Register a new OAuth client")
    create.add_argument("--name", required=True, help="Human-readable client name")
    create.add_argument(
        "--redirect-uri",
        required=True,
        action="append",
        dest="redirect_uris",
        help="Allowed redirect URI (repeatable)",
    )
    create.add_argument(
        "--public",
        action="store_true",
        help="Register as a public client (PKCE only, no client secret)",
    )

    sub.add_parser("list", help="List registered OAuth clients")

    revoke = sub.add_parser("revoke", help="Delete a client and revoke its grants")
    revoke.add_argument("--client-id", required=True)

    args = parser.parse_args()

    if args.command == "create":
        return create_client(args.name, args.redirect_uris, args.public)
    if args.command == "list":
        return list_clients()
    if args.command == "revoke":
        return revoke_client(args.client_id)
    return 1


if __name__ == "__main__":
    sys.exit(main())
