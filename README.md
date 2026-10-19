# NotesGym - Self-hosted

NotesGym is a lightweight student grade tracking app with local accounts and local data storage.

This version is fully self-hosted: it does not use Base44 or any external backend.

## Features

- Swiss (1-6), French (0-20), and American (A-F) grading systems
- Weighted averages and GBJB compensation calculation
- CSV export and PDF report generation
- Grade projection mode
- Year archiving
- FR / EN / DE interface
- Local user accounts
- Per-user notes
- Docker deployment suitable for a Raspberry Pi 5

## Quick Start With Docker

1. Edit `docker-compose.yml`.
2. Change `NOTESGYM_USERS`:

   ```yaml
   NOTESGYM_USERS: "parent@example.com:strong-password,student@example.com:another-password"
   ```

3. Start the app:

   ```bash
   docker compose up -d --build
   ```

4. Open:

   ```text
   http://localhost:8080
   ```

The first start creates the configured users. Data is stored in the `notesgym-data` Docker volume.

## Updating the Docker Container

From the directory containing `docker-compose.yml`, download the latest source code and rebuild the container:

```bash
git pull
docker compose down
docker compose up -d --build
```

`docker compose down` removes the old container, but **keeps the `notesgym-data` volume**. Your users and notes are therefore preserved during an update. Do not add the `-v` option when updating.

You can then check that the new container is running and inspect its logs:

```bash
docker compose ps
docker compose logs --tail=100 notesgym
```

If you also want Docker to refresh the base images used by the build, use:

```bash
docker compose build --pull
docker compose up -d
```

## HTTPS behind Cloudflare Tunnel or another reverse proxy

For `https://notesgym.lupachat.ch`, set this in the Compose `.env` file:

```dotenv
NOTESGYM_PUBLIC_URL=https://notesgym.lupachat.ch
```

The standard `docker-compose.yml` forwards this setting into the container. The browser uses HTTPS even when the tunnel connects to the app over HTTP on port 8080. The configured public origin is used for write-request origin checks and `Secure` session cookies; an internal HTTP hop must not change it. Keep existing accounts, passwords, data paths and the `notesgym-data` volume unchanged.

`NOTESGYM_TRUST_PROXY` can stay `false` when the public URL is explicit. To use per-visitor rate limits with `CF-Connecting-IP`, enable it and set `NOTESGYM_TRUSTED_PROXY_IPS` to the exact direct proxy IP/CIDR as seen by the app. Never use a trust-all network. With a trusted peer and no explicit public URL, `X-Forwarded-Proto: https` and the request Host supply the public origin. Untrusted forwarded headers are ignored; hostile origins, `Origin: null`, and cross-site writes remain refused.

Keep the tunnel's service target, DNS and credentials as currently configured. Cloudflare documents [forwarded headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/) and the optional [Host override](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/#httphostheader). With an explicit public URL, no Host override is required by NotesGym's origin comparison. A native Node process must receive the environment variables directly; `.env` is not loaded automatically by `npm start`.

For local HTTP, leave the public URL unset or set it to the exact local origin. `NOTESGYM_SECURE_COOKIES=true` can force secure cookies; an HTTPS public URL enables them automatically. See [the cleanup and validation report](docs/classic-web-cleanup.md) for the removed integration and deployment transition details.

## User Accounts

Users are created from the `NOTESGYM_USERS` environment variable.

Format:

```text
email:password,email2:password2
```

Existing users are not overwritten when you restart the container. To add another user later, add it to `NOTESGYM_USERS` and restart the container.

Each user only sees their own notes.

## Manual Setup

1. Install Node.js 20+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the frontend:

   ```bash
   npm run build
   ```

4. Start the local server:

   ```bash
   NOTESGYM_USERS="parent@example.com:change-me,student@example.com:change-me-too" npm start
   ```

On Windows PowerShell:

```powershell
$env:NOTESGYM_USERS="parent@example.com:change-me,student@example.com:change-me-too"
npm start
```

## Storage

By default, the server stores JSON files in `./data`.

In Docker, storage is mounted at `/data` through the `notesgym-data` volume.

Back up this volume to back up NotesGym.

## Clearing Notes or Resetting the Database

The Docker volume contains two JSON database files:

- `/data/notes.json`: all notes for all users;
- `/data/users.json`: local user accounts.

### Delete all notes but keep user accounts

Make sure nobody is adding or editing a note, then replace only `notes.json` with an empty list:

```bash
docker compose exec notesgym sh -c 'printf "[]\n" > /data/notes.json'
docker compose restart notesgym
```

This deletes the notes of **every user**, including archived notes, but preserves the accounts in `users.json`.

### Completely reset NotesGym

To delete all notes **and** all local accounts, remove the container and its data volume:

```bash
docker compose down -v
docker compose up -d --build
```

This operation is irreversible unless you have backed up the volume. On the next start, the accounts listed in `NOTESGYM_USERS` are created again with empty note lists.
