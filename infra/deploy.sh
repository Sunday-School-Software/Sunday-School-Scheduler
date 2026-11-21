#!/bin/bash
# Builds a commit of the app and installs it on the server. From anywhere in
# the repo:
#   infra/deploy.sh          # ships origin/main
#   infra/deploy.sh <ref>    # ships another branch, tag or commit
# docs/setup.md ("Deploy the app") explains what it needs and what it does.
#
# It builds the commit itself, not the files in your working tree, so
# uncommitted changes never reach the server.
set -euo pipefail

infra=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$infra")
ref=${1:-origin/main}

die() {
  echo "deploy.sh: $*" >&2
  exit 1
}

# Everything about the server comes from Terraform's outputs, so this works
# from any clone that has run `terraform init` against the state bucket.
# Reading them needs the state bucket, so an expired AWS session fails here.
output() {
  terraform -chdir="$infra" output -raw "$1" ||
    die "Couldn't read Terraform's '$1' output (Terraform's error is above). See \"Deploy the app\" in docs/setup.md."
}
instance_id=$(output instance_id)
region=$(output region)
bucket=$(output release_bucket)
url=$(output url)

state=$(aws ec2 describe-instances --region "$region" --instance-ids "$instance_id" \
  --query 'Reservations[0].Instances[0].State.Name' --output text) ||
  die "Couldn't look up the server. Is the AWS CLI signed in?"
if [[ $state != running ]]; then
  die "The server is $state. Set running = true in infra/terraform.tfvars and run 'terraform apply' first."
fi

git -C "$repo" fetch --quiet origin
commit=$(git -C "$repo" rev-parse --verify --quiet "$ref^{commit}") || die "No commit called '$ref'."
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo" rev-parse --short "$commit")"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/src" "$work/release"
git -C "$repo" archive "$commit" | tar -x -C "$work/src"
[[ -f $work/src/infra/install-release.sh ]] || die "$ref is older than this deploy script and can't be deployed with it."

echo "Building $ref ($release_id)"
for project in api web; do
  (cd "$work/src/$project" && npm ci --no-audit --no-fund --loglevel=error && npm run build)
done

# The server installs the API's packages itself (install-release.sh), so only
# the built code and the lockfile go in the release.
mkdir "$work/release/api"
cp -R "$work/src/api/dist" "$work/src/api/package.json" "$work/src/api/package-lock.json" "$work/release/api/"
cp -R "$work/src/web/dist" "$work/release/web"
cp "$work/src/infra/install-release.sh" "$work/src/infra/sunday-school-api.service" "$work/release/"
output api_env >"$work/release/api.env"

# macOS's tar would otherwise add a ._ file next to each file.
export COPYFILE_DISABLE=1
tar -czf "$work/release.tar.gz" -C "$work/release" .
key="releases/$release_id.tar.gz"
aws s3 cp --only-show-errors --region "$region" "$work/release.tar.gz" "s3://$bucket/$key"

# The commands run as root on the server. The files keep the modes your umask
# gave them, so chmod lets the API's user and Caddy read them. Every value in them is made of
# letters, digits and - _ . / only, so they need no escaping in JSON.
dir="/srv/sunday-school/releases/$release_id"
cat >"$work/parameters.json" <<JSON
{
  "executionTimeout": ["600"],
  "commands": [
    "set -eu",
    "mkdir -p $dir",
    "aws s3 cp --only-show-errors --region $region s3://$bucket/$key /tmp/$release_id.tar.gz",
    "tar -xzf /tmp/$release_id.tar.gz --no-same-owner -C $dir",
    "chmod -R u=rwX,go=rX $dir",
    "rm /tmp/$release_id.tar.gz",
    "bash $dir/install-release.sh"
  ]
}
JSON

echo "Installing $release_id on $instance_id"
command_id=$(aws ssm send-command --region "$region" --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript --comment "Deploy $release_id" \
  --parameters "file://$work/parameters.json" --query Command.CommandId --output text)

invocation() {
  aws ssm get-command-invocation --region "$region" --command-id "$command_id" \
    --instance-id "$instance_id" --query "$1" --output text
}

# The command's status, every 5 seconds, for up to 10 minutes (its timeout).
# Right after sending, AWS may not know the invocation yet.
status=Pending
for _ in $(seq 120); do
  sleep 5
  status=$(invocation Status 2>/dev/null) || status=Pending
  [[ $status == Pending || $status == InProgress || $status == Delayed ]] || break
done

invocation StandardOutputContent || true
if [[ $status != Success ]]; then
  invocation StandardErrorContent >&2
  die "The install on the server ended with status $status. See the output above, and 'If a deploy fails' in docs/setup.md."
fi

# The server checked the API itself. This checks the way users reach it,
# through Caddy and HTTPS.
code=000
for _ in $(seq 5); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url/api/health") || code=000
  [[ $code == 200 ]] && break
  sleep 2
done
[[ $code == 200 ]] || die "$url/api/health answered $code instead of 200."

echo "Deployed $release_id to $url ($url/api/health answered 200)"
