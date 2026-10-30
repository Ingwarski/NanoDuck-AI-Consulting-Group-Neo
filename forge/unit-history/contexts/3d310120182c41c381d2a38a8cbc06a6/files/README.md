# NanoDuck Consulting Group

A simpler, private, mobile-first browser product for genuine consultant and Critic discussion, live research and practical decisions.

**Canonical repository: `Ingwarski/NanoDuck-AI-Consulting-Group-Neo`.** Electric A v8 remains the approved design. Earlier consolidation and hosting records are preserved as historical evidence. The active deployment target is a new Northflank Sandbox project dedicated to this repository.

- [Product idea](docs/product-idea.md) — the recreated current brief.
- [Reconciled architecture](docs/architecture.md) — one Node app, one database, durable consultation work.
- [Models to preserve](docs/model-settings.md) — exact recorded values and evidence limits.
- [Development plan](docs/development-plan.md) — 8 implementation units, complete requirement/state coverage and release evidence.
- [Design brief](docs/design-brief.md) — NanoDuck identity, Electric palette and experience rules.
- [Screen map](docs/screen-map.md) — 9 surfaces and 44 review states.
- [SDD manifest](forge/sdd-manifest.json) — source hashes, traceability and design-stage progress.
- [Verification](docs/verification.md) — actual checks and unresolved limits.
- [Source provenance](docs/source-provenance.json) — approved design provenance and job-to-design mapping.
- [Northflank deployment](docs/northflank-deployment.md) — container, database, secret and lifecycle contract.
- [Historical GoDaddy boundary](docs/deployment-boundary.md) — evidence from the predecessor deployment only.

<a id="compare-the-three-designs"></a>

## Run the application locally

Requires Node.js 22. The production container and CI use the same major version.

```sh
npm install
npm run dev
```

