#!/usr/bin/env bash
# Publishes preview builds to pkg.pr.new and writes the install commands to the job summary:
#   bash .github/ci/publish-preview.sh <comment> <package dir>...
# <comment> is "update" (one comment for each pull request, edited on each publish) or "off". All package
# directories go to one publish, so a pull request gets one comment for all of them. Run it from the repository root
# after `pnpm install`: pkg-pr-new comes from the lockfile of the postgres package.
set -euo pipefail

comment="${1:?usage: publish-preview.sh <comment> <package dir>...}"
shift
root="$(pwd)"

# --previewVersion sets every version to 0.0.0-preview-<sha>, and the peer dependencies between the published
# packages to match, so a preview never takes the place of the npm release with the same number.
# pkg-pr-new runs from the repository root: it makes each directory relative to its own working directory, and its
# file search rejects the empty pattern that the working directory itself becomes.
publish() {
	"$root/postgres/node_modules/.bin/pkg-pr-new" publish --json "$root/preview.json" --previewVersion \
		--comment="$comment" --packageManager=bun,npm "$@"
}

summary() {
	{
		echo "## Preview release"
		echo
		if [ "$1" != success ]; then
			echo "Publishing to pkg.pr.new failed. If this persists, make sure that the pkg.pr.new GitHub App is installed"
			echo "on this repository."
		elif [ -s "$root/preview.json" ]; then
			echo "Install this commit directly:"
			echo
			echo '```sh'
			jq -r '.packages[] | "bun add \(.url)"' "$root/preview.json"
			echo '```'
			echo
			# The version comes from the URL that pkg-pr-new returned, because pkg-pr-new picks the length of the
			# abbreviated commit hash itself.
			echo "| Package | Version | URL |"
			echo "| --- | --- | --- |"
			jq -r '.packages[] | "| `\(.name)` | `0.0.0-preview-\(.url | split("@") | last)` | \(.url) |"' "$root/preview.json"
			echo
			echo "Built from \`${GITHUB_SHA}\`. Preview builds expire, and they are not a release."
		else
			echo "pkg.pr.new reported success but gave no metadata, so there is no install URL to show."
		fi
	} >>"${GITHUB_STEP_SUMMARY:-/dev/stdout}"
}

# The pkg.pr.new server knows a run only after GitHub delivers the workflow_run webhook to it. When that webhook
# comes late, the check answers "There is no workflow defined" (HTTP 404), so try again after a pause. A webhook
# that never comes needs a re-run of the job.
for attempt in 1 2 3 4; do
	if publish "$@" 2>&1 | tee "$root/publish.log"; then
		summary success
		exit 0
	fi
	if ! grep -q 'There is no workflow defined' "$root/publish.log" || [ "$attempt" = 4 ]; then
		summary failure
		exit 1
	fi
	echo "pkg.pr.new does not know this run yet (attempt $attempt of 4). Trying again in 20 s."
	sleep 20
done
