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