Open [NanoDuck locally](http://127.0.0.1:3000/). Development mode exposes a local-only owner sign-in. Production mode requires a configured verified Google owner identity, HTTPS origin, a MySQL connection with certificate verification, separate data/recovery/session keys, and protected Codex app-server authentication. Northflank supplies the database through linked `DB_*` variables; a complete `DATABASE_URL` remains supported. Inject a base64url CA PEM or mount a CA file only when the database certificate does not chain to the container trust store. Use [`.env.example`](.env.example) to see variable names; do not commit values.

### Packaged defaults and private instruction editing

A fresh database is seeded from the public Markdown files in `instructions/`. `RUNTIME_PROMPTS.md` defines the structured runtime contract. `AGENTS.md`, `CONSILIUM.md`, `CONSULTING_PLAYBOOK.md` and `WORKING_CONTEXT.md` provide the four editable consulting documents. Existing owner edits remain authoritative. No bootstrap secret is needed; obsolete bootstrap variables are ignored and may be removed during a separately authorized deployment.

Settings stores encrypted, versioned private copies. Saving checks the current revision and rejects stale edits. History allows review and restoration; a default restore creates a new version. It never modifies the repository files. Each accepted consultation keeps an encrypted snapshot of its original effective instructions. Editable guidance cannot grant process tools, change authentication or choose a paid-provider fallback.

Before connecting a target runtime, supply Codex `auth.json` through `CODEX_APP_SERVER_AUTH_PATH` (a mounted private file), `CODEX_APP_SERVER_AUTH_B64` (the same bytes, base64url-encoded) or `CODEX_APP_SERVER_AUTH_GZIP_B64` (gzip/base64url for a length-bounded secret store); set one. The app creates the file only inside an owned, removed-after-use app-server directory. Northflank uses the compressed environment-secret form to avoid mounted-file ownership conflicts.

The owner selected Electric and requested colours from [HappyPro Academy](https://happypro.academy/): its blue and large-heading gradient, with warmer yellow Head Consultant, raspberry Critic, violet Product and turquoise Operations. The black Ember/Cobalt composition and behavior stay the same.

[Download the SVG logo](forge/design/candidates/a/v8/nanoduck.svg). The dark-interface mark appears in navigation, sign-in and the favicon. [Original charcoal-outline SVG](forge/design/candidates/a/v8/nanoduck-original.svg) is also included.

[The review page](http://127.0.0.1:4328/comparison/) preserves the selected palette and links to the unchosen Solar/Prismatic references. Earlier v1–v7 files and receipts remain unchanged. This revision makes all nine node radii equal and separates the upper coloured segments by a clear gap; the complete Electric A v8 was explicitly approved on 14 September 2026. See [current verification](docs/verification.md).

The implemented app uses a floating desktop menu, mobile hamburger, literal Settings, model and reasoning selectors, icon-only microphone and a visible Send button. New sits above the workspace and remains available in Conversations; it is absent from global menus. Discussion, Outcome and Sources show persisted consultation events rather than fixtures.

The app enforces an absolute 24-hour session from sign-in, including inactivity and browser reopening, with immediate sign-out/revocation/security exceptions. A discussion is accepted durably before orchestration begins. Voice input uses the native recognition API available in Safari and Chrome; Ukrainian uses the browser's Ukrainian locale (`uk-UA`). Speech can be processed by the browser's recognition service only after Start. NanoDuck receives no audio: it inserts only editable text into the local draft, and Send remains separate.

The original green design in `prototype/` is rejected historical evidence. It is not an approved baseline. The canonical baseline and approval receipt are in the design brief.

```sh
npm run check
```

The source repository is public; the intended application remains private to one owner. Do not add private conversation archives, provider grants, secrets or deployment data to Git. Production startup applies the idempotent migration only to `nanoduck_*` tables after the deployment target's database ownership is verified; `npm run migrate` remains available for an explicit operator run.

### Northflank Sandbox

The production image is built from the repository `Dockerfile`. NanoDuck permits only one application process to own its database: its migration, recovery and consultation restart handling must not run concurrently in two containers. Use one replica and a stop-old, start-new release sequence. Northflank's ordinary single-instance replacement overlaps the containers, so automatic deployment remains disabled unless the account exposes the `recreate` strategy. For an update, scale to zero and wait for every old container to stop, select the new successful build, then scale back to one.

The live process checks ownership on its reserved MySQL connection at a bounded interval below the session idle timeout. Ordinary requests use other pooled connections and cannot keep this lock connection alive. A failed or timed-out ownership check still shuts the process down; it never silently reacquires the lock while old work could remain active. Startup logs report the bound address, runtime mode and content-free lease timing, and connection-loss logs expose only normalized error codes.

Keep `NANODUCK_DEPLOYMENT_ROLE` unset, set `NANODUCK_RUNTIME_MODE=production`, and expose container port `3000`. Configure `/healthz` for startup, readiness and liveness checks. See the [Northflank runbook](docs/northflank-deployment.md) for the exact variables, TLS and release procedure.

Google does not accept Northflank's generated `*.code.run` hostname as an OAuth redirect domain. The deployment therefore uses the repository's small Cloudflare Worker as its stable public HTTPS origin, and NanoDuck requires the Worker's shared secret header on every non-health request. Northflank remains the application and database runtime; the Worker stores no application data. The runbook contains the exact endpoint and release order.

Backups contain confirmed conversations, linked images, deletion records, settings and all instruction versions. Active provider processes and credentials are excluded. Recovery is an operator-only, explicit command. `npm run recovery -- backup <new-encrypted-file>` creates a new encrypted recovery envelope with the separate recovery key. `npm run recovery -- restore <encrypted-file> --confirm-restore` requires an explicit destructive confirmation and applies deletion tombstones before records, so a deleted conversation cannot return. The application must be stopped for restore. Normal restore preserves current settings and instructions; add `--replace-configuration` only for an intentional full configuration restore. That option revokes existing browser sessions. Backup and restore share a 32 MiB envelope limit and reject larger files. See [recovery details](docs/consolidation.md#recovery). No recovery command in this consolidation was run against a live database.
