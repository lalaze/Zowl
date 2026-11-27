# Self-hosting with Docker

Zowl runs as one app container with SQLite and files on bind-mounted host directories. Keep it to a single
instance: SQLite in WAL mode does not support replicas.

## Requirements

- Docker with Compose.
- An HTTPS entry point: a reverse proxy (Traefik, Caddy, nginx, …) or Tailscale Serve. In production the app
  refuses to start unless `PUBLIC_BASE_URL` is an `https://` URL, and session cookies are always `Secure`.

## First deployment

Prepare the environment file and persistent directories:

```bash
cp .env.docker.example .env.docker
mkdir -p runtime/data runtime/storage runtime/releases/android secrets
openssl rand -hex 32 > secrets/initial-admin-setup-token
chmod 700 runtime/data runtime/storage secrets
chmod 750 runtime/releases/android
chmod 600 secrets/initial-admin-setup-token
sudo chown -R 1000:1000 runtime secrets
```

The container runs as the `node` user (uid 1000), so it must own the data, storage, and secrets directories.

Edit `.env.docker`:

| Key | Purpose |
| --- | --- |
| `PUBLIC_BASE_URL` | The HTTPS URL users open, e.g. `https://money.example.com` |
| `ZOWL_HOST` | Host name for the Traefik router rule |
| `ZOWL_PORT` | Host loopback port for the app (default `3000`) |
| `ZOWL_DATA_DIR` / `ZOWL_STORAGE_DIR` | SQLite directory and uploaded-file directory |
| `ANDROID_RELEASE_DIR` | Directory holding the published APK (mounted read-only) |
| `ZOWL_SECRETS_DIR` | Directory holding the one-time setup token (mounted read-only) |
| `ZOWL_TRAEFIK_NETWORK` / `ZOWL_TRAEFIK_ENTRYPOINT` | External Docker network and entry point used by Traefik (defaults `traefik-proxy` / `web`) |
| `AI_CATEGORIZATION_*`, `RECEIPT_RECOGNITION_*` | Optional providers; see the README |

`compose.yml` attaches the app to an external Docker network for Traefik. Create it if it does not exist yet,
even if you use a different proxy:

```bash
docker network create traefik-proxy
```

Build and start:

```bash
docker compose --env-file .env.docker up -d --build app
docker compose --env-file .env.docker ps
```

The entrypoint applies all migrations before Next.js starts. Production never runs `db:seed`.

## HTTPS

Pick one:

- **Traefik** on the same Docker network: the container already carries router labels for `ZOWL_HOST`.
  Terminate TLS in Traefik or upstream of it.
- **Any other reverse proxy:** proxy `PUBLIC_BASE_URL` to `http://127.0.0.1:${ZOWL_PORT}` on the host.
- **Tailscale Serve** (private to your tailnet): enable HTTPS certificates for the tailnet, set
  `PUBLIC_BASE_URL` to the device's `https://<device>.<tailnet>.ts.net` address, then run

  ```bash
  tailscale serve --bg --https=443 http://127.0.0.1:3000
  ```

The health endpoint is `/api/health`.

## Create the administrator

Open `PUBLIC_BASE_URL`. An empty database redirects to `/setup`. Paste the token from
`secrets/initial-admin-setup-token` and choose an administrator email and a password of at least 12
characters. After you reach the ledger, delete the token file:

```bash
rm secrets/initial-admin-setup-token
```

The token is never stored in the database, and setup closes permanently once any account exists. Keep the
`secrets/` directory itself, because the container mounts it. The administrator creates the other accounts from
the web or mobile settings.

## Upgrade

Take a backup first (see below), then rebuild and replace the container:

```bash
git pull --ff-only
docker compose --env-file .env.docker build app
docker compose --env-file .env.docker up -d --no-deps app
docker compose --env-file .env.docker ps
```

Migrations only move forward. Rolling back to an older image does not undo them, so restore the backup if you
need to go back.

### Upgrading a deployment that used the zeMoney names

If your deployment was set up before the `ZEMONEY_*` settings and database file were renamed to Zowl:

1. Back up `runtime/data` and `runtime/storage` first (see below).
2. Stop the old Compose project: `docker compose -p zemoney down`.
3. Rename all `ZEMONEY_*` variables to `ZOWL_*` in `.env.docker`.
4. In your data directory, rename `zemoney.sqlite` (along with any `zemoney.sqlite-wal` and `zemoney.sqlite-shm`
   files) to `zowl.sqlite` (`zowl.sqlite-wal`, `zowl.sqlite-shm`).
