# Deployment guide

The app is a single Node.js process that talks to a remote MySQL-compatible
database (TiDB Cloud or local MySQL). Any host that runs Node 20+ with five
environment variables works. This file lists the three easiest options.

## Required environment variables

```
DB_TARGET=tidb
TIDB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=<your TiDB user, ends in .root>
TIDB_PASSWORD=<your TiDB password>
TIDB_DATABASE=databaseProject_db
JWT_SECRET=<a long random string>
JWT_EXPIRES_IN=8h
```

Optional, only if your host's CA bundle isn't in `/etc/ssl/certs/`:
`TIDB_SSL_CA=/path/to/isrgrootx1.pem`

## Option A: Render (easiest, free)

1. Sign in at https://render.com with GitHub.
2. **New** -> **Web Service** -> connect this repository.
3. Render auto-detects [`render.yaml`](render.yaml) and pre-fills everything.
4. Fill in the three TiDB secrets in **Environment** when prompted.
5. **Create Web Service**. First boot takes ~3 minutes.
6. Visit `https://rideflow.onrender.com` (or whatever Render assigns you).

The free tier sleeps after 15 minutes of inactivity; first request after
sleep takes ~30s to wake up.

## Option B: Fly.io

```bash
# 1) install flyctl: https://fly.io/docs/hands-on/install-flyctl/
# 2) sign in
flyctl auth login
# 3) launch (uses the committed fly.toml; will ask before changing it)
flyctl launch --copy-config --no-deploy
# 4) push the secrets
flyctl secrets set TIDB_HOST=... TIDB_USER=... TIDB_PASSWORD=... \
                   JWT_SECRET="$(openssl rand -hex 32)"
# 5) deploy
flyctl deploy
```

Free allowance (3 shared-CPU 256MB VMs) is plenty.

## Option C: any Docker host

```bash
docker build -t rideflow .
docker run -p 3000:3000 \
  -e DB_TARGET=tidb \
  -e TIDB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com \
  -e TIDB_PORT=4000 \
  -e TIDB_USER=... \
  -e TIDB_PASSWORD=... \
  -e TIDB_DATABASE=databaseProject_db \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  rideflow
```

## First-run database setup

The TiDB cluster needs the schema once. From any machine with `mysql` CLI:

```bash
DB_TARGET=tidb \
TIDB_HOST=... TIDB_PORT=4000 TIDB_USER=... \
TIDB_PASSWORD=... TIDB_DATABASE=databaseProject_db \
TIDB_SSL_CA=/etc/ssl/certs/ca-certificates.crt \
npm run db:setup
```

This runs `01_d2_base.sql` (drops + recreates the database, applies all D2
tables), `02_d3_additions.sql` (adds wallet/flag/usage_count columns and the
admin_notifications table), `03_d3_views_indexes.sql` (the two D3 views and
four indexes), and `99_seed.sql` (demo accounts). Files 04..07 (procedure,
triggers, event, DCL) are MySQL-only and are auto-skipped on TiDB - the
backend reproduces their behavior inline when `DB_TARGET=tidb`.

## Demo accounts (after seeding)

| Email             | Role   | Password   |
|-------------------|--------|------------|
| admin@demo.com    | ADMIN  | password   |
| rider@demo.com    | RIDER  | password   |
| driver@demo.com   | DRIVER | password   |
