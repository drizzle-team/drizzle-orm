#!/usr/bin/env bash
# Publishes a built package directory as an orphan git branch (repo root = package root).
set -euo pipefail

branch="${1:?Usage: publish-pkg-branch.sh <branch> <src-dir> [commit-message]}"
src_dir="${2:?Usage: publish-pkg-branch.sh <branch> <src-dir> [commit-message]}"
commit_msg="${3:-chore: publish ${branch} from ${GITHUB_SHA:-local}}"

if [[ ! -d "${src_dir}" ]]; then
	echo "Source directory does not exist: ${src_dir}" >&2
	exit 1
fi

if [[ -z "$(ls -A "${src_dir}")" ]]; then
	echo "Source directory is empty: ${src_dir}" >&2
	exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

cp -a "${src_dir}/." "${workdir}/"
cd "${workdir}"

git init -q
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "${commit_msg}"
git branch -M "${branch}"

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git push -f origin "${branch}"

echo "Published ${branch} from ${src_dir}"
