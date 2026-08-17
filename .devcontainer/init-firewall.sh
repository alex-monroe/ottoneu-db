#!/usr/bin/env bash
# Default-deny egress firewall for the autonomous devcontainer.
# Adapted from Anthropic's claude-code reference devcontainer: resolves the
# domains in allowed-domains.txt into an ipset and drops all other outbound
# traffic. This is the safety boundary that makes
# `claude --dangerously-skip-permissions` reasonable to run in here.
#
# Run as root (postStartCommand does `sudo bash .devcontainer/init-firewall.sh`).
set -euo pipefail

DOMAINS_FILE="$(dirname "$0")/allowed-domains.txt"
# Rotating CDN/anycast pools (npm's Cloudflare edge, Supabase, GitHub raw) hand
# back a different subset of the pool on each query. Resolving a hostname once
# pins one snapshot and every later rotation gets REJECTed — which is exactly
# what an "intermittent" MCP/network failure looks like. Query a few times and
# union the answers to cover more of each pool.
DNS_ROUNDS="${DNS_ROUNDS:-3}"

iptables -F OUTPUT
iptables -F INPUT
ipset destroy allowed-out 2>/dev/null || true
# hash:net stores both CIDR ranges and single IPs (added as /32), so the
# allowlist can pin a whole published range (e.g. GitHub's rotating IP pool)
# instead of one snapshot IP that goes stale on the next DNS rotation.
ipset create allowed-out hash:net

# ---------------------------------------------------------------------------
# Phase 0: fetch GitHub's published ranges while egress is still open.
#
# OUTPUT was just flushed and its default policy is ACCEPT, so this runs before
# any REJECT rule exists. It MUST stay above the rule-building section below.
#
# Why this is fetched rather than hardcoded: api.github.com is GeoDNS over a
# pool of ~24 IPv4 endpoints. Only four of them are the "classic" blocks
# (192.30.252.0/22, 185.199.108.0/22, 140.82.112.0/20, 143.55.64.0/20); the
# other twenty are Azure regional edges (20.x, 4.x, 48.x, 172.182.x) that share
# no common prefix and change over time. Pinning only the classic blocks meant
# any lookup landing on an Azure edge was rejected — the GitHub MCP server and
# `git push` failed intermittently, depending purely on which edge DNS returned.
# ---------------------------------------------------------------------------
github_meta_cidrs=""
meta_json="$(curl -fsS --max-time 10 https://api.github.com/meta 2>/dev/null || true)"
if [ -n "$meta_json" ]; then
    github_meta_cidrs="$(printf '%s' "$meta_json" | python3 -c '
import json, sys
try:
    meta = json.load(sys.stdin)
except Exception:
    sys.exit(1)
out = set()
# "api" = MCP server + gh CLI, "git" = clone/push, "web" = github.com,
# "packages" = GHCR. IPv6 entries are skipped: the v6 chain is default-reject
# (see below), so everything is forced onto this audited v4 path.
for key in ("api", "web", "git", "packages"):
    for entry in meta.get(key, []):
        if ":" not in entry:
            out.add(entry)
print("\n".join(sorted(out)))
' 2>/dev/null || true)"
fi

if [ -n "$github_meta_cidrs" ]; then
    while IFS= read -r cidr; do
        [ -z "$cidr" ] && continue
        ipset add allowed-out "$cidr" 2>/dev/null || true
    done <<< "$github_meta_cidrs"
    echo "GitHub meta: added $(printf '%s\n' "$github_meta_cidrs" | grep -c . ) published ranges."
else
    echo "WARN: api.github.com/meta fetch failed — falling back to the static" \
         "GitHub CIDRs in allowed-domains.txt. Expect intermittent GitHub" \
         "failures if DNS returns an Azure edge outside those blocks."
fi

# ---------------------------------------------------------------------------
# Resolve every allowlist entry. A line with a '/' is a literal CIDR/IP range
# (added directly); otherwise it's a hostname resolved to its current A records.
# ---------------------------------------------------------------------------
while IFS= read -r line; do
    entry="${line%%#*}"
    entry="$(echo "$entry" | tr -d '[:space:]')"
    [ -z "$entry" ] && continue
    if [[ "$entry" == */* ]]; then
        ipset add allowed-out "$entry" 2>/dev/null || true
        continue
    fi
    for _ in $(seq "$DNS_ROUNDS"); do
        for ip in $(dig +short A "$entry" | grep -E '^[0-9.]+$' || true); do
            ipset add allowed-out "$ip" 2>/dev/null || true
        done
    done
done < "$DOMAINS_FILE"

# Loopback + established flows
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# DNS (needed to resolve the allowlisted hosts at request time)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Host gateway (devcontainer plumbing: VS Code server, port forwarding)
GATEWAY="$(ip route | awk '/default/ {print $3; exit}')"
if [ -n "$GATEWAY" ]; then
    iptables -A OUTPUT -d "$GATEWAY" -j ACCEPT
fi

# Allowlisted destinations only
iptables -A OUTPUT -m set --match-set allowed-out dst -j ACCEPT

# Everything else: reject outbound, drop unsolicited inbound
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
iptables -P INPUT DROP

# ---------------------------------------------------------------------------
# IPv6: reject everything outbound.
#
# The allowlist above is IPv4-only (ipset family inet, `dig +short A`), so
# leaving the v6 chains at their default-ACCEPT policy left a hole straight
# through the "default-deny" boundary — and made behaviour nondeterministic,
# since happy-eyeballs picks v6 or v4 per connection and only one of them was
# filtered. Every allowlisted host is reachable over v4, so v6 is closed.
#
# REJECT (not DROP) so clients fail over to v4 immediately instead of stalling
# on a connect timeout first.
# ---------------------------------------------------------------------------
if command -v ip6tables >/dev/null 2>&1 && ip6tables -L >/dev/null 2>&1; then
    ip6tables -F OUTPUT
    ip6tables -F INPUT
    ip6tables -A INPUT  -i lo -j ACCEPT
    ip6tables -A OUTPUT -o lo -j ACCEPT
    ip6tables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
    ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    ip6tables -A OUTPUT -p udp --dport 53 -j ACCEPT
    ip6tables -A OUTPUT -p tcp --dport 53 -j ACCEPT
    ip6tables -A OUTPUT -j REJECT --reject-with icmp6-adm-prohibited
    ip6tables -P INPUT DROP
    echo "IPv6 egress: rejected (v4 allowlist is the only permitted path)."
else
    echo "IPv6: ip6tables unavailable — assuming the container has no v6 stack."
fi

echo "Firewall active: $(ipset list allowed-out | grep -c '^[0-9]') entries allowed."
echo "Verify: 'curl -sI https://api.anthropic.com' should work; 'curl -sI https://example.com' should fail."
