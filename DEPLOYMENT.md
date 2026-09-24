# Deploy Mimir on a ~$10/month VPS

Works from a Chromebook with Linux (Crostini) or any SSH client.

## 1. Buy a small Linux VPS

Examples that usually land near or under $10/month:

- Hetzner Cloud CX22
- Contabo VPS S
- RackNerd or similar KVM VPS
- Any Ubuntu 24.04 box with 1 vCPU and 1–2 GB RAM

Point a domain (or subdomain) A record at the server IP.

## 2. Server setup

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 3. Clone and configure

```bash
git clone https://github.com/BabyBlaxk/Mimir-MVP1.git
cd Mimir-MVP1
cp .env.example .env
nano .env
```

Required:

```
SESSION_SECRET=<long random string>
AI_PROVIDER=none
```

## 4. Start

```bash
docker compose up -d --build
```

Mimir listens on port 8080. Put Caddy in front:

```
your.domain.com {
  reverse_proxy localhost:8080
}
```

SQLite lives in the `mimir-data` volume. Rebuilds do not wipe it.

```bash
git pull && docker compose up -d --build
docker compose restart
```
