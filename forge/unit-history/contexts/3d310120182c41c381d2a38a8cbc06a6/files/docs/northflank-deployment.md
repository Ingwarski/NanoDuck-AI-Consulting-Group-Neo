# Northflank Sandbox deployment

This repository targets one Northflank Sandbox project containing one application service and one private MySQL addon used through a verified TLS connection. It is a private single-owner application, and the database and application secrets belong only to this deployment.

## Container contract

Northflank builds the root `Dockerfile`. The image contains Node.js 22, the pinned Codex and Claude Code packages, the server, client assets and packaged instruction defaults. It runs as the unprivileged `node` user, writes provider homes only below the container temporary directory, listens on `PORT` (default `3000`) and serves `GET /healthz` after migration, database leadership and restart fencing succeed.

Create one public HTTP port targeting container port `3000`. Configure startup, readiness and liveness HTTP probes for `/healthz`. Allow enough startup time for the idempotent schema migration. Do not attach a persistent application volume: conversations, settings, instructions and encrypted image attachments live in MySQL.

## Public OAuth endpoint

Northflank's generated `*.code.run` service hostname cannot be registered as a Google OAuth redirect because the wildcard is a public suffix and therefore does not provide a registrable top private domain. The free Cloudflare Worker in `cloudflare/northflank-proxy.mjs` supplies the accepted public origin while Northflank remains the only application and database runtime:

- public origin: `https://nanoduck-neo.kyivteam-6d0.workers.dev`
- private implementation origin: `https://web--nanoduck-web--m7j2w2s2fx77.code.run`
- Google redirect: `https://nanoduck-neo.kyivteam-6d0.workers.dev/auth/google/callback`

Set Northflank `APP_ORIGIN` to the public Worker origin. The Worker preserves the browser `Origin` header for application CSRF checks, keeps redirects manual so OAuth cookies and the shared origin credential cannot follow to another host, streams request and response bodies, and never caches application responses. It rewrites only redirects back to the Northflank origin. NanoDuck's only proxy-specific behavior is the optional shared-header guard described below.

Northflank's free tier does not expose ingress security rules. Generate one independent key with at least 32 random bytes and store it as `EDGE_PROXY_KEY` in both the Worker and Northflank runtime secrets. The Worker overwrites `X-NanoDuck-Origin-Key` on every proxied request. NanoDuck rejects every request except `GET /healthz` unless that header matches, so the generated Northflank hostname cannot bypass authentication through the Worker. Never store the value in Git or a Wrangler variable. Disable Worker preview URLs so only the stable public hostname is valid.

Deploy the proxy only after the matching Northflank runtime secret is ready:

```sh
npm run edge:check
npx wrangler secret put EDGE_PROXY_KEY
npm run edge:deploy
```

The Worker free plan has a finite daily request allowance. NanoDuck polls every two seconds only while a consultation is active, so monitor request usage during real consultations and stop the active run when it is no longer needed.

## Database

Create one private MySQL addon before the first deployment. Link its `HOST`, `PORT`, `DATABASE`, `USERNAME` and `PASSWORD` credentials as `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`; a standard complete `DATABASE_URL` remains supported when the provider supplies one. If the addon certificate does not chain to the Debian system trust store, obtain its CA certificate from the trusted project network and pin it with exactly one source: store the PEM as canonical base64url in `DATABASE_SSL_CA_B64` (preferred on Northflank), or mount it as a readable runtime secret file and set `DATABASE_SSL_CA_PATH`. Never disable certificate verification or expose MySQL publicly for the application.

NanoDuck holds a MySQL advisory lock for its full lifetime. Configure exactly one application replica and disable autoscaling. The default Northflank single-instance release starts the replacement before terminating the old container; that overlap is incompatible with the lock and startup migration. Keep automatic deployment disabled.

The first deployment is safe because no previous database leader exists. For every later release:

1. Scale the service to zero instances.
2. Wait until Northflank shows no active container.
3. Deploy or select the new successful build while the service remains at zero.
4. Scale the service back to one instance and wait for `/healthz`.

Do not use ordinary **Restart** or a secret group's **restart dependents** action while an instance is running; both can use replacement-first behavior. Pause/Resume is also unsuitable as the primary release sequence because Resume can start the previous build before the new build is selected. If the account exposes the `recreate` rollout strategy, it may replace this manual sequence after a verified restart rehearsal.

## Runtime variables and secrets

Use `.env.example` as the name inventory. Required production values are:

- `NANODUCK_RUNTIME_MODE=production`
- `APP_ORIGIN`, exactly matching the public Worker HTTPS origin
- `EDGE_PROXY_KEY`, exactly matching the Worker's secret of the same name
- `PORT=3000`
- private MySQL `DATABASE_URL` or the complete `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` set, plus exactly one of `DATABASE_SSL_CA_B64` or `DATABASE_SSL_CA_PATH` when its CA is not in the system trust store
- separate `DATA_ENCRYPTION_KEY`, `RECOVERY_ENCRYPTION_KEY` and `SESSION_SIGNING_KEY`
- `OWNER_GOOGLE_SUBJECT` or `OWNER_GOOGLE_EMAIL`, plus `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- exactly one Codex credential source; `CODEX_APP_SERVER_AUTH_GZIP_B64` is preferred on Northflank

`CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_CODE_MODEL_CANDIDATES` are optional. Omitting the token keeps Claude unavailable without preventing the Codex-backed application from starting. Keep every credential in Northflank runtime secrets, never build arguments, image layers, repository files or logs.

Register `${APP_ORIGIN}/auth/google/callback` as the exact authorized redirect URI in the Google OAuth client.

## Release verification

Before calling a release usable, verify the build and container checks, `/healthz`, fresh Google sign-in, Settings provider/catalog status, one real owner consultation, Stop/Continue after restart, encrypted attachment persistence and an isolated encrypted backup/restore rehearsal. Record peak memory during the consultation: source compatibility does not prove that both provider CLIs fit the Sandbox compute allowance.
