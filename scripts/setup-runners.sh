#!/bin/bash
set -e

# ============================================
# CONFIGURATION - Edit these values or pass as env vars
# ============================================
GITHUB_TOKEN="${GITHUB_TOKEN:-YOUR_RUNNER_TOKEN_HERE}"
GITHUB_URL="${GITHUB_URL:-https://github.com/drizzle-team/drizzle-orm}"
RUNNER_COUNT="${RUNNER_COUNT:-10}"
RUNNER_PREFIX="${RUNNER_PREFIX:-beelink}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64}"

BASE_DIR="${BASE_DIR:-/opt/actions-runner}"
SHARED_CACHE_DIR="$BASE_DIR/cache"
RUNNER_TARBALL="$BASE_DIR/runner.tar.gz"

# ============================================
# Validation
# ============================================
if [[ "$GITHUB_TOKEN" == "YOUR_RUNNER_TOKEN_HERE" ]]; then
    echo "ERROR: Please set GITHUB_TOKEN environment variable or edit this script"
    echo "Usage: GITHUB_TOKEN=xxx ./setup-runners.sh"
    exit 1
fi

if [[ ! -f "$RUNNER_TARBALL" ]]; then
    echo "ERROR: Runner tarball not found at $RUNNER_TARBALL"
    echo "Download it from: https://github.com/actions/runner/releases"
    exit 1
fi

# ============================================
# Install global dependencies
# ============================================
echo "Checking global dependencies..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 20+ first."
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

# Install pnpm globally if not present
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm globally..."
    npm install -g pnpm
fi

# Install bun globally if not present
if ! command -v bun &> /dev/null; then
    echo "Installing bun globally..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "bun: $(bun --version)"

# ============================================
# Create shared directories
# ============================================
sudo mkdir -p "$BASE_DIR"
sudo chown "$(whoami):$(id -gn)" "$BASE_DIR"

mkdir -p "$SHARED_CACHE_DIR/pnpm-store"
mkdir -p "$SHARED_CACHE_DIR/npm"
mkdir -p "$SHARED_CACHE_DIR/bun"
mkdir -p "$SHARED_CACHE_DIR/node"
mkdir -p "$SHARED_CACHE_DIR/turbo"
mkdir -p "$SHARED_CACHE_DIR/artifacts"

ENV_FILE="$BASE_DIR/runner.env"

# Auto-detect paths for node, pnpm, bun
# Check for Volta first (manages node, npm, pnpm, yarn from one bin)
VOLTA_BIN="${HOME}/.volta/bin"
NODE_BIN="$(dirname "$(which node 2>/dev/null)" || echo '')"
PNPM_BIN="$(dirname "$(which pnpm 2>/dev/null)" || echo '')"
BUN_BIN="${HOME}/.bun/bin"

# Build PATH with all necessary directories
RUNNER_PATH=""
[ -d "$VOLTA_BIN" ] && RUNNER_PATH="$VOLTA_BIN"
[ -n "$NODE_BIN" ] && [[ ":$RUNNER_PATH:" != *":$NODE_BIN:"* ]] && RUNNER_PATH="$RUNNER_PATH:$NODE_BIN"
[ -n "$PNPM_BIN" ] && [[ ":$RUNNER_PATH:" != *":$PNPM_BIN:"* ]] && RUNNER_PATH="$RUNNER_PATH:$PNPM_BIN"
[ -d "$BUN_BIN" ] && [[ ":$RUNNER_PATH:" != *":$BUN_BIN:"* ]] && RUNNER_PATH="$RUNNER_PATH:$BUN_BIN"
RUNNER_PATH="$RUNNER_PATH:/usr/local/bin:/usr/bin:/bin"
# Remove leading colon if present
RUNNER_PATH="${RUNNER_PATH#:}"

echo "Detected paths:"
echo "  VOLTA_BIN: $VOLTA_BIN"
echo "  NODE_BIN: $NODE_BIN"
echo "  PNPM_BIN: $PNPM_BIN"
echo "  BUN_BIN: $BUN_BIN"
echo "  RUNNER_PATH: $RUNNER_PATH"

cat > "$ENV_FILE" << EOF
# PATH - include node, pnpm, bun paths
PATH=$RUNNER_PATH

# pnpm
PNPM_HOME=$SHARED_CACHE_DIR/pnpm
PNPM_STORE_DIR=$SHARED_CACHE_DIR/pnpm-store

# npm
npm_config_cache=$SHARED_CACHE_DIR/npm

