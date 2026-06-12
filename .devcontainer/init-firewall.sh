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
ipset create allowed-out hash:ip

# Resolve every allowlisted domain to IPs (re-run this script to refresh).
while IFS= read -r line; do
    domain="${line%%#*}"
    domain="$(echo "$domain" | tr -d '[:space:]')"
    [ -z "$domain" ] && continue
    for ip in $(dig +short A "$domain" | grep -E '^[0-9.]+$' || true); do
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
