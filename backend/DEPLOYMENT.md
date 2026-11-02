# ULMS backend: deployment, backup and rollback

This describes a single-server deployment (Node process behind a reverse proxy,
MongoDB on the same or a nearby host). Nothing here has been run against a real
production environment. Blue-green deployment needs two parallel environments
and a switchable load balancer; it is not assumed here.

## Required production configuration

The server refuses to start with `NODE_ENV=production` unless all of these hold:

| Variable | Requirement |
| --- | --- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | At least 32 characters, no `change-me` placeholder. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGINS` | Comma-separated list of the real frontend origins. No wildcard. |
| `FRONTEND_URL` | The public frontend URL (used in reset links). |
| `COOKIE_SECURE` | `true`, which means the API is served over HTTPS. |

Also set:

- `SMTP_*` and `MAIL_FROM` for the mail server that sends reset codes.
- `MONGO_URI` to the production database. Use a dedicated MongoDB user with
  read/write on that database only.
- `TRUST_PROXY` to the number of reverse proxies in front of Node (default 1).
  A wrong value either throttles every user as one address or lets clients fake
  their address.
- `COOKIE_SAME_SITE`: leave `lax` when the frontend and API share a site. Use
  `none` only if they are on different sites, and then CSRF on the cookie
  endpoints (`/auth/refresh`, `/auth/logout`) relies on the CORS origin check.
- `EXPOSE_DEV_SECRETS` must stay unset or `false`.
- `ENABLE_API_DOCS` stays off unless the docs are protected by the proxy.
- Run the seed script only on a new empty database, and change the seeded
  administrator password immediately. Never run `seed:fresh` against production
  (it clears collections).

## Proxy and HTTPS

- Terminate TLS at the proxy, redirect HTTP to HTTPS, and forward
  `X-Forwarded-For` and `X-Forwarded-Proto`.
- The API sends HSTS and the other `helmet` headers itself.
- Rate limits are counted in each Node process's memory. With several
  instances, the effective limit is the configured value times the instance
  count. Add rate limiting at the proxy or CDN for volumetric (DDoS) protection;
  an in-process limiter cannot stop it.
- Consider proxy limits for `/api/v1/reports` and any `?format=` export.

## Health check

`GET /health` returns `200` with `{"data":{"status":"ok"}}`. It does not query
MongoDB, so it shows the process is up, not that the database is reachable.
Point the load balancer or process manager at it, and monitor MongoDB
separately.

## Backup and restore

The repository has no backup job. Set one up before go-live:

```bash
# Backup (run nightly from cron or the host scheduler)
mongodump --uri "$MONGO_URI" --gzip --archive=ulms-$(date +%F).gz

# Restore into a scratch database first, then verify
mongorestore --uri "$SCRATCH_MONGO_URI" --gzip --archive=ulms-2026-01-01.gz --nsFrom 'ulms.*' --nsTo 'ulms_restore.*'
```

- Uploaded files live in `UPLOAD_DIR` (default `src/uploads`). Back this
  directory up with the database, or the database will point at missing files.
- Copy backups off the server and keep several days of history.
- Test a restore into a scratch database at least once before go-live and after
  any schema change. A backup that has never been restored is untested.
- Keep dumps access-controlled; they contain password hashes and personal data.

## Deploy

1. Take a database backup and note the currently running version (git tag or
   commit hash).
2. Install dependencies with `npm ci` and run `npm test` against a test
   database (never the production one).
3. Deploy the new code and restart the process. On start the server connects to
   MongoDB, drops indexes that this release replaces (currently
   `notifications.dedupeKey_1`) and builds the new ones.
4. Check `/health`, sign in, and load one page that reads from the database.

## Rollback

1. Stop sending traffic to the new version (or stop the process).
2. Redeploy the previous tag or commit and restart.
3. Database compatibility:
   - This release replaces the unique index on `notifications.dedupeKey` with a
     partial index named `unique_dedupe_key`, and drops the old
     `dedupeKey_1`. The previous code expects the old index only for
     reminders, and rolling back does not break it: Mongoose recreates
     `dedupeKey_1` on start. That older index again rejects a second
     notification with no key, which is the defect this release fixes, so
     roll back only if you must.
   - Password hashes created at the new cost factor (12) are valid for the old
     code. No data conversion is needed.
   - If a restore is required, restore into a scratch database and compare
     before switching, and expect to lose writes made since the backup.
4. Do not run destructive scripts (`seed:fresh`, `accession:renumber`) as part of
   a rollback.

## Pre-release checklist

- [ ] Secrets set, at least 32 random characters, stored outside git
- [ ] `CORS_ORIGINS`, `FRONTEND_URL`, `COOKIE_SECURE=true`, `TRUST_PROXY` set
- [ ] HTTPS and HTTP-to-HTTPS redirect in place
- [ ] Seeded default password changed
- [ ] Backup job running and one restore tested
- [ ] `npm test` and `npm run lint` pass
- [ ] `npm audit --omit=dev` reviewed (see known issues)
- [ ] SMTP configured and a reset code received at a real mailbox
- [ ] Health check wired to the proxy or process manager
- [ ] Proxy or CDN rate limiting enabled
- [ ] Log output collected and rotated; logs checked for secrets

## Known issues

- `exceljs` depends on `uuid` below 11.1.1 (moderate advisory). The suggested
  automatic fix downgrades `exceljs` and would break exports.
- Password reset codes are emailed, so production needs working SMTP
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM`). With `SMTP_HOST` empty nothing is sent and users cannot reset
  their passwords. Send a test reset to a real mailbox before go-live.