# Bun
BUN_INSTALL=$HOME/.bun
BUN_INSTALL_CACHE_DIR=$SHARED_CACHE_DIR/bun

# Node.js
NODE_COMPILE_CACHE=$SHARED_CACHE_DIR/node

# Turbo
TURBO_CACHE_DIR=$SHARED_CACHE_DIR/turbo

# Local artifacts (for CI)
LOCAL_ARTIFACTS_DIR=$SHARED_CACHE_DIR/artifacts
EOF

echo "Created environment file at $ENV_FILE"

for i in $(seq 1 $RUNNER_COUNT); do
    RUNNER_NAME="${RUNNER_PREFIX}-${i}"
    RUNNER_DIR="$BASE_DIR/$RUNNER_NAME"
    WORK_DIR="$BASE_DIR/work-$i"
    
    # Create work directory
    mkdir -p "$WORK_DIR"
    
    if [ -d "$RUNNER_DIR" ] && [ -f "$RUNNER_DIR/.runner" ]; then
        echo "Runner $RUNNER_NAME already configured, skipping setup..."
    else
        echo "Setting up runner $RUNNER_NAME..."
        mkdir -p "$RUNNER_DIR"
        
        # Extract runner
        tar -xzf "$RUNNER_TARBALL" -C "$RUNNER_DIR"
        
        # Configure runner - each runner gets its own work directory to avoid git lock conflicts
        cd "$RUNNER_DIR"
        ./config.sh \
            --url "$GITHUB_URL" \
            --token "$GITHUB_TOKEN" \
            --name "$RUNNER_NAME" \
            --labels "$RUNNER_LABELS" \
            --work "$WORK_DIR" \
            --unattended \
            --replace
    fi
done

echo "All runners configured!"

echo "Creating systemd service files..."

for i in $(seq 1 $RUNNER_COUNT); do
    RUNNER_NAME="${RUNNER_PREFIX}-${i}"
    RUNNER_DIR="$BASE_DIR/$RUNNER_NAME"
    SERVICE_FILE="/etc/systemd/system/github-runner-${RUNNER_NAME}.service"
    
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=GitHub Actions Runner ($RUNNER_NAME)
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$RUNNER_DIR
EnvironmentFile=$BASE_DIR/runner.env
ExecStart=$RUNNER_DIR/run.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    echo "Created service: github-runner-${RUNNER_NAME}"
done

echo "Reloading systemd and starting runners..."
sudo systemctl daemon-reload

for i in $(seq 1 $RUNNER_COUNT); do
    RUNNER_NAME="${RUNNER_PREFIX}-${i}"
    sudo systemctl enable "github-runner-${RUNNER_NAME}"
    sudo systemctl start "github-runner-${RUNNER_NAME}"
    echo "Started github-runner-${RUNNER_NAME}"
done

echo ""
echo "============================================"
echo "Setup complete! Runner status:"
echo "============================================"
for i in $(seq 1 $RUNNER_COUNT); do
    RUNNER_NAME="${RUNNER_PREFIX}-${i}"
    STATUS=$(sudo systemctl is-active "github-runner-${RUNNER_NAME}" 2>/dev/null || echo "unknown")
    echo "  $RUNNER_NAME: $STATUS"
done

echo ""
echo "Shared directories:"
echo "  Work:      $BASE_DIR/work-{1..$RUNNER_COUNT} (one per runner)"
echo "  Cache:     $SHARED_CACHE_DIR"
echo "  Artifacts: $SHARED_CACHE_DIR/artifacts"
echo ""
echo "Environment file: $ENV_FILE"
echo ""
echo "Useful commands:"
echo "  View logs:    journalctl -u github-runner-${RUNNER_PREFIX}-1 -f"
echo "  Stop all:     for i in \$(seq 1 $RUNNER_COUNT); do sudo systemctl stop github-runner-${RUNNER_PREFIX}-\$i; done"
echo "  Start all:    for i in \$(seq 1 $RUNNER_COUNT); do sudo systemctl start github-runner-${RUNNER_PREFIX}-\$i; done"
echo "  Restart all:  for i in \$(seq 1 $RUNNER_COUNT); do sudo systemctl restart github-runner-${RUNNER_PREFIX}-\$i; done"
echo "  Status all:   for i in \$(seq 1 $RUNNER_COUNT); do sudo systemctl status github-runner-${RUNNER_PREFIX}-\$i --no-pager; done"
