# Deploying AuraFlow to a 1 GB VPS

This guide assumes a **Debian/Ubuntu** VPS with ~1 GB RAM. It installs the app
as a systemd service, keeps MongoDB off-box (Atlas), and adds a swap file as an
OOM safety net. Total steady-state RAM target: well under 512 MB.

The whole stack is **one Bun process** that serves both the API and the static
frontend (built once, served from the same port). No Vite dev server needed.

---

## 0. Prerequisites on your laptop

Before touching the VPS, decide:
- **MongoDB Atlas URI** — sign up at mongodb.com, create a free M0 cluster,
  add a database user, whitelist `0.0.0.0/0` (or your VPS IP), and copy the
  connection string. Free tier = 512 MB, more than enough.
- **A PIN** for the app — pick a long random string now; you'll paste it into
  `server/.env`.
- (Optional) Google client ID/secret + OpenRouter key if you want Calendar sync
  and the writing assistant.

---

## 1. Get the code onto the VPS

```bash
ssh root@YOUR_VPS_IP
apt update && apt upgrade -y
apt install -y git curl ca-certificates

# Put the app under /opt (owned by a dedicated non-root user)
useradd -m -s /bin/bash auraflow
mkdir -p /opt/auraflow
chown auraflow:auraflow /opt/auraflow

# As the auraflow user, clone (or upload) the repo
sudo -u auraflow -i
cd /opt/auraflow
git clone https://github.com/YOUR/auraflow.git .   # or: scp/rsync your copy in
```

## 2. Install Bun

Still as the `auraflow` user:

```bash
curl -fsSL https://bun.sh/install | bash
# Bun lands at ~/.bun/bin/bun — add it to PATH:
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
bun --version
```

## 3. Install dependencies & build the frontend

```bash
cd /opt/auraflow
bun install              # installs client + server + shared workspace deps
bun run build            # vite build → client/dist (static bundle)
```

`client/dist/` is what Bun serves in production. Re-run `bun run build` after
any frontend change.

## 4. Configure `server/.env`

```bash
cp server/.env.example server/.env
nano server/.env
```

Fill in at least `MONGODB_URI` (your Atlas string) and `PIN`. Set
`CLIENT_URL` and `SERVER_PUBLIC_URL` to the public URL you'll access the app
from (e.g. `http://YOUR_VPS_IP:3001`, or your domain behind Nginx).

```bash
chmod 600 server/.env          # only the auraflow user can read it
```

## 5. Add a 2 GB swap file (OOM safety net)

On 1 GB RAM this is strongly recommended — it gives the kernel somewhere to
spill during traffic spikes instead of killing Bun.

```bash
# Back as root:
exit   # leave the auraflow shell
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
# Make it persist across reboots:
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Verify:
free -h
```

## 6. Install the systemd service

```bash
cp /opt/auraflow/deploy/auraflow.service /etc/systemd/system/auraflow.service
systemctl daemon-reload
systemctl enable auraflow
systemctl start auraflow
systemctl status auraflow      # should show "active (running)"
```

Logs:
```bash
journalctl -u auraflow -f      # live tail
journalctl -u auraflow --since "10 min ago"
```

It auto-restarts on crash (`Restart=always`) and on boot (`enable`d).
The unit caps memory at 640 MB so it can never eat the whole box.

## 7. Verify it works

From the VPS:
```bash
curl -s http://localhost:3001/ | head -5           # should return <!doctype html>...
curl -s http://localhost:3001/api/metrics | head    # should return JSON
```

From your laptop, open `http://YOUR_VPS_IP:3001` — the app should load and the
PIN screen should accept your PIN.

---

## 8. (Optional) Nginx reverse proxy + HTTPS + firewall

Recommended if you want a clean public URL, TLS, and to avoid exposing port
3001 directly. Skip if you're fine hitting `:3001` raw.

```bash
apt install -y nginx ufw

# Firewall: allow SSH + HTTP/HTTPS only
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Proxy config
cat > /etc/nginx/sites-available/auraflow <<'EOF'
server {
    listen 80;
    server_name aura.example.com;          # your domain or VPS IP

    client_max_body_size 2M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (the /ws endpoint)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }
}
EOF
ln -s /etc/nginx/sites-available/auraflow /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Then TLS with Certbot:
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d aura.example.com
```

If you do this, **bind Bun to localhost only** so port 3001 isn't public:
set `PORT=127.0.0.1:3001` in `server/.env` (Bun accepts a host:port string)
and `systemctl restart auraflow`.

---

## Updating the app

```bash
sudo -u auraflow -i
cd /opt/auraflow
git pull
bun install                # only if deps changed
bun run build              # only if the frontend changed
exit
sudo systemctl restart auraflow
```

---

## Troubleshooting

| Symptom | Check |
| :--- | :--- |
| `systemctl status` shows failed/crashing | `journalctl -u auraflow -n 100` — usually a bad `MONGODB_URI` or `PIN` |
| App loads but API errors | `server/.env` is missing or `MONGODB_URI` is wrong; check logs |
| OOM-killer fires | confirm swap is on (`free -h`); lower `MemoryMax` in the unit |
| Can't reach `:3001` from outside | VPS firewall / cloud security group blocking the port |
| WebSocket won't connect behind Nginx | missing the `Upgrade`/`Connection` headers in the proxy block |
| Google Calendar "redirect_uri_mismatch" | `SERVER_PUBLIC_URL` + the OAuth console's redirect URI must match exactly |
