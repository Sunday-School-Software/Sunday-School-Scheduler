#!/bin/bash
# Installs a release on the server, as root. deploy.sh unpacks the release into
# /srv/sunday-school/releases/<id> and runs this copy of the script from there
# through Run Command, so every release brings its own install steps.
#
# The API and the UI each switch over in one step, with a symlink: Caddy serves
# /srv/sunday-school/web and systemd runs the API from /srv/sunday-school/api.
# If the new API doesn't answer its health check, the previous release goes
# back, so a bad deploy leaves the app as it was.
set -euo pipefail

release=$(cd "$(dirname "$0")" && pwd)
root=/srv/sunday-school
service=sunday-school-api

# Two deploys at once would switch the links under each other.
exec 9>/run/lock/sunday-school-deploy
if ! flock -n 9; then
  echo "Another deploy is running on the server. Wait for it to finish, then deploy again." >&2
  exit 1
fi

# Run Command starts the script without a home directory, which npm needs for
# its cache.
export HOME=/root

# The API's packages, without the ones only development needs. None of them
# needs an install script, so none are run: they'd run as root.
echo "Installing the API's packages"
(cd "$release/api" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)

# The settings aren't secret, but only systemd needs to read them.
install -d -m 755 /etc/sunday-school
install -m 600 "$release/api.env" /etc/sunday-school/api.env
rm "$release/api.env"

install -m 644 "$release/$service.service" "/etc/systemd/system/$service.service"
systemctl daemon-reload
systemctl enable --quiet "$service"

# Points $root/api and $root/web at a release. mv -T replaces each link in one
# step, so nothing ever sees a missing link.
switch_to() {
  local name
  for name in api web; do
    ln -sfn "$1/$name" "$root/$name.new"
    mv -T "$root/$name.new" "$root/$name"
  done
}

# Succeeds once the API answers its health check. Fails after 30 seconds.
api_healthy() {
  for _ in $(seq 30); do
    if curl -fs -o /dev/null --max-time 2 http://localhost:3000/api/health; then
      return 0
    fi
    sleep 1
  done
  return 1
}

previous=""
if [[ -L $root/api ]]; then
  previous=$(dirname "$(readlink -f "$root/api")")
fi

# The server's first boot makes $root/web as an empty folder for Caddy. rmdir
# fails rather than delete anything put there by hand.
if [[ -d $root/web && ! -L $root/web ]]; then
  rmdir "$root/web"
fi

switch_to "$release"
systemctl restart "$service"

if ! api_healthy; then
  echo "The API didn't answer http://localhost:3000/api/health within 30 seconds. Its last log lines:" >&2
  journalctl -u "$service" -n 30 --no-pager >&2 || true
  # The code and the unit go back. The settings stay the new ones, which a
  # bad release can't have broken: they come from terraform.tfvars.
  if [[ -n $previous && -d $previous ]]; then
    echo "Putting back the previous release, $(basename "$previous")." >&2
    install -m 644 "$previous/$service.service" "/etc/systemd/system/$service.service"
    systemctl daemon-reload
    switch_to "$previous"
    systemctl restart "$service"
  fi
  exit 1
fi

# Only the release that's running is kept. Each one can be built again from
# its commit.
find "$root/releases" -mindepth 1 -maxdepth 1 -type d ! -path "$release" -exec rm -rf {} +

echo "Installed $(basename "$release")"
