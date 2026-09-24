# Hetzner CX22 click-path

1. console.hetzner.cloud → project `mimir` → Add Server
2. Ubuntu 24.04, CX22, IPv4, your SSH key, name `mimir-1`
3. DNS A record `mimir` → server IP
4. ssh root@IP then:

```bash
apt update && apt install -y ca-certificates curl git ufw caddy
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
git clone https://github.com/BabyBlaxk/Mimir-MVP1.git /opt/mimir
cd /opt/mimir && cp .env.example .env && nano .env
```

Set SESSION_SECRET, APP_ORIGIN=https://mimir.yourdomain.com, RP_ID=mimir.yourdomain.com

```bash
docker compose up -d --build
```

Caddyfile:

```
mimir.yourdomain.com {
  reverse_proxy localhost:8080
}
```

```bash
systemctl reload caddy
```

Open HTTPS, create Founder, iPhone Safari → Add to Home Screen. Passkeys only work on that origin.
