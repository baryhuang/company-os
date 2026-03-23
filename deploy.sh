#!/bin/bash
# Deploy Company OS agent on Ubuntu
# Prerequisites: SSH access, AWS credentials configured
#
# Usage:
#   chmod +x deploy.sh && ./deploy.sh

set -euo pipefail

echo "=== Company OS Agent — Ubuntu Deployment ==="
echo ""

# 1. System dependencies
echo "[1/7] Installing system dependencies..."
sudo apt update && sudo apt install -y curl unzip

# 2. AWS CLI
if ! command -v aws &> /dev/null; then
    echo "[2/7] Installing AWS CLI..."
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    unzip -qo /tmp/awscliv2.zip -d /tmp
    sudo /tmp/aws/install
    rm -rf /tmp/aws /tmp/awscliv2.zip
else
    echo "[2/7] AWS CLI already installed: $(aws --version)"
fi

# 3. Bun
if ! command -v bun &> /dev/null; then
    echo "[3/7] Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
else
    echo "[3/7] Bun already installed: $(bun --version)"
fi

# 4. Claude Code
if ! command -v claude &> /dev/null; then
    echo "[4/7] Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code || bun install -g @anthropic-ai/claude-code
else
    echo "[4/7] Claude Code already installed: $(claude --version 2>/dev/null || echo 'installed')"
fi

# 5. Create local directory structure
echo "[5/7] Creating local directory structure..."
mkdir -p ~/company-os/peakmojo/{brain,by-dates,context/skills,users}

# 6. Initial S3 pull
echo "[6/7] Pulling data from S3..."
if aws s3 ls s3://peakmojo-company-os/peakmojo/ &> /dev/null; then
    # Pull brain
    aws s3 sync s3://peakmojo-company-os/peakmojo/brain/ ~/company-os/peakmojo/brain/ --quiet
    # Pull context + skills
    aws s3 sync s3://peakmojo-company-os/peakmojo/context/ ~/company-os/peakmojo/context/ --quiet
    # Pull transcripts
    aws s3 sync s3://peakmojo-company-os/peakmojo/by-dates/ ~/company-os/peakmojo/by-dates/ --quiet
    echo "  Pulled brain, context, and transcripts from S3"
else
    echo "  WARNING: Could not access S3 bucket. Configure AWS credentials first:"
    echo "    aws configure"
fi

# 7. Install cron jobs
echo "[7/7] Installing cron jobs (every 5 minutes)..."
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="${REPO_DIR}/scripts/sync-all.sh"
chmod +x "${REPO_DIR}"/scripts/sync-*.sh

# Add cron entry if not already present
CRON_ENTRY="*/5 * * * * ${SYNC_SCRIPT} >> /var/log/company-os-sync.log 2>&1"
(crontab -l 2>/dev/null | grep -v "sync-all.sh"; echo "${CRON_ENTRY}") | crontab -

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo ""
echo "  1. Configure AWS credentials (if not done):"
echo "     aws configure"
echo ""
echo "  2. Authenticate Claude Code:"
echo "     claude auth login"
echo ""
echo "  3. Install Telegram channel plugin:"
echo "     claude"
echo "     /plugin marketplace add anthropics/claude-plugins-official"
echo "     /plugin install telegram@claude-plugins-official"
echo "     /reload-plugins"
echo "     /telegram:configure <YOUR_BOT_TOKEN>"
echo "     # Exit and restart with channels:"
echo ""
echo "  4. Start Claude Code with Telegram channel:"
echo "     cd ~/company-os/peakmojo"
echo "     claude --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions"
echo ""
echo "  5. Pair your Telegram account:"
echo "     Send any message to your bot in Telegram"
echo "     In Claude Code, run: /telegram:access pair <code>"
echo "     Then lock it down: /telegram:access policy allowlist"
echo ""
echo "  Cron sync runs every 5 minutes."
echo "  Logs: /var/log/company-os-sync.log"
