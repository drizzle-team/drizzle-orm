#!/usr/bin/env bash
set -euo pipefail

# Always run from repo root
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

# Name of the pnpm store volume used as cache between runs
PNPM_STORE_VOLUME="pnpm-store"
PNPM_COREPACK_CACHE_VOLUME="pnpm-corepack-cache"
APK_CACHE_VOLUME="apk-cache"

docker run --rm \
  -e CI=1 \
  -v "$PROJECT_ROOT":/src \
  -v "${PNPM_STORE_VOLUME}":/pnpm/store \
  -v "${PNPM_COREPACK_CACHE_VOLUME}":/root/.cache \
  -v "${APK_CACHE_VOLUME}":/var/cache/apk \
  node:24-alpine \
  sh -lc '
    set -euo pipefail

    apk add --no-cache git >/dev/null

    APP_DIR="$(mktemp -d)"

    tar \
      --exclude="node_modules" \
      --exclude="*/node_modules" \
      --exclude=".turbo" \
      --exclude=".git" \
      --exclude=".pnpm-store" \
      --exclude="dist" \
      --exclude="*/dist" \
      --exclude="coverage" \
      -C /src \
      -cf - . \
      | tar -C "$APP_DIR" -xf -

    rm -rf "$APP_DIR/.git"
    ln -s /src/.git "$APP_DIR/.git"

    cd "$APP_DIR"

    export PNPM_HOME=/pnpm
    export PNPM_STORE_DIR=/pnpm/store
    export PATH="$PNPM_HOME:$PATH"

    corepack enable pnpm

    pnpm install \
      --frozen-lockfile \
      --prefer-offline \
      --ignore-scripts \
      --filter .

    pnpm lint-staged
  '
