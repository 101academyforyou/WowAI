#!/usr/bin/env bash
# YourWowAI 一鍵安裝：在 Oracle Cloud（或任何 Ubuntu 22.04 / 24.04 主機）上執行
#
#   curl -fsSL https://raw.githubusercontent.com/101academyforyou/WowAI/main/deploy/oracle/install.sh | sudo bash
#
# 可用環境變數（放在 sudo 後面，例如 sudo DOMAIN=… ADMIN_USERNAMES=… bash）：
#   DOMAIN           網址，預設 yourwowai.onepointzeroone.org
#   ADMIN_USERNAMES  管理員帳號（逗號分隔），之後也能改 /etc/yourwowai.env
#   BRANCH           要部署的分支，預設 main
#
# 會做的事：安裝 Node.js 22、Caddy（自動 HTTPS）、下載程式並編譯網頁版、
# 設定開機自動啟動、打開 80/443 防火牆、每天備份資料庫。重複執行也沒關係。
set -euo pipefail

DOMAIN="${DOMAIN:-yourwowai.onepointzeroone.org}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/101academyforyou/WowAI.git}"
APP_USER=yourwowai
APP_DIR=/opt/yourwowai
DATA_DIR=/var/lib/yourwowai
BACKUP_DIR=/var/backups/yourwowai
ENV_FILE=/etc/yourwowai.env
PORT=3000

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "請用 sudo 執行：curl -fsSL …/install.sh | sudo bash" >&2
  exit 1
fi
if ! grep -qi ubuntu /etc/os-release; then
  echo "這支腳本只支援 Ubuntu（建議 Ubuntu 24.04）。" >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive

log "安裝系統套件"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git sqlite3 debian-keyring debian-archive-keyring apt-transport-https

# 記憶體小於 2GB（例如 AMD 免費機型 1GB）時加 2GB swap，編譯網頁版才不會記憶體不足
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if (( mem_kb < 2000000 )) && ! swapon --show | grep -q /swapfile; then
  log "記憶體較小，建立 2GB swap"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "安裝 Node.js 22"
# 需要 Node.js 22.5 以上（內建 node:sqlite）
if ! command -v node >/dev/null || ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 5) ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

log "安裝 Caddy（自動申請與續約 HTTPS 憑證）"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

log "建立系統帳號與資料夾"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"

log "下載程式（$BRANCH）"
as_app() { sudo -u "$APP_USER" -H "$@"; }
if [[ -d $APP_DIR/.git ]]; then
  as_app git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  as_app git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  as_app git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

log "安裝套件並編譯網頁版（第一次約 5–10 分鐘）"
as_app bash -c "cd '$APP_DIR' && npm install --no-audit --no-fund && npm --prefix mobile install --no-audit --no-fund && npm run build:web"

log "寫入設定 $ENV_FILE"
if [[ ! -f $ENV_FILE ]]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
DATA_DIR=$DATA_DIR
ADMIN_USERNAMES=${ADMIN_USERNAMES:-}
EOF
elif [[ -n ${ADMIN_USERNAMES:-} ]]; then
  sed -i "s/^ADMIN_USERNAMES=.*/ADMIN_USERNAMES=$ADMIN_USERNAMES/" "$ENV_FILE"
fi
chmod 640 "$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE"

log "設定開機自動啟動（systemd）"
cat > /etc/systemd/system/yourwowai.service <<EOF
[Unit]
Description=YourWowAI
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable yourwowai >/dev/null
systemctl restart yourwowai

log "設定 Caddy：https://$DOMAIN → 本機 $PORT"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl enable caddy >/dev/null
systemctl reload caddy || systemctl restart caddy

log "打開防火牆 80 / 443（Oracle 的 Ubuntu 預設只開 22）"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then
  netfilter-persistent save >/dev/null
fi
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 80/tcp && ufw allow 443/tcp
fi

log "設定每天凌晨 3 點備份資料庫（保留 14 天）"
cat > /etc/cron.d/yourwowai-backup <<EOF
0 3 * * * root sqlite3 $DATA_DIR/wowai.db ".backup '$BACKUP_DIR/wowai-\$(date +\\%F).db'" && find $BACKUP_DIR -name 'wowai-*.db' -mtime +14 -delete
EOF

log "確認伺服器狀態"
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    ok=1
    break
  fi
  sleep 1
done
if [[ ${ok:-} != 1 ]]; then
  echo "伺服器沒有正常啟動，請執行 journalctl -u yourwowai -n 50 查看原因。" >&2
  exit 1
fi

public_ip=$(curl -fsS -4 --max-time 5 https://ifconfig.me 2>/dev/null || echo '這台主機的公用 IP')
cat <<EOF

✅ YourWowAI 已經在這台主機上執行了！

還差最後一步：到 onepointzeroone.org 的 DNS 後台新增一筆記錄
  類型 A   名稱 yourwowai   值 $public_ip

DNS 生效後（幾分鐘到一小時），Caddy 會自動申請 HTTPS 憑證，打開
  https://$DOMAIN/api/health
看到 {"ok":true} 就完成了。

常用指令：
  更新到最新版   curl -fsSL https://raw.githubusercontent.com/101academyforyou/WowAI/main/deploy/oracle/install.sh | sudo bash
  查看紀錄       journalctl -u yourwowai -f
  重新啟動       sudo systemctl restart yourwowai
  修改管理員     sudo nano $ENV_FILE，然後 sudo systemctl restart yourwowai
EOF
