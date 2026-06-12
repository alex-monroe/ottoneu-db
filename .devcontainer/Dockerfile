# Python 3.9 to match the project's target version (CLAUDE.md: no 3.10+ syntax).
FROM mcr.microsoft.com/devcontainers/python:3.9-bookworm

# Firewall tooling + just (build runner used by every project recipe)
RUN apt-get update \
    && apt-get install -y --no-install-recommends iptables ipset dnsutils \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh \
       | bash -s -- --to /usr/local/bin

# Playwright/Chromium system dependencies for the scraping pipeline
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
       libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
       libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*
