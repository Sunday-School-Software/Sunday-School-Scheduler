#!/bin/bash
# Runs once, as root, on the instance's first boot. The output is in
# /var/log/cloud-init-output.log on the instance. Anyone who can describe the
# instance can read this script, so never put a secret in it.
set -euo pipefail

# CI runs the API on Node 22. Amazon Linux 2023 installs it as node-22, so
# point plain `node` at it.
dnf install -y nodejs22 nodejs22-npm
alternatives --set node /usr/bin/node-22
node --version
npm --version
