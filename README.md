# 🔓 Unlockify — Panel de reseller de servicios de unlock

Plataforma completa para **revender servicios de desbloqueo** (FMI OFF, liberación de red,
bypass MDM, etc.) con **saldo prepago en USDT**, **gestión de clientes**, **multi-proveedor
con failover automático** y **tu markup de ganancia**. Tus clientes nunca ven tus proveedores.

---

## ✨ Qué hace

**Para tus clientes:**
- Se registran, **recargan saldo con USDT** (TRC20 / ERC20) y el saldo se acredita solo.
- Compran servicios que se **descuentan del saldo al instante** (pedido inmediato).
- Ven su saldo, su historial de pedidos y recargas, y el tiempo que tardó cada pedido.
- Si un pedido no se puede completar, se les **reembolsa el saldo** automáticamente.

**Para ti (panel de admin):**
- **Usuarios:** crear cuentas, **activar/desactivar (banear)**, restablecer contraseña, **ajustar saldo**.
- **Servicios:** eliges **qué se muestra** y **de qué proveedor sale cada uno**; markup global o por servicio.
- **Multi-proveedor:** para servicios en **automático**, el sistema usa el proveedor **más barato** y si
  rechaza, **pasa al otro solo** (failover). Eliges **qué servicios** van en automático y cuáles manuales.
- **Tracking interno:** por cada pedido ves qué proveedor lo resolvió, éxito/rechazo, el failover
  y **cuánto tardó cada proveedor y el cliente** — nada de esto lo ve el cliente.
- **Recargas:** historial de todas las recargas con su TX.

**Cobro:** el USDT llega **directo a tu wallet** (custodia propia). Un vigilante confirma los pagos
en el blockchain. **Telegram** te avisa a ti; el cliente recibe **correos** (recarga, pedido, listo).

---

## ⚙️ Requisitos
- Droplet Linux (recomendado: **DigitalOcean básico $6/mes, Ubuntu 24.04**), dedicado solo a esto.
- Node.js 18+. Un dominio/subdominio. Tus wallets USDT. Un bot de Telegram. API key de Etherscan (para ERC20).

---

## 🚀 Instalación (droplet nuevo)

```bash
ssh root@IP_DEL_DROPLET
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx
npm install -g pm2

cd /var/www
# sube el .zip aquí y descomprímelo, o clona tu repo
cd unlock-reseller
npm install --omit=dev
cp .env.example .env
nano .env            # edita TODO (ver abajo)

pm2 start ecosystem.config.js && pm2 save && pm2 startup

# Nginx + SSL
cp nginx.conf.example /etc/nginx/sites-available/unlockify
nano /etc/nginx/sites-available/unlockify     # tu dominio
ln -s /etc/nginx/sites-available/unlockify /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d tudominio.com
```
Entra al panel en **`https://tudominio.com/admin`** con el `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`.

---

## 🔑 Variables del `.env` (lo esencial)

| Variable | Qué es |
|---|---|
| `BRAND_NAME`, `PUBLIC_URL`, `SESSION_SECRET` | marca, dominio (con https), clave secreta larga |
| `MARKUP_TYPE` / `MARKUP_VALUE` | tu ganancia (`percent` 35 = +35%) |
| `USDT_TRC20_ADDRESS` / `USDT_ERC20_ADDRESS` | **tus wallets** (de Trust Wallet) |
| `MIN_TOPUP` | recarga mínima (USDT) |
| `ETHERSCAN_API_KEY` | **obligatoria para ERC20** (gratis en etherscan.io) |
| `TRONGRID_API_KEY` | opcional (gratis, sube el límite) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | avisos a ti (bot de @BotFather, id de @userinfobot) |
| `SMTP_*` | **para los correos a tus clientes** (sin esto no reciben email) |
| `PROVIDER_1_*`, `PROVIDER_2_*` | tus proveedores (ver abajo) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | tu acceso de admin |

> Tras editar `.env`: `pm2 restart unlock-reseller`

---

## 🤝 Proveedores (uno o varios)

Cada proveedor es un bloque `PROVIDER_N_*`. El proveedor **imeilock** ya viene pre-rellenado;
solo pega tu **API key** y pon `ENABLED=true`:
```
PROVIDER_1_KEY=imeilock
PROVIDER_1_NAME=IMEILock
PROVIDER_1_TYPE=dhru
PROVIDER_1_API_URL=https://www.imeilock.us/api/index.php
PROVIDER_1_USERNAME=matticell
PROVIDER_1_API_KEY=TU_API_KEY_AQUI
PROVIDER_1_ENABLED=true
```
Para un **segundo proveedor**, llena `PROVIDER_2_*` igual. Luego en el panel → **Servicios** →
botón **“Sincronizar <proveedor>”**: importa su catálogo (apagado por defecto) y, si un servicio
ya existe, le **añade ese proveedor como fuente** (así comparas precios y haces failover).

> La API Dhru Fusion tiene variantes. Si la sincronización no trae bien los servicios, mándame
> el `api.zip` real del proveedor y ajusto `src/providers/dhru.js` (un solo archivo).

---

## 🛠 Uso del panel

- **Resumen:** pedidos, ventas, recargas pendientes, estado de proveedores.
- **Servicios:** prende/apaga lo que vendes; pon **⚡ Automático** a los que quieras que se envíen
  solos con failover; fija un proveedor o deja **“más barato”**; edita costos y markup por servicio.
- **Órdenes:** ves el estado, los intentos por proveedor con sus tiempos; puedes **completar** a mano,
  **enviar al proveedor** (auto) o **rechazar + reembolsar**.
- **Usuarios:** crear, activar/desactivar, restablecer contraseña (se genera una y te la muestro para
  enviársela), y **ajustar saldo** (+ o −).
- **Recargas:** todas las recargas con su TX.

### 🔐 Sobre las contraseñas
Se guardan **cifradas (no se pueden ver)** — es lo seguro. Para un cliente que la olvida, usas
**Restablecer**: se genera/pones una nueva y se la envías. Para usuarios que **tú creas**, tú defines
la contraseña y la conoces desde el inicio.

---

## 💡 Cómo fluye un pedido automático
1. El cliente paga con su **saldo** (se descuenta al instante).
2. El sistema lo envía al proveedor **más barato** disponible.
3. Si ese **rechaza**, lo pasa **solo** al siguiente proveedor (failover).
4. Si lo **resuelve**, entrega el resultado al cliente por web y correo.
5. Si **ningún** proveedor lo resuelve, se **reembolsa el saldo** y se avisa al cliente.
Tú ves todo el recorrido (proveedores, éxito/rechazo, tiempos) en la orden; el cliente solo ve
“procesando → listo / reembolsado”.

---

## 🔒 Antes de lanzar
- Cambia `ADMIN_PASSWORD` y `SESSION_SECRET`.
- Verifica dos veces tus wallets (un carácter mal = fondos perdidos).
- Respalda la carpeta `data/` (ahí viven la base de datos, pedidos, saldos y recargas).
- Haz una **recarga de prueba pequeña** para confirmar que el saldo se acredita solo.

Hecho para Matt · Unlockify.
