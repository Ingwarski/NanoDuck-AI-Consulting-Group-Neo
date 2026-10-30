# Working in this repository

Canonical source for this checkout: `Ingwarski/NanoDuck-AI-Consulting-Group-Neo`. Verify the checkout root and remote before repository operations. The earlier GoDaddy deployment and its source repository are historical predecessors, not branches or worktrees of this repository. Do not change repositories implicitly.

This repository contains NanoDuck Consulting Group, a private browser application for the owner’s consultant and Critic discussions.

- Read `docs/product-idea.md` as current intent and `docs/prd.md` as its specification. `docs/architecture.md` defines the application architecture.
- Use the installed `to-sdd-pipeline` contract for dependencies and ownership. Each named domain skill owns its document; `to-project-context` owns the context/terms bundle together. Only the orchestrator writes `forge/sdd-manifest.json`. Run the pipeline checker before and after each owner invocation, declare all consumed sources, and revalidate affected downstream owners in order. Later evidence references never become creation prerequisites.
- Current phase: Electric A v8 approved and Phase 3 implementation is authorized by `forge/runs/implementation-prompt-20260914.json`. Read `docs/development-plan.md` for the source-bound implementation handoff. The owner authorized deployment of this repository to a new Northflank Sandbox target on 21 September 2026, then explicitly authorized the free Cloudflare Worker `nanoduck-neo` solely as the OAuth-compatible public proxy for that target. Do not deploy elsewhere, connect other providers, or change predecessor hosting resources.
- Electric A v8 is the approved baseline in `docs/design-brief.md`; B/C are unchosen comparison references. Current candidates are the three active versioned entries in `forge/sdd-manifest.json`, under `forge/design/candidates/`; the README links their comparison. `prototype/` and `docs/design.md` are rejected historical material. Preserve frozen versions and receipts; revisions receive new versions. Never present simulated conversation, login, research, voice or recovery as live backend evidence.
- Preserve the exact saved models and settings; see `docs/model-settings.md`. Historical snapshots are not current entitlement evidence.
- Public repository: do not commit secrets, provider grants, private conversations, owner identifiers, financial/medical details or local absolute paths. Local review transcripts remain ignored.
- Keep changes small and usable. Prefer one app, one server, one database; retain durability, cancellation, privacy and truthful state.
- Only the new Northflank project, service and database plus the dedicated `nanoduck-neo` Cloudflare Worker and its shared origin key are in deployment scope. Predecessor GoDaddy resources remain outside scope.
- Verify changed prototype flows in a real browser. Commit and push completed repository changes after inspection.
