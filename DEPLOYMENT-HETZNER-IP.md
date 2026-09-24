# Hetzner first boot — no domain (IP only)

Chat/login/memory/Forge work on http://IP:8080.
Passkeys and iPhone Add to Home Screen wait until you have HTTPS + a hostname.

## Server

1. console.hetzner.cloud → project `mimir` → Add Server
2. Ubuntu 24.04, CX22, IPv4, your Chromebook SSH pubkey, name `mimir-1`
3. Copy IPv4. Call it IP.

```bash
ssh-keygen -t ed25519 -C mimir   # on Chromebook if you have no key
cat ~/.ssh/id_ed25519.pub
ssh root@IP
```

```bash
apt update && apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 8080 && ufw --force enable
```

## Private clone

```bash
ssh-keygen -t ed25519 -f /root/.ssh/mimir_github -N ""
cat /root/.ssh/mimir_github.pub
```

GitHub → Mimir-MVP1 → Settings → Deploy keys → Add (read-only).

```bash
GIT_SSH_COMMAND='ssh -i /root/.ssh/mimir_github -o IdentitiesOnly=yes' \
  git clone git@github.com:BabyBlaxk/Mimir-MVP1.git /opt/mimir
cd /opt/mimir && cp .env.example .env && nano .env
```

```
PORT=8080
NODE_ENV=production
SESSION_SECRET=<openssl rand -hex 32>
DATA_DIR=/data
APP_ORIGIN=http://IP:8080
RP_ID=IP
RP_NAME=Mimir
AI_PROVIDER=none
```

```bash
docker compose up -d --build
```

Open http://IP:8080 and create the Founder. Do not register a passkey on HTTP-IP.

Full click-path with domain: DEPLOYMENT-HETZNER.md
