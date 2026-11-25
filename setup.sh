#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  Unlockify - instalacion en el servidor (Ubuntu 22.04/24.04)
#  Uso:  bash setup.sh
#  Es idempotente: se puede volver a correr sin romper nada.
# ============================================================

DOMAIN="unlockify.uk"
EMAIL="admin@unlockify.uk"      # aviso de vencimiento del certificado
APP_DIR="/opt/unlockify"
REPO="https://github.com/ImeiLocked/unlockify"
PORT="3000"
NODE_MAJOR="20"

export DEBIAN_FRONTEND=noninteractive
log(){ echo -e "\n\033[1;36m==>\033[0m $*"; }

# --- 1. Swap (ayuda en droplets de 1GB RAM durante npm install) ----------
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  log "Creando swap de 2GB..."
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "Swap ya existe, ok."
fi

# --- 2. Paquetes base (build-essential + python3 para better-sqlite3) -----
log "Instalando paquetes base..."
apt-get update -y
apt-get install -y curl git ufw nginx ca-certificates gnupg openssl build-essential python3

# --- 3. Node.js 20 (NodeSource) -----------------------------------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  log "Instalando Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  log "Node ya instalado: $(node -v)"
fi

# --- 4. PM2 --------------------------------------------------------------
command -v pm2 >/dev/null 2>&1 || { log "Instalando PM2..."; npm install -g pm2; }

# --- 5. Clonar / actualizar el repo -------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  log "Actualizando repo existente..."; git -C "$APP_DIR" pull --ff-only || true
else
  log "Clonando repo..."; git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# --- 6. Dependencias -----------------------------------------------------
log "Instalando dependencias de Node..."
npm install --omit=dev --no-audit --no-fund

# --- 7. .env -------------------------------------------------------------
mkdir -p "$APP_DIR/data"
if [ ! -f "$APP_DIR/.env" ]; then
  log "Creando .env desde la plantilla (genera SESSION_SECRET y clave de admin)..."
  cp .env.example .env
  SS="$(openssl rand -hex 32)"
  AP="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SS}|" .env
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${AP}|" .env
  AE="$(grep -E '^ADMIN_EMAIL=' .env | cut -d= -f2)"
  printf 'Panel admin de Unlockify\nURL:   https://%s/admin\nEmail: %s\nClave: %s\n' "$DOMAIN" "$AE" "$AP" > /root/unlockify-admin.txt
  chmod 600 /root/unlockify-admin.txt
  log "Clave del admin guardada en /root/unlockify-admin.txt"
else
  log ".env ya existe, no lo toco."
fi

# --- 8. PM2 arranque -----------------------------------------------------
log "Arrancando la app con PM2..."
pm2 start ecosystem.config.js --update-env || pm2 restart ecosystem.config.js --update-env
pm2 save
(pm2 startup systemd -u root --hp /root >/dev/null 2>&1) || true

# --- 9. Nginx reverse proxy ---------------------------------------------
log "Configurando Nginx..."
cat > /etc/nginx/sites-available/unlockify <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    client_max_body_size 5m;
}
NGINX
ln -sf /etc/nginx/sites-available/unlockify /etc/nginx/sites-enabled/unlockify
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- 10. Firewall --------------------------------------------------------
log "Configurando firewall..."
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# --- 11. SSL (Let's Encrypt) --------------------------------------------
log "Intentando certificado SSL con certbot..."
apt-get install -y certbot python3-certbot-nginx
if certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect; then
  log "SSL OK -> https://${DOMAIN}"
else
  log "SSL aun no (revisa que el DNS de ${DOMAIN} apunte a este servidor y que el proxy de Cloudflare este en gris/DNS-only). La pagina sigue por HTTP."
fi

echo
log "LISTO. Pagina: https://${DOMAIN}   |   Panel: https://${DOMAIN}/admin"
echo "    Clave del admin ->  cat /root/unlockify-admin.txt"
pm2 status
