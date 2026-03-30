#!/bin/bash
set -euo pipefail

# ── EdaPost Server Deployment Script ──────────────────────────────────────────
# Run on: edapost@46.225.10.27
# Prerequisites: Node.js 20, PM2, Nginx, Redis, Postfix
# Usage: bash deploy.sh

APP_DIR="/opt/edapost/server"
LOG_DIR="/var/log/edapost"
REPO="https://github.com/vitalhost-za/edapost-dash-ui.git"

echo "═══ EdaPost Server Deployment ═══"

# 1. Create directories
echo "→ Creating directories..."
sudo mkdir -p "$APP_DIR" "$LOG_DIR"
sudo chown -R edapost:edapost "$APP_DIR" "$LOG_DIR"

# 2. Clone or pull repo
if [ -d "$APP_DIR/.git" ]; then
    echo "→ Pulling latest changes..."
    cd "$APP_DIR" && git pull origin main
else
    echo "→ Cloning repository..."
    git clone "$REPO" /tmp/edapost-repo
    cp -r /tmp/edapost-repo/server/* "$APP_DIR/"
    rm -rf /tmp/edapost-repo
fi

cd "$APP_DIR"

# 3. Install dependencies
echo "→ Installing dependencies..."
npm install --production

# 4. Environment file
if [ ! -f "$APP_DIR/.env" ]; then
    echo "→ Creating .env from template..."
    cp .env.example .env
    echo ""
    echo "  ⚠  IMPORTANT: Edit $APP_DIR/.env with your actual credentials:"
    echo "     - DATABASE_URL (Supabase PostgreSQL connection string)"
    echo "     - SUPABASE_JWT_SECRET"
    echo ""
    echo "  Then re-run this script or: pm2 start ecosystem.config.js"
    exit 0
fi

# 5. Configure Nginx
echo "→ Configuring Nginx..."
sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/edapost-api
sudo ln -sf /etc/nginx/sites-available/edapost-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. Start services with PM2
echo "→ Starting services..."
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 7. Set up PM2 startup on boot
echo "→ Configuring startup..."
pm2 startup systemd -u edapost --hp /home/edapost 2>/dev/null || true

# 8. Verify
echo ""
echo "═══ Deployment Complete ═══"
echo ""
echo "Services:"
pm2 list
echo ""
echo "Test API:"
echo "  curl -s http://localhost:3001/health | python3 -m json.tool"
echo ""
echo "Logs:"
echo "  pm2 logs edapost-api"
echo "  pm2 logs edapost-worker"
