# Screen map

27 September 2026. This reconciliation preserves `S-01`–`S-09` and `ST-01`–`ST-44`; the combined update needs no new user-facing surface or canonical state ID.

## Source references

[PRD](prd.md), [project context](project-context.md), [canonical terms](canonical-terms.md), [guardrails](guardrails.md), [user journey](user-journey.md), [combined-update authorization](../forge/runs/combined-updates-port-20260927/implementation-prompt.json) and [repository-neutral source receipt](../forge/runs/combined-updates-port-20260927/source-input.json). This artifact owns surface/location/state inventory; structure and visual treatment remain with their downstream owners.

## Navigation and route model

Desktop floating navigation exposes Discussion, Conversations and Settings; mobile exposes the same destinations through S-09's labelled hamburger. Login/Logoff stays directly reachable in either form. New remains contextual above the chat and inside Conversations, never a global menu destination.

S-02 is the consultation reading frame. Its desktop rail and mobile compact selector move among Discussion, S-07 Outcome, S-06 Sources and request-scoped Usage without changing the open conversation. The canonical fragments are `#discussion`, `#outcome`, `#sources` and `#usage`; restoring one restores its current visible panel and reading position. Labelled top/bottom arrows move only to the current panel's boundaries, hide at the applicable boundary and never select another panel. Status and active Stop remain available independently of composer visibility. S-04 retains future preferences plus all/conversation Usage and account-allowance access.

Electric A v8 remains the approved baseline. PRD FR-08.3 is a scoped material/content-footprint override: S-02, S-03 and S-04 provide visible permitted content beneath both curved navigation ends. Native controls remain above the decorative lens. Opaque reduced-transparency, forced-colour and unsupported-rendering fallbacks preserve the same routes/actions.

## Screen inventory and journey-to-screen trace

| Surface | Route/location | Use cases | Journey | Requirement |
|---|---|---|---|---|
| S-01 — Sign in | `#login` | UC-001 | J-01 | FR-01.1–01.2, NFR-10.1–10.3 |
| S-02 — Consultation frame, Discussion and composer | `#discussion`; local `#outcome`, `#sources`, `#usage` | UC-002, UC-003, UC-004, UC-005, UC-007 | J-02/J-03/J-04/J-05 | FR-02.1–02.15, FR-03.1–03.6, FR-08.1, FR-08.3 |
| S-03 — Conversations | `#history` | UC-004 | J-05/J-06 | FR-06.1, FR-08.3 |
| S-04 — Settings and full Usage | `#settings` | UC-005 | J-07 | FR-05.1–05.6, FR-08.2–08.3, NFR-10.2 |
| S-05 — Voice input | `#voice` overlay from S-02 | UC-006 | J-02 | FR-07.1–07.5 |
| S-06 — Sources and detail | `#sources` inside S-02 | UC-007, UC-004 | J-04/J-05 | FR-04.1–04.3 |
| S-07 — Outcome | `#outcome` inside S-02 | UC-002, UC-004 | J-05/J-06 | FR-02.6–02.7 |
| S-08 — Record action confirmation/export | `#record-action` overlay from S-03/S-02 | UC-004 | J-06 | FR-06.2–06.3 |
| S-09 — Mobile navigation | `#menu` overlay | UC-001, UC-003, UC-005 | J-01/J-05/J-07 | FR-08.1 |

## Screen states

Cancellation returns to the originating surface and preserves eligible draft state; it does not create another canonical state. Usage freshness/coverage, lens support and composer visibility are orthogonal substates of the existing rows below, not separate destinations. Long English/Ukrainian fixtures cover wrapping, semantic tables and current-panel reading.

