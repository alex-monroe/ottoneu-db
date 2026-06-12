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

iptables -F OUTPUT
iptables -F INPUT
ipset destroy allowed-out 2>/dev/null || true
# hash:net stores both CIDR ranges and single IPs (added as /32), so the
# allowlist can pin a whole published range (e.g. GitHub's rotating IP pool)
# instead of one snapshot IP that goes stale on the next DNS rotation.
ipset create allowed-out hash:net

# Resolve every allowlist entry. A line with a '/' is a literal CIDR/IP range
# (added directly); otherwise it's a hostname resolved to its current A records.
while IFS= read -r line; do
    entry="${line%%#*}"
    entry="$(echo "$entry" | tr -d '[:space:]')"
    [ -z "$entry" ] && continue
    if [[ "$entry" == */* ]]; then
        ipset add allowed-out "$entry" 2>/dev/null || true
        continue
    fi
    for ip in $(dig +short A "$entry" | grep -E '^[0-9.]+$' || true); do
        ipset add allowed-out "$ip" 2>/dev/null || true
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

echo "Firewall active: $(ipset list allowed-out | grep -c '^[0-9]') IPs allowed."
echo "Verify: 'curl -sI https://api.anthropic.com' should work; 'curl -sI https://example.com' should fail."
