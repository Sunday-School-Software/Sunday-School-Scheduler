#!/bin/bash
# Runs once, as root, on the instance's first boot. The output is in
# /var/log/cloud-init-output.log on the instance. Anyone who can describe the
# instance can read this script, so never put a secret in it.
#
# This is a Terraform template (server.tf): Terraform fills in the domain and
# the Caddyfile below. A shell variable written with braces, even in a comment,
# needs its dollar sign doubled here, or Terraform reads it as its own.
set -euo pipefail

# CI runs the API on Node 22. Amazon Linux 2023 installs it as node-22, so
# point plain `node` at it.
dnf install -y nodejs22 nodejs22-npm tar gzip
alternatives --set node /usr/bin/node-22
node --version
npm --version

# Caddy isn't in Amazon Linux's repositories, so install a pinned release from
# GitHub and check it against the SHA-512 in that release's checksums file.
# To upgrade, change both lines (and the version in .github/workflows/infra.yml).
CADDY_URL=https://github.com/caddyserver/caddy/releases/download/v2.11.9/caddy_2.11.9_linux_amd64.tar.gz
CADDY_SHA512=0e85544340290a16ce4bfb76fe7d65e9de1bf3a6e67f5ccfff30b30d27ea4c73e078077b7bf3e58ae60b6b12e44327705287059c775bca5782e8ee85ea7edd75
curl -fsSL --retry 5 -o /tmp/caddy.tar.gz "$CADDY_URL"
echo "$CADDY_SHA512  /tmp/caddy.tar.gz" | sha512sum -c -
tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin caddy
rm /tmp/caddy.tar.gz
caddy version

# Caddy runs as its own user, and keeps its certificates in that user's home.
useradd --system --user-group --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy

mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<'CADDYFILE'
${caddyfile}
CADDYFILE

# The deploy step (#44) puts the UI's built bundle here.
mkdir -p /srv/sunday-school/web

# Based on Caddy's own unit file. CAP_NET_BIND_SERVICE lets it listen on ports
# 80 and 443 without running as root.
cat > /etc/systemd/system/caddy.service <<'UNIT'
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
Environment=DOMAIN=${domain}
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now caddy