| State | Surface | Meaning / fixture key | Route and use cases |
|---|---|---|---|
| ST-01 | S-01 | `signed-out` — no private content or stale lens pixels | `#login` · UC-001 |
| ST-02 | S-01 | `consent` | `#login` · UC-001 |
| ST-03 | S-01 | `denied` | `#login` · UC-001 |
| ST-04 | S-01 | `expired` — return after private client/lens clear | `#login` · UC-001 |
| ST-05 | S-02 | `empty` — no accepted request; composer ready | `#discussion` · UC-002, UC-003 |
| ST-06 | S-02 | `draft` — unsent text/attachment/voice state; Send creates a new request boundary | `#discussion` · UC-002, UC-003, UC-006 |
| ST-07 | S-02 | `attachment-error` — draft preserved | `#discussion` · UC-002, UC-003 |
| ST-08 | S-02 | `clarification` — one question within the accepted request | `#discussion` · UC-002, UC-003 |
| ST-09 | S-02 | `active` — Head assignments/dependencies, parallel ready results, linked Critic orders, thought state, running/partial Usage and reachable Stop; input may hide without hiding Stop | `#discussion`/`#usage` · UC-002, UC-003, UC-005, UC-007 |
| ST-10 | S-02 | `complete` — Outcome available; composer may be collapsed and explicitly restored with draft/attachment/voice state and focus preserved; Usage complete or honestly partial | `#discussion`/`#outcome`/`#usage` · UC-002, UC-003, UC-005 |
| ST-11 | S-02 | `stopped` — confirmed work retained; Continue restores the same request | `#discussion` · UC-002, UC-003 |
| ST-12 | S-02 | `offline` — selected panel/record/reading position and eligible page-memory draft preserved | current panel · UC-002, UC-003, UC-004 |
| ST-13 | S-02 | `provider-auth` — selected-provider recovery only | current panel · UC-002, UC-003 |
| ST-14 | S-02 | `quota` — quota action differs from authorization/outage | current panel/`#usage` · UC-002, UC-003, UC-005 |
| ST-15 | S-02/S-06 | `research-error` — accepted record and explicit evidence gap retained; Retry remains request-bound | `#discussion`/`#sources` · UC-002, UC-003, UC-007 |
| ST-16 | S-02 | `system-error` — missing assignment/research/assessment can Retry without repeating confirmed work | current panel · UC-002, UC-003 |
| ST-17 | S-02/S-06/S-07 | `long-content` — current-panel arrows, contained semantic-table scrolling/focus and no page-level horizontal overflow | current panel · UC-002, UC-003, UC-004, UC-007 |
| ST-18 | S-03 | `populated` — conversation content extends beneath both glass ends | `#history` · UC-004 |
| ST-19 | S-03 | `empty` — useful content footprint still reaches curved ends | `#history` · UC-004 |
| ST-20 | S-03 | `unavailable` — no private history exposed | `#history` · UC-004 |
| ST-21 | S-04 | `saved` — current future-run settings/instruction revision; Usage/account allowance may be fresh, running, partial or complete and labels missing versus zero | `#settings` · UC-005 |
| ST-22 | S-04 | `edited` — future settings/instruction review/restore; active request unchanged | `#settings` · UC-005 |
| ST-23 | S-04 | `invalid-settings` — model tuple or instruction validation; edit retained | `#settings` · UC-005 |
| ST-24 | S-04 | `catalog-or-account-unavailable` — saved tuple preserved; allowance absent/stale independently of conversation Usage | `#settings` · UC-005 |
| ST-25 | S-04 | `session-control` — reauthentication/revocation/Logoff; delayed Usage response and lens repaint cannot restore private state | `#settings` · UC-005 |
| ST-26 | S-05 | `ready` | `#voice` · UC-006 |
| ST-27 | S-05 | `recognizing` | `#voice` · UC-006 |
| ST-28 | S-05 | `recognition-complete` | `#voice` · UC-006 |
| ST-29 | S-05 | `transcript` — editable and unsent | `#voice` · UC-006 |
| ST-30 | S-05 | `permission-denied` — typed draft retained | `#voice` · UC-006 |
| ST-31 | S-05 | `microphone-unavailable` — typing remains available | `#voice` · UC-006 |
| ST-32 | S-05 | `interrupted` — no automatic submission | `#voice` · UC-006 |
| ST-33 | S-05 | `recognition-error` — draft retained | `#voice` · UC-006 |
| ST-34 | S-06 | `list` — request-scoped URL-plus-claim records with resolved S-references | `#sources` · UC-007, UC-004 |
| ST-35 | S-06 | `detail` — claim, direct URL, freshness and limitations; return to originating claim | `#sources` · UC-007, UC-004 |
| ST-36 | S-06 | `unavailable` — failed/conflicting/unknown evidence stays an explicit gap; no fabricated link | `#sources` · UC-007, UC-004 |
| ST-37 | S-07 | `recommendation` — complete Consolidated advice; semantic tables supported | `#outcome` · UC-002, UC-004 |
| ST-38 | S-07 | `provisional` — unresolved Critic orders/evidence gaps remain visible | `#outcome` · UC-002, UC-004 |
| ST-39 | S-08 | `delete-confirmation` | `#record-action` · UC-004 |
| ST-40 | S-08 | `deleted` | `#record-action` then `#history` · UC-004 |
| ST-41 | S-08 | `export-ready` — native RTF rows/cells derive from the same safe parsed tables; no screenshot or pipe-text imitation | `#record-action` · UC-004 |
| ST-42 | S-08 | `export-error` — record unchanged and retryable | `#record-action` · UC-004 |
| ST-43 | S-09 | `closed` — Login/Logoff remains visible | `#menu` · UC-001, UC-003, UC-005 |
| ST-44 | S-09 | `open` — Discussion/Conversations/Settings only; opening does not expose private content | `#menu` · UC-001, UC-003, UC-005 |