5. Start the container again with `docker compose --env-file .env.docker up -d --build app`.

Uploaded files in `runtime/storage` need no changes, because storage keys are relative.

## Publish the Android APK

The server can host the APK for your users at `/android`. Build a signed release from a machine with Flutter,
the Android SDK, and Java. Password-file variables keep secrets out of shell history:

```bash
API_BASE_URL=https://money.example.com \
ANDROID_KEYSTORE_PATH=/secure/release.jks \
ANDROID_KEYSTORE_PASSWORD_FILE=/secure/keystore-password \
ANDROID_KEY_ALIAS=release \
ANDROID_KEY_PASSWORD_FILE=/secure/key-password \
npm run mobile:release
```

The command builds an ARM64-only release APK into `releases/android/` (override with `ANDROID_RELEASE_OUTPUT`)
and checks, before writing `release.json`, that:

- the APK is not debuggable and not signed with the Android debug key;
- its version matches `mobile/pubspec.yaml`;
- only `arm64-v8a` is included;
- no plaintext development endpoints (localhost, `127.0.0.1`, the emulator's `10.0.2.2`) are embedded;
- the manifest's size and SHA-256 match the APK.

Copy the APK to `ANDROID_RELEASE_DIR` first and `release.json` last, so the download switches over atomically.
No restart is needed. The page and `GET /downloads/android/latest` check the filename, size, and hash at
request time. Without a valid manifest the page shows "Not available yet".

## Backup

SQLite and the storage directory must be saved at the same point in time. The simplest reliable way is a short
stop:

```bash
docker compose --env-file .env.docker stop app
tar -C runtime -czf "zowl-backup-$(date +%Y%m%d-%H%M%S).tar.gz" data storage
docker compose --env-file .env.docker start app
```

Copying `runtime/data` while the app is stopped captures the SQLite file together with any WAL/SHM files. Never
copy only the live `.sqlite` file. The APK directory is not needed to restore the ledger.

## Restore

Check that the archive contains both `data/` and `storage/`. Stop the app, keep the current directories as a
fallback, extract, and start:

```bash
docker compose --env-file .env.docker stop app
mv runtime/data runtime/data.before-restore
mv runtime/storage runtime/storage.before-restore
tar -C runtime -xzf zowl-backup-YYYYMMDD-HHMMSS.tar.gz
docker compose --env-file .env.docker up -d app
docker compose --env-file .env.docker ps
```

Once the health check passes and a few transactions and attachments look right, remove the `.before-restore`
copies.

## Deploying with Tailstack (optional)

`.tailstack/` and `npm run deploy:production` are how the maintainer deploys. They are built on Tailstack, a
separate tool that ships a Git commit to a host over Tailscale SSH, builds one image per release, backs up data
before migrating, and rolls back on failure. Tailstack is not published yet, so you don't need any of this to
self-host. It is documented here for reference.

- `tailstack init <host>` creates `~/.tailstack/zowl/shared/.env` on the host from `.env.docker.example`, but
  only if that file does not exist yet. Set `PUBLIC_BASE_URL` there. That file is the only place the public URL
  is configured.
- Every deploy runs `.tailstack/hooks/release.sh`. It refuses to continue while `PUBLIC_BASE_URL` is missing,
  not HTTPS, or still the example value. If `ZOWL_HOST` is unset or still the example, the hook sets it to
  the host of `PUBLIC_BASE_URL`.
- Host-specific overrides also go in that file: `ZOWL_PORT`, `ZOWL_TRAEFIK_NETWORK`,
  `ZOWL_TRAEFIK_ENTRYPOINT`, and `ZOWL_TAILSCALE_SERVE_HTTPS_PORT`. The last one defaults to `443`; set it
  to another port, or to `off` when the host's own proxy already owns 443.
- `npm run deploy:production -- <host> [git-ref]` deploys the clean, checked-out `HEAD`. It reads
  `PUBLIC_BASE_URL` from the host over SSH and builds the signed APK for that URL with the keystore variables
  above. Then it runs `tailstack deploy`, uploads the APK and manifest, and checks the public download.