## Cross-state contracts

**Request binding.** ST-06 Send creates a fresh accepted request and internal `requestMessageId`; ST-09/ST-10/ST-11/ST-13–ST-16 retain that binding. Continue resumes ST-11 and Retry resumes the missing step from ST-13–ST-16. Neither imports another Send, replays completed work nor creates a second active run. A later Send returns through ST-06 and creates a new boundary. Head plans, parallel specialists and Critic order/assessment records appear as addressed messages within S-02 rather than procedural screens.

**Research and evidence.** Research planning/execution is a non-screen service transition from S-02 to ST-34/ST-35 or ST-36. Head selects same-request evidence reuse or fresh work. Unknown/foreign S-references receive only the bounded repair path before ST-36; they never become visible invented citations.

**Tables and export.** ST-10/ST-17/ST-37 use the shared safe Markdown structure: labelled semantic tables, scoped headers, keyboard-focusable horizontal scrolling and inert malformed/provider HTML. ST-41 exports that structure as escaped native RTF tables. S-08 adds no format-selection screen.

**Usage and privacy.** Request-scoped Usage is a local S-02 panel; conversation/all scope and account allowance remain available from S-04. Running, partial, complete, stale and unavailable are truthful data conditions within ST-09/ST-10/ST-21/ST-24, with missing distinct from explicit zero. Logoff/expiry/session revocation transitions to ST-01/ST-04 only after private client/Usage content and glass buffers clear; late account results cannot repopulate them.

**Glass lifecycle.** S-02/S-03/S-04 ordinary content, nested scroll, resize, font readiness and visibility updates retain the current valid sampled frame until its replacement is ready; no blank intermediate frame is a user-visible state. Logoff, lock and disallowed-rendering transitions synchronously clear source/output pixels and cancel/recheck deferred work. Input values, option text, textarea text and cross-origin images never enter sampling. Fallback changes material only, not surface identity or navigation.

## Transitions and surface closure

J-01 resolves through S-01 to S-02; S-09 never grants identity. J-02 enters S-05 only after explicit voice choice and returns to ST-06 for review; Send remains separate. Invalid images stay at ST-07 with the draft intact.

J-03 stays in S-02 while Head-authored assignments, dependency-ready parallel results and linked Critic corrections arrive; active Stop is always reachable. J-04 opens S-06 and returns to the originating claim/panel. J-05 switches only local panels, uses current-panel arrows and preserves composer/focus state; Stop/Continue/Retry follow the request-binding contract above. Refresh restores the authenticated surface, selected panel, open record and reading position without a record ID or draft content in persistent browser storage.

J-06 uses S-07 for the conclusion, S-03 to reopen history and S-08 for native RTF export/deletion. Delete cancellation is inert; successful deletion returns to S-03. J-07 uses S-04; saved changes affect future requests while active work retains its accepted snapshot. Provider authorization, quota, outage, app-session expiry and account-allowance failure remain distinct transitions.

The existing Neo Northflank/private TLS MySQL/Google authentication/`nanoduck-neo` Worker topology has no owner-facing setup or deployment screen. Repository reconciliation does not deploy or restart it. A later activation is a separate operator transition requiring zero active consultations, recoverable data/rollback and the authorized scale-to-zero/select-build/start-one sequence; it creates no new product surface.

Security-sensitive transitions retain PRD NFR-10.1–10.3, NFR-11.1–11.3, NFR-12.1–12.3 and NFR-14.1–14.3. Screen visibility never grants access. Reflow, keyboard, focus and 200% text coverage apply across the inventory under NFR-02.1–02.3.

## Open questions

No material surface/state gap blocks the authorized update. Architecture owns API/runtime paths and must return any user-facing route change to this owner. Native Safari/physical-device behavior, current provider entitlement, representative-owner outcomes and safe Neo activation remain evidence gaps. Frozen candidates are simulations; release readiness remains `not_evaluated`.
