# Development plan

27 September 2026 · Status: **authorized combined implementation and tests present at revision `7b3b4545e2b8c18f488ac667973a0c3ddf661ff3`; repository finalization in progress; runtime activation not run**. Scope remains this repository's one Northflank application service, one private TLS-verified MySQL addon, existing Google owner authentication and dedicated `nanoduck-neo` Cloudflare Worker. Preserve provider connections, private data and active consultations. Activation requires separate authority and the zero-active-run gate; release readiness is `not_evaluated`.

## Source References

[Product idea](product-idea.md) supplies current intent; [PRD](prd.md) supplies all 67 distinct FR/NFR clauses, UC-001–UC-007 and AC-001–AC-010. [Context](project-context.md) and [terms](canonical-terms.md) are applied: single owner, browser-first use, literal Settings, separate AI roles and established vocabulary constrain local UI/API decisions. No context conflicts remain. [Guardrails](guardrails.md) supply authority and phase boundaries. [Journey](user-journey.md), [screen map](screen-map.md) and [wireframes](wireframes.md) supply all jobs, transitions, 9 surfaces and 44 states.

[Design brief](design-brief.md#approved-visual-baseline) is the visual authority: frozen Electric A v8 (`nanoduck-electric-a-v8-20260914`) plus the authorized 27 September reading/liquid-glass production override. [Architecture](architecture.md), [DoD](dod-evals.md) and [QA checklist](qa-checklist.md) have been reconciled in that order. This plan consumes all eight DoD gates, 92 prepared QA definitions, H1–H10 and the representative-owner tasks. [Model settings](model-settings.md) preserves Codex CLI 0.155.1, Claude Code 2.1.280 and the selected tuples; [northflank-deployment.md](northflank-deployment.md) defines the Neo seam. Historical predecessor-host evidence cannot pass it.

The exact authorization is `forge/runs/combined-updates-port-20260927/implementation-prompt.json`; `source-input.json` records the logical combined-update input without its machine path; `verification.json` records supplied local implementation observations and limits. Those receipts authorize and describe repository work, not activation. Exact consumed hashes are recorded by the orchestrator in the manifest.

## Implementation Strategy

Build one Node application with one MySQL database and the existing isolated provider adapters. Keep one canonical transaction-backed event stream, run leases/generation fencing and authenticated replay. Do not add a queue service, Redis, messenger, separate AI host, public registration or paid fallback. Requirements and architecture drive implementation; QA supplies evidence. Write meaningful tests at trust, transaction, provider and browser seams, not tests mirroring trivial CSS.

Sequence high-risk capability evidence first, then a small secure app foundation, approved presentation and settings, durable discussion, research, voice/attachments and record lifecycle. The final unit integrates verification and scoped release preparation. Unit owners below mean the later authorized implementation operator acting at the named layer; the product owner resolves material scope decisions and supplies representative-user observations. They do not imply separate staff, parallel agents or new services.

## Codebase Map

The implemented target is one Node application. `src/server/` contains HTTP, Google-session, private-MySQL, consultation ledger, provider, research, usage and export modules; `src/client/` contains browser, Markdown, refresh-state and glass behavior; `public/` contains the production presentation; `test/` and `scripts/browser-*.mjs` contain deterministic seams. Exact destinations for the combined work appear in U-09–U-15. Frozen A v8 remains unchanged; `prototype/` and `docs/design.md` remain rejected history. Existing U-03 promotion receipts under `forge/runs/U-03/` and `docs/source-provenance.json` preserve prior promotion history.

Implementation already exists in the authorized branch working tree. The units below now distinguish implemented code, supporting local observations, unrun formal QA and future operations. No framework, host, database, authentication or provider migration is part of this port.

## Shared visual and UX contract

Every user-visible unit U-02–U-15 inherits baseline `nanoduck-electric-a-v8-20260914`, target SHA-256 `93231814431a1bbbf8a0ba07f515eefcfd63193534189898b70766ed45938cbc`, source-tree SHA-256 `1de020dcfe48f3feb80db0e58ba911b821825b48730d32c72d9518ad512eb0d9` and the exact scope/permitted variance from the design brief. Scope: S-01–S-09, ST-01–ST-44; 320/390/430/768/1280/1440 CSS px; English/Ukrainian content. The unit trace narrows what is implemented there; the matrix below preserves every state. U-01 is backend/infrastructure evidence that enables these visible states.

Run `approved_visual_baseline_fidelity` (QA-R40–QA-R42 plus each affected QA-S check), `heuristic_usability_review` (QA-H01–QA-H10; all apply to relevant default/recovery paths), and `representative_user_task_validation` for affected tasks. QA-U01 is voice without accidental send; QA-U02 is locating a Critic objection/response/source; QA-U03 is changing future settings without altering the active run; QA-U04 is stop/recover/export/cancel deletion without loss. Use the actual success criteria and phone/desktop evidence requirements in QA, never an AI-generated participant. U-02 uses entry as the prerequisite to these tasks; U-03 integrates all four; U-04 U02/U04; U-05 U02; U-06 U01; U-07 U04; U-08 all four.

Replace fictional content, remove inspection/version scaffolding, wire real services and accommodate accessible focus/errors, content wrapping and browser rasterization. Preserve hierarchy, Electric tokens, corrected logo geometry, control visibility and navigation. The scoped override permits the desktop rail/mobile selector, semantic tables, expanded Usage and final clear-centre 24/17/15 glass behavior without changing frozen candidate bytes. Material divergence needs a design-owner revision. Browser automation, visual review, heuristic review and representative-owner evidence remain distinct.

## Implementation Units

U-01–U-08 are retained as the original approved implementation history. Their planning-time statements that tests were not run describe that earlier handoff. For the current combined port, U-09–U-17 and the Current implementation evidence section are authoritative. They supersede old implicit cross-Send context, per-specialist sequential-review assumptions, arbitrary action/word caps, future-only promotion language and any activation embedded in U-08; unchanged security, auth, voice, attachment, record and topology obligations remain in force.

### U-01 — Verify the runtime and preserved provider capabilities

**Owner/layer:** authorized implementation operator, infrastructure / integration. **Depends on:** None; first Phase 3 work.

**Source trace:** All JOB-001–JOB-006, UC-001–UC-007, J-01–J-07 indirectly; enables every runtime surface. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Work:** Use the 14 September content-free saved/effective settings read: Head/specialists Codex gpt-6-astra xhigh, Critic Codex gpt-6-astra xhigh and a legacy Balanced preset. Inactive Claude preferences remain unknown and must not be inferred. Preserve the recorded model/effort values; use replacement defaults of 2 specialists and 1 Critic ↔ specialist exchange. Never substitute, downgrade, buy credits or enable a paid fallback. Verify catalog/usage/renewal capabilities only for the selected route; do not probe unused Claude. Exercise a short allowed subscription call and restricted research capability after authorization. Verify standard and WebKit browser recognition constructors in Safari and Chrome and a real Ukrainian `uk-UA` result, with no NanoDuck audio endpoint or subscription transcription adapter. Inspect only the authorized Neo boundary: the Northflank Node/container and provider-subprocess runtime, Sandbox capacity and idle behavior, private-MySQL TLS and persistence, one-replica lifecycle, streaming, environment and protected logs, plus the dedicated Cloudflare Worker ingress. Keep automatic deployment and autoscaling disabled. Any activation must use stop-old → confirm zero containers → select the successful build → start one → verify `/healthz`, and must never interrupt an active consultation or reset data. Resolve upload/research limits, the owner-only JPEG/PNG/WebP byte/type policy, session concurrency/federated termination, separated key handling with exact existing 32-byte key encodings or the exact same-name `.env` envelope accepted by architecture, backup retention/RPO/RTO and operator procedures through architecture before dependent release tests. Use isolated fixtures and keep secrets/content out of Git.

**Acceptance:** A dated capability matrix identifies actual supported and unavailable tuples, formats and host mechanisms, with source/runtime evidence. Choose SSE or the already permitted incremental polling using measured host behavior. No missing voice or security capability is labelled optional. An incompatible essential capability returns to architecture/product ownership; it does not authorize another host/provider or weakened requirement.

**Verification:** QA-R20–QA-R24, QA-R28–QA-R32, QA-R38–QA-R39, QA-R43–QA-R44, QA-R49–QA-R50, QA-R52–QA-R53, QA-R56–QA-R58. Capability observations are prerequisites, not complete passes for these checks. Tests remain not_run. Evidence lives under `forge/runs/U-01/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** Browser recognition service or device incompatibility. Stop only the affected voice branch before release; typed input and other independent UI work remain available.

### U-02 — Build the private application and durable data foundation

**Owner/layer:** authorized implementation operator, full-stack. **Depends on:** U-01 identity, runtime, data and security decisions.

**Source trace:** JOB-003 → UC-001 → J-01 → S-01/ST-01–ST-04; also S-04/ST-25. Enables protected data for all other UCs. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Work:** Create one Node application and one MySQL schema for sessions, consent, preferences, conversations, runs, canonical messages, sources and owned attachment references. Implement shared owner authorization, typed envelopes, transaction helpers, authenticated encryption/key IDs, safe Markdown/URL handling, request-origin/CSRF/header policy and content-free protected operational events. Normalize MySQL JSON fields at the storage adapter so text, buffers and driver-decoded values produce the same validated settings, run snapshots and source arrays. Validate the Google callback and sole owner; implement concise first-use processing consent. Enforce the fixed 86400-second server deadline and persistent cookie through inactivity/browser reopening; sign-out/revocation/security invalidation end access earlier. Reauthenticate session-control actions; clear private client content even offline. Separate private data and keys from public build assets. Wire the approved entry/consent/denied/expired states through the presentation layer delivered by U-03.

**Acceptance:** Valid owner entry and consent reach private work; forged/replayed/non-owner entry and forged resource identifiers reveal nothing. Sessions work immediately before 24 hours and expire at the boundary; activity does not extend them. Parameterized writes and tamper-denying encryption underpin later transactions; database export without keys exposes no protected plaintext. Reopening a persisted record through the Northflank private-MySQL route succeeds when its MySQL JSON columns arrive decoded by the driver.

**Verification:** QA-R01–QA-R02, QA-R43–QA-R46, QA-R48, QA-R52–QA-R55, QA-R58–QA-R59; QA-S01/QA-S04; QA-H01–QA-H10; shared visual checks. U-08 completes integrated session/security evidence. Tests remain not_run. Evidence lives under `forge/runs/U-02/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** A mock login or browser-only owner check would bypass the actual trust boundary. Verify at authenticated and denied HTTP/storage seams.

### U-03 — Promote the approved presentation and connect Settings

**Owner/layer:** authorized implementation operator, full-stack. **Depends on:** U-01 catalog evidence and U-02 application/session foundation. Frozen presentation extraction can proceed while capability evidence is collected.

**Source trace:** All JOB-001–JOB-006 → UC-001–UC-007 → J-01–J-07 → S-01–S-09/ST-01–ST-44 for presentation; Settings primary trace JOB-003/JOB-005 → UC-005 → J-07 → S-04; navigation S-09. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Work:** Use the bounded path map below to retain the approved black Electric composition, corrected SVGs, Ember messages/tabs, Cobalt composer, mobile hamburger and floating desktop bar. Keep one Login/Logoff button directly on the desktop/mobile bar beside the mobile Menu trigger, outside the collapsed dropdown. Wire it to the existing session/auth routes, including authenticated consent-pending state, pending-action disabling, failure/retry feedback and clearing private page memory after logout. Verify QA-R01/QA-R33/QA-S01/QA-S09 for the changed states; preserve U-02 session enforcement. Keep New above the chat and in Conversations; preserve literal Settings, visible Send, a clear inline SVG microphone, and all owner labels as `You` with an `I` avatar on owner messages. Use distinct named role colours for Spiritual Consultant and Psychotherapist, without colour-only identity. Remove comparison/version/inspection scaffolding and fictional successful service behavior from production. Implement page-memory drafts, semantic focus/menu/dialog behavior, restricted DOM Markdown rendering for discussion/outcome content and English/Ukrainian fixtures. Support paragraphs, headings, lists, quotations, bold/italic emphasis, inline code and approved HTTPS links; raw HTML and unsafe/prohibited URLs stay inert or fail validation. Enter submits the chat composer; Shift+Enter adds a line break. During an active consultation render a text-labelled thought bubble and reachable Stop, not an in-progress title; write one concise history title only after the final synthesis. Connect actual provider/model/reasoning selectors, number-of-specialists (1/2/3/5/Auto), discussion-depth (1/3/5/Auto), and independent Knock/Chime/Ripple/Off message-sound preference with owner-activated Preview to U-01-supported catalog and encrypted preferences. Use the exact owner-accepted v5 CC0 table-ball triple-tap PCM WAV at `/sounds/table-taps-250ms-v5.wav` (250 ms onset-to-onset spacing; blended sharp/woody impacts; quiet 28 ms and 47 ms reflections ending within 92 ms; original recorded pitch) for both Preview and incoming alerts. Generate Chime/Ripple as local WAV media for the same HTML audio playback path. Serve the bundled asset as `audio/wav`, retain same-origin and `blob:` media in the restrictive policy, and retain visual feedback when audio is unavailable. Record the original source and editing details without labelling the retimed recording an unmodified original. Provide the full owner-visible runtime-instructions Markdown document from encrypted database storage through the one server runtime prompt-contract module. Bootstrap an empty database only through a one-time deployment-secret migration; do not read an instruction document from the repository. Validate model combinations and every required instruction heading/placeholder server-side; reject stale saves; retain encrypted saved-version metadata; require review before restore; create a fresh revision on restore; and make saves future-run-only. Explain that specialist count excludes Head and Critic. The current contract treats depth as 1/3/5 team-review rounds and Auto as Head-directed closure within ten team rounds; only affected specialists answer findings. Show real usage or unavailable information; separate app expiry, selected-provider reauthorization, quota and outage. Connect remaining controls as their owning runtime units arrive; no mock may be labelled functional.

**Acceptance:** Presentation matches exact A v8 within declared variance at every required surface/state. Saved valid settings, encrypted runtime-instructions document and encrypted version history survive reload while the active run retains its accepted tuple and document snapshot. Restore creates a fresh revision and never changes an accepted run. Unsupported choices never silently substitute. The product contains no inspection UI, connection checklist, palette-comparison controls or simulated provider success.

**Verification:** QA-R20, QA-R21, QA-R22, QA-R23, QA-R24, QA-R60, QA-R33, QA-R34, QA-R35, QA-R40, QA-R41, QA-R42; QA-R45–QA-R48, QA-R51, QA-R55; QA-S01–QA-S09; QA-H01–QA-H10; QA-U03. Tests remain not_run. Evidence lives under `forge/runs/U-03/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** Copying mock state machinery can create false success. Reimplement handlers; require runtime interface tests and the future promotion receipt.

### U-04 — Implement real discussion, control and recovery

**Owner/layer:** authorized implementation operator, full-stack. **Depends on:** U-01 provider evidence; U-02 authorized transactional store; U-03 shell/settings.

**Source trace:** JOB-001/JOB-002 → UC-002/UC-003 → J-02/J-03/J-05/J-06 → S-02/ST-05–ST-17 and S-07/ST-37–ST-38. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Reconciliation:** U-09/U-10 supersede this historical unit's implicit prior-discussion context, sequential all-specialist exchange topology, action-count cap and recovery assumptions. Retain the remaining role, policy, provider and cancellation history; current request/parallel behavior comes only from the current PRD and U-09/U-10.

**Work:** Accept message and run atomically with idempotency; lease work outside HTTP lifetime and commit each separate actual role message with its next step to the canonical stream. Retain exact run settings and runtime-instructions Markdown/revision snapshots. Every accepted question uses the selected specialist team and Critic; there is no direct Head-answer route. Keep Auto team selection as an internal Head routing invocation; then commit only concise Head → specialist tasks, independent specialist → Critic positions, the selected depth of Critic → specialist → Critic exchanges for every selected specialist, then each specialist → Head final position, Critic → Head assessment of those positions, and one final Head → owner Consolidated advice. Require pre-conclusion Head output to match a strict task-only wrapper that repeats a case anchor and a second owner-decision detail; retry malformed, owner-facing or generic prose once. If that retry fails, commit a concise context-bound task that quotes the stated decision rather than a static role template or preliminary Head opinion. Supply each specialist its exact assigned Head task explicitly and prohibit it from acting on other handoffs. Never route specialists to each other or render a preliminary Head opinion as advice. Render every behavioral role/output/research message contract from the one validated Markdown snapshot through the runtime prompt-contract module, while code—not editable text—enforces role topology, task-only validation/retry, output bounds, authorization and language/source rejection. Reconstruct every provider prompt with the owner question and prior confirmed discussion. Claude Critic stays text-only: give it no direct research, deny all known Claude Code tools at the command boundary, use a one-turn text-only prompt, and reject invocation/transcript output before it can commit. Allow exactly one text-only retry; a second trace follows recoverable failure with no trace persisted or rendered. On one language/source-policy rejection, withhold the entire draft and re-invoke that exact role/task once with a code-owned correction; the rejected material never becomes a message or source, and that first rejection cannot terminate the consultation. Migrate the current encrypted runtime-instructions document from `Direct Head Answer` to `Consultation Routing` on startup as a new reviewable encrypted revision; retain legacy versions and apply the routing constraint when one is restored or an accepted legacy snapshot resumes. Give each role a decision-specific message contract and a sentence-preserving maximum length; prompts must prohibit generic textbook exposition and unsupported invented figures, market claims, customer behavior and sources, and require an explicit missing condition where evidence is absent. Select only permitted roles: exclude Leadership Consultant and esoteric roles; apply the Spiritual Consultant doctrine and the Psychotherapist classical-school/IFS, non-clinical/emergency boundary. Preserve only English/Ukrainian messages and reject prohibited-language output before commit; valid Ukrainian shared words alone must not trigger rejection in input, either provider adapter or source metadata. Route material objections to a consultant for a real answer/revision; allow reasoned agreement and provisional outcomes. Preserve whole business messages, role/recipient/time, session language and owner follow-ups without routine protocol prose. Consume completed message items and the matching successful terminal event from the ephemeral provider connection; do not query saved history for an ephemeral thread. Retain early events, match thread and turn identity, ignore partial deltas, and release unresolved work on Stop, connection closure or the existing provider deadline. Classify an app-server JSON-RPC failure by a bounded recovery category, safe numeric code and request method; never persist or log its raw diagnostic text, prompt or authentication data. Preserve the owner question and show the matching recovery state rather than claiming a subscription failure without evidence. Implement authenticated replay via the U-01-selected transport, Stop generation fencing, Continue for stopped runs, Retry for failed runs and New with one-active-run enforcement. Preserve the accepted snapshot and compare the prior status/generation under the owner lock when retrying. Keep saved System recovery notices visible in history/export while excluding them from provider context and role-sequence reconstruction, so the missing contribution resumes without replay or early Head synthesis. Disable duplicate Retry activation and explain a refused recovery without discarding the record. Enforce selected specialist counts of 1/2/3/5 or the Head-chosen 1–5 Auto count, excluding Head and Critic. Enforce 1/3/5 complete Critic ↔ specialist exchanges per specialist. Auto collects closing positions and Critic assessment when all specialist replies report agreement, continuing if Critic objects while depth remains, and never exceeds 10 exchanges per specialist. At fixed depth or the Auto cap require closing contributions even when agreement is absent. Preserve per-pass closing agreement separately; unknown agreement cannot prove consensus. Preserve confirmed pairs on resume, ignore a legacy global agreement that lacks coverage, treat missing agreement metadata as unknown, and prevent Head synthesis while a specialist review is incomplete. Add the new closing sections through an additive, idempotent encrypted-document migration preserving owner edits and history. Disable research in the Head synthesis and prepend the literal Consolidated advice heading before persistence; filter Outcome to the current question's final Head message. Retain the 540000 ms provider budget and ten-minute continuation boundary. Surface actual stalls and categorized recoverable failures. Connect sources through U-05; persistent attachments through U-06.

**Acceptance:** Separate provider/context evidence proves every accepted question follows the selected-team discussion, including a simple question. Head gives no owner-facing content before an evidence-consistent final conclusion with enough practical actions to cover the request without truncation. A successful terminal provider event commits its matching completed output once; an early event or empty terminal item list cannot lose the answer, and a failed/cancelled/closed invocation cannot publish a partial answer. Crash-after-acceptance, duplicate retry, restart and Stop/late-result races produce exactly one confirmed visible step; a repeated provider call after an uncommitted result is recorded honestly. New cannot bypass one active run.

**Verification:** QA-R03, QA-R05, QA-R06, QA-R07, QA-R08, QA-R09, QA-R10, QA-R11, QA-R12, QA-R13, QA-R14, QA-R15, QA-R16, QA-R36, QA-R37, QA-R38, QA-R39, QA-R47, QA-R59; QA-R45–QA-R47, QA-R51, QA-R58–QA-R59; QA-S02/QA-S07; QA-H01–QA-H10; QA-U02/QA-U04. Tests remain not_run. Evidence lives under `forge/runs/U-04/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** Durability is the central failure seam. Exercise process termination and concurrent commands against real transactions before adding broad end-to-end polish.

### U-05 — Connect live research and inspectable sources

**Owner/layer:** authorized implementation operator, full-stack. **Depends on:** U-01 restricted research capability; U-02 authorization/storage; U-03 source presentation; U-04 coordinator.

**Source trace:** JOB-001/JOB-002 → UC-007 → J-04 → S-06/ST-34–ST-36; contributes to S-02/ST-15 and S-07/ST-38. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Work:** Trigger research from time-sensitive claims and material uncertainty without a keyword. Use only restricted Codex search; a tool-free Claude Critic requests evidence through the coordinator. Store actual title/direct URL, supported claim, retrieval/publication data and limitations with the conversation. Enforce English/Ukrainian source language and metadata; deny Russian/Belarusian language or terminology and `.ru`, `.by`, `.su` or Cyrillic-equivalent hosts. Validate schemes, network addresses and redirects; deny private/metadata targets. Treat retrieved text as untrusted, minimize queries and require specific permission for sensitive transfers. Render Sources/detail and source-unavailable states; retain qualified uncertainty when research fails or conflicts.

**Acceptance:** An actual current-topic consultation can trace a claim to fresh primary evidence. Conflicting/unavailable evidence never becomes a fabricated citation or fresh-check claim. Injected content cannot grant tools, exfiltrate private context, switch providers or initiate an external action.

**Verification:** QA-R17, QA-R18, QA-R19, QA-R49, QA-R51, QA-R54; QA-R46, QA-R49, QA-R51, QA-R53–QA-R54, QA-R59; QA-S06 plus QA-S02/QA-S07 recovery; QA-H01–QA-H10; QA-U02. Tests remain not_run. Evidence lives under `forge/runs/U-05/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** A successful public fetch does not prove SSRF or transfer isolation. Include redirects, private address targets and marked private fixtures at the actual egress seam.

### U-06 — Implement voice and safe attachments

**Owner/layer:** authorized implementation operator, full-stack. **Depends on:** U-01 browser/parser capability; U-02 protected storage; U-03 composer; U-04 accepted-input contract.

**Source trace:** JOB-006/JOB-001 → UC-006/UC-002 → J-02 → S-05/ST-26–ST-33 and S-02/ST-06–ST-07. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Work:** Implement Start-gated browser `SpeechRecognition`/`webkitSpeechRecognition`, explicit recognition-service disclosure, Stop-to-editable-text, Cancel-to-abort and background interruption. Use the browser language list to select Ukrainian `uk-UA` when available. Return editable text to the existing draft at a clear append boundary; no automatic Send. Distinguish permission, unavailable browser/service, language, network and interruption errors, preserving typing and explicit retry. Do not add `MediaRecorder`, audio blobs, a transcription endpoint, key or provider. Accept only owner-submitted JPEG/PNG/WebP images: enforce an 8 MiB streaming limit, ignore client MIME and validate the matching binary signature before encrypted opaque, non-executable storage. Do not parse, transform, thumbnail, server-render or scan the image. Reject PDF, SVG, video, audio, archives, mismatches and malformed/truncated content while retaining the typed draft. Owner-only retrieval uses the validated type, attachment disposition and `nosniff`.

**Acceptance:** On real Safari and Chrome devices, a spoken Ukrainian request becomes editable unsent text; Cancel/background/failure leaves no active hidden recognition and NanoDuck has received no audio. Valid JPEG/PNG/WebP images persist only as protected opaque records; all invalid type/signature/size cases fail without losing the typed draft. Typing fallback remains usable but cannot waive required voice acceptance.

**Verification:** QA-R04, QA-R28, QA-R29, QA-R30, QA-R31, QA-R32, QA-R50, QA-R55; QA-R40–QA-R42, QA-R45–QA-R47, QA-R50, QA-R53–QA-R55, QA-R59; QA-S05 and QA-S02; QA-H01–QA-H10; QA-U01. Tests remain not_run. Evidence lives under `forge/runs/U-06/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** Browser recognition success does not prove mobile service availability or disclosure/privacy handling. The single-owner self-generated-image statement is not technical provenance proof. Exercise the full Start-to-editable-text seam, inspect Stop/Cancel/background behavior, and prove that the image boundary rejects every non-allowed/malformed/oversized fixture without parser or scanner execution.

### U-07 — Finish record ownership, export, deletion and restore

**Owner/layer:** authorized implementation operator, full-stack / operations. **Depends on:** U-02 data foundation; U-03 history UI; U-04 canonical records; U-05 sources; U-06 attachments.

**Source trace:** JOB-004/JOB-001 → UC-004/UC-002 → J-06 → S-03/ST-18–ST-20, S-06, S-07 and S-08/ST-39–ST-42. Exact clause allocation appears below; architecture's corresponding boundary controls the mechanism.

**Work:** Reopen complete confirmed records, sources and owned attachments across browser sessions. Make each accessible saved-conversation summary row open the record directly; retain Export and Delete as separate controls, with multi-select deletion as its own explicit action. Preserve same-tab browser refresh context using short-lived tab storage only: selected app surface, Discussion tab, open-record ID and reading position. Reload the protected record before returning to the position, keep the browser URL free of record data, store no draft or conversation content, and clear the state at Logoff. Correction R-15: make Export download a readable RTF through the existing authenticated endpoint. Add the small server renderer using the current restricted Markdown parser; escape all data as RTF text, preserve Unicode, bold roles/recipients, explicit browser-zone timestamps, paragraphs, emphasis, lists, headings, sources and image references. Keep image binaries separate and omit draft/credentials/runtime snapshots. Retain the existing action with a format tooltip; no extra service, package or format setting. Verify QA-R26/QA-R46/QA-S08 at the API, real browser download and native-reader seams. Confirm deletion of only the selected conversation and its owned content; cancellation is inert. Persist deletion decisions so isolated restores cannot resurrect deleted records. Implement encrypted backup/restore with separated keys and the U-01-reviewed retention/recovery objectives. Preserve indefinite accepted history until explicit deletion; report backup propagation truthfully. Fail closed on unavailable storage/export, retaining recoverable confirmed work.

**Acceptance:** Complete reopen/export matches canonical content. Guessed IDs cannot access private records. Cancel does nothing; confirmed delete changes only that record. Isolated restore recovers accepted history, respects deletion decisions and never accesses another app database.

**Verification:** QA-R25, QA-R26, QA-R27, QA-R56; QA-R45–QA-R46, QA-R52–QA-R56, QA-R59; QA-S03/QA-S06/QA-S07/QA-S08; QA-H01–QA-H10; QA-U04. Tests remain not_run. Evidence lives under `forge/runs/U-07/{run_id}/` and records actual revision, sources, executor, time and scope.

**Risk/stop condition:** Deletion-aware recovery must be proved with marked isolated records and keys before any target reset; do not treat a database dump as a tested restore.

### U-08 — Verify the integrated app and prepare the scoped release

**Owner/layer:** authorized implementation operator, integration. **Depends on:** U-01–U-07. **Status:** preserved historical unit; its prior activation step is superseded by U-17.

**Source trace:** All JOB-001–JOB-006, UC-001–UC-007, J-01–J-07 and S-01–S-09/ST-01–ST-44. The unit established the one-service/private-MySQL/Google/Worker boundary, production image checks and integrated evidence shape used by the later port.

**Current consequence:** Keep its authentication, private data, provider, rollback and one-replica constraints. Repository verification now finishes through U-16; activation and hosted checks occur only in U-17. Historical evidence remains readable but cannot pass current combined-update checks or release readiness.

### U-09 — Bind each accepted request and make private-MySQL recovery durable

**Owner/layer:** backend/full-stack. **Depends on:** U-02, U-04 and the U-08 Neo base. **Status:** implemented in the authorized working tree; formal QA remains not_run.

**Source trace:** FR-02.1, FR-02.12, FR-03.3, FR-03.5; NFR-01.1, NFR-01.2, NFR-11.2, NFR-14.1; UC-002, UC-003; J-02, J-03, J-05; S-02/ST-06, ST-09, ST-11, ST-13, ST-14, ST-15, ST-16. QA-R03, QA-R13, QA-R15, QA-R36, QA-R37, QA-R47, QA-R54, QA-R61; `product_functional_requirements`, `lifecycle_and_continuity`, `product_security_requirements`.

**Destinations and contract:** `src/server/index.mjs`, `src/server/validation.mjs`, `src/server/store.mjs`, `src/server/schema.sql`, `src/server/run-snapshot.mjs`, `src/server/provider-context.mjs`, `src/server/local-state.mjs`, `src/server/consultation.mjs` and `src/client/app.js`. A fresh Send creates one immutable `requestMessageId`, one accepted settings/instruction snapshot, one request ledger and one request-scoped provider workspace. Replay returns the original body/attachments/run; forged, cross-chat or rebound IDs fail. Continue/Retry reuse only that ledger, completed commits and generation. Release provider workspaces after all children drain. Complete over-limit context fails visibly without truncation.

**Acceptance/verification:** exercise two marked Sends in one chat, ambiguous replay, Stop/restart/Continue/Retry, stale commits, legacy records, transaction rollback and recovery. Use `test/core.test.mjs`, `test/context-economy.test.mjs`, `test/parallel-consultation.test.mjs`, `test/neo-backend-port.test.mjs`, `test/mysql.integration.test.mjs` and `scripts/browser-send-retry.mjs`. Exact-revision GitHub Actions run `36282318357` passed all four authored real-MySQL cases against disposable MySQL 8.4, closing that CI integration seam. The existing private Northflank MySQL TLS connection, backup/restore and hosted continuity remain unverified.

### U-10 — Execute Head-authored parallel work and Critic fulfillment

**Owner/layer:** backend/integration. **Depends on:** U-09 and preserved provider/settings boundaries. **Status:** implemented in the authorized working tree; no live-provider execution was run.

**Source trace:** FR-02.3, FR-02.4, FR-02.5, FR-02.6, FR-02.7, FR-02.9, FR-02.10, FR-02.11, FR-02.13, FR-02.14, FR-03.5, FR-05.3; NFR-01.2, NFR-01.3, NFR-11.2, NFR-16.2; UC-002, UC-003; J-03, J-05; S-02/ST-09, ST-10, ST-13, ST-14, ST-15, ST-16, ST-17 and S-07/ST-37, ST-38. QA-R05, QA-R06, QA-R07, QA-R08, QA-R09, QA-R15, QA-R22, QA-R37, QA-R38, QA-R47, QA-R59, QA-R62.

**Destinations and contract:** `src/server/consultation-parallel.mjs`, `src/server/parallel-contract.mjs`, `src/server/consultation.mjs`, `src/server/store.mjs`, `src/server/providers.mjs`, `src/server/prompt-contracts.mjs` and `src/server/recovery.mjs`. Head may reuse, adapt or create request-local roles without new authority; it authors exact tasks and acyclic dependencies. Start every ready independent assignment, commit results transactionally as they arrive and retain successful siblings on failure. Persist each Critic order, response and assessment; a reply is not fulfillment. Only `resolved_corrected` or `resolved_objection_upheld` closes an order. Fixed depth counts team assessments; Auto closes by supported Head decision within ten. Unresolved work reaches provisional advice.

**Acceptance/verification:** use `test/parallel-consultation.test.mjs`, `test/review-fixes.test.mjs`, `test/consolidation.test.mjs`, `test/consultation.test.mjs`, `test/claude-provider.test.mjs` and `test/neo-backend-port.test.mjs`. Cover fast dependency/slow sibling, failure drain, Retry, linked findings, forged transitions, correction-before-assessment restart, fixed/Auto bounds and Stop fencing. The local receipt supports deterministic fixtures only; live Codex/Claude concurrency, quality and provider cache behavior remain unproven.

### U-11 — Scope research and durable evidence to one request

**Owner/layer:** backend/full-stack. **Depends on:** U-09 and U-10. **Status:** implemented locally; no live public search was run.

**Source trace:** FR-04.1, FR-04.2, FR-04.3; NFR-12.1, NFR-12.3, NFR-14.1, NFR-16.1, NFR-16.2; UC-002, UC-007; J-03, J-04; S-02/ST-15, S-06/ST-34, ST-35, ST-36 and S-07/ST-38. QA-R17, QA-R18, QA-R19, QA-R49, QA-R51, QA-R54, QA-R58, QA-R59, QA-R63.

**Destinations and contract:** `src/server/research-evidence.mjs`, `src/server/consultation-parallel.mjs`, `src/server/store.mjs`, `src/server/recovery.mjs`, `src/server/codex-provider.mjs` and `src/server/claude-provider.mjs`. Persist the sanitized query plan before execution; route evidence by assignment; identify each distinct URL-plus-claim with a stable current-request `S-*` reference; resolve prose and structured values before storage/export. One bounded repair may replace an unknown/foreign reference. Explicit reuse performs no search; `fresh:true` does. A cancelled attempt retries the saved plan. Diagnostics exclude raw query, private text and fingerprints.

**Acceptance/verification:** use `test/research-evidence.test.mjs`, `test/source-persistence.test.mjs`, research cases in `test/review-fixes.test.mjs`/provider suites, real-MySQL cases in `test/mysql.integration.test.mjs`, `scripts/browser-progress-recovery.mjs` and `scripts/measure-consultation-workload.mjs`. The recorded 97,835-byte synthetic case and one repeated-gap search support bounded reuse; the named CI MySQL run supports disposable persistence/reconnect coverage. Freshness, public-source entailment, live web access and hosted private-MySQL restart remain open seams.

### U-12 — Reconcile provider usage, account allowance and activity

**Owner/layer:** backend/full-stack. **Depends on:** U-09–U-11 and preserved provider tuples. **Status:** implemented locally; no live account/provider probe was run.

**Source trace:** FR-02.15, FR-05.4; NFR-11.2, NFR-14.1, NFR-14.2, NFR-16.1, NFR-16.2; UC-002, UC-005; J-03, J-07; S-02/ST-09, ST-10, ST-13–ST-17 and S-04/ST-21–ST-25. QA-R23, QA-R47, QA-R54, QA-R55, QA-R58, QA-R59, QA-R64.

**Destinations and contract:** `src/server/usage.mjs`, `src/server/account-usage.mjs`, `src/server/codex-provider.mjs`, `src/server/claude-provider.mjs`, `src/server/consultation.mjs`, `src/server/store.mjs`, `src/server/schema.sql`, `src/server/index.mjs` and `src/client/app.js`. Deduplicate Codex raw responses and reconcile them with cumulative totals without addition; count Claude ordinary/cache-read/cache-create input once. Persist missing versus zero, `usageSource`, `usageCoverage`, `responseCount`, `promptBytes`, `prefixBytes`, selected effort and immutable request/participant/purpose/stage attribution. Repeat work is a union. Account allowance is an independent authenticated content-free read; stale/delayed data cannot repaint after privacy-generation or scope changes.

**Acceptance/verification:** use `test/usage.test.mjs`, `test/account-usage.test.mjs`, `test/codex-provider.test.mjs`, `test/claude-provider.test.mjs`, `test/neo-backend-port.test.mjs`, `test/mysql.integration.test.mjs`, `scripts/browser-usage.mjs`, `scripts/browser-progress-recovery.mjs` and `scripts/browser-check.mjs`. Deterministic/browser suites and the named disposable CI MySQL run support normalization, delayed-update, persistence and layout paths at their recorded seams. Live account limits, provider totals, hosted private-MySQL persistence, native Safari and assistive technology remain unverified.

### U-13 — Render semantic Markdown tables and export native RTF tables

**Owner/layer:** full-stack. **Depends on:** U-03 and U-07. **Status:** implemented locally; GUI-reader evidence remains open.

**Source trace:** FR-03.1, FR-06.2; NFR-02.1, NFR-02.2, NFR-11.1, NFR-14.1; UC-002, UC-004; J-03, J-06; S-02/ST-10, ST-17, S-07/ST-37, ST-38 and S-08/ST-41. QA-R11, QA-R26, QA-R40, QA-R41, QA-R46, QA-R54, QA-R65.

**Destinations and contract:** `src/client/markdown.js`, `src/client/app.js`, `public/styles.css` and `src/server/conversation-export.mjs`. Use one restricted parsed structure for semantic browser tables and bounded native RTF rows/cells. Preserve scoped headers, labelled keyboard-focusable horizontal scrolling, safe links, Unicode and RTF escaping; malformed/provider HTML stays inert and no executable field/object enters the export.

**Acceptance/verification:** use `test/markdown.test.mjs`, `test/markdown-table-export.test.mjs`, `test/conversation-export.test.mjs`, export cases in `test/http.test.mjs` and `scripts/browser-markdown-tables.mjs`. Chromium/Firefox/WebKit and macOS `textutil` supporting evidence is recorded. `textutil` is not Word, LibreOffice or another GUI reader; native Safari, screen reader, horizontal keyboard traversal and 200% text remain formal evidence gaps.

### U-14 — Implement the four-view reading workspace and safe active controls

**Owner/layer:** frontend/full-stack. **Depends on:** U-09, U-12 and U-13. **Status:** implemented locally; representative-owner and native-device checks remain open.

**Source trace:** FR-03.4, FR-03.5, FR-06.1, FR-08.1; NFR-01.1, NFR-01.2, NFR-02.1, NFR-02.2, NFR-11.2, NFR-14.2; UC-002, UC-003, UC-004, UC-005; J-03, J-05, J-06, J-07; S-02/ST-05–ST-17, S-03/ST-18–ST-20, S-04/ST-21–ST-25, S-06/ST-34–ST-36, S-07/ST-37–ST-38 and S-09/ST-43, ST-44. QA-R14, QA-R15, QA-R25, QA-R33, QA-R36, QA-R37, QA-R40, QA-R41, QA-R47, QA-R55, QA-R66; QA-S02, QA-S03, QA-S04, QA-S06, QA-S07, QA-S09; QA-U02, QA-U04.

**Destinations and contract:** `src/client/app.js`, `src/client/refresh-state.js`, `public/index.html` and `public/styles.css`. Desktop uses a sticky vertical Discussion/Outcome/Sources/Usage rail; narrow view uses one accessible sticky selector. Current-panel top/bottom arrows hide at boundaries and never switch panels. Composer collapse/restore keeps draft, attachments, voice state and focus in page memory. Active Stop stays reachable across panels; polling cannot hide it, force scroll, reopen input or admit late results. Refresh stores only allowed surface/panel/record/position identifiers and Logoff clears them.

**Acceptance/verification:** use `test/refresh-state.test.mjs`, `scripts/browser-reading-mode.mjs`, `scripts/browser-active-discussion.mjs`, `scripts/browser-progress-recovery.mjs` and `scripts/browser-send-retry.mjs`. Recorded three-engine evidence supports reading, Stop/Continue, retry and 320px paths. Attachment/voice preservation across every hide/expand route, exact restored scroll, offline restart, touch, native Safari, 200% text, assistive technology and owner-task evidence remain open.

### U-15 — Apply the final scoped liquid-glass override

**Owner/layer:** frontend with privacy review. **Depends on:** U-03 and U-14. **Status:** implemented locally; formal fidelity/human evidence remains not_run.

**Source trace:** FR-08.3; NFR-02.1, NFR-02.2, NFR-02.3, NFR-11.1, NFR-14.2, NFR-15.1, NFR-16.2; UC-001–UC-005; Discussion S-02, Conversations S-03, Settings S-04 and global S-01/S-09 states. QA-R35, QA-R40, QA-R41, QA-R42, QA-R46, QA-R55, QA-R57, QA-R59, QA-R67; `approved_visual_baseline_fidelity`.

**Destinations and contract:** `src/client/navbar-glass.js`, `src/client/app.js`, `public/styles.css`, `src/client/navbar-glass.LICENSE.txt` and `THIRD_PARTY_NOTICES.md`. Sample a 24px bleed and displace only an edge band up to 17px by up to 15px; keep the centre clear and native controls undistorted above an `aria-hidden` lens. Let page content reach beneath both curved ends. Coalesce ordinary refresh while retaining the prior frame; synchronously clear on logout, lock, auth loss, hidden/disallowed state or failure. Refresh on window/nested scroll, mutation, resize, bar resize, font readiness and visibility. Never read private field values or persist/transmit pixels. Provide readable reduced-transparency and forced-colour fallbacks.

**Acceptance/verification:** use `scripts/browser-navbar-glass.mjs` and the real-page glass/privacy checks in `scripts/browser-check.mjs`. Current local automation asserts the named 24/17/15 constants, measures painted edge depth at no more than 17px, checks the reduced-transparency CSS rule, emulates forced colours, varies native-control values without changing sampled pixels, and covers hidden/visible clearing, render failure, nested scrolling, mutation replacement without a blank frame, clear-centre behavior and private-value isolation. The receipt reports three-engine observations and scoped MIT attribution. Actual reduced-transparency media emulation, measured displacement at no more than 15px, font-ready and bar `ResizeObserver` trigger-specific assertions, retained and hashed screenshots, native Safari/physical-device coverage and human visual/accessibility review remain open before fidelity can pass.

### U-16 — Finalize the exact Neo target revision

**Owner/layer:** repository integrator. **Depends on:** U-09–U-15 and the reconciled SDD chain. **Status:** in progress; QA-R68 remains prepared/not_run until the exact final staged revision is inspected.

**Source trace:** NFR-15.1; UC-001, UC-002, UC-004; QA-R68; `target_repository_integrity`.

**Work/acceptance:** inspect only the canonical Neo repository, remote, branch, final diff and staged set. Exclude nested reference-checkout content, input absolute paths, secrets, grants, private records, owner identifiers and infrastructure replacement. Verify exact dependency/artifact/diff checks and the scoped glass notices without relicensing unrelated code. Bind the final commit/tree, receipts and current SDD hashes, then commit and push the authorized target branch. A clean deterministic suite or pushed commit is repository evidence, not deployment evidence.

### U-17 — Activate the approved revision only in a safe window

**Owner/layer:** authorized Neo operator, infrastructure. **Depends on:** U-16, separately granted activation authority and zero active or recoverable consultations. **Status:** prepared/not_run; excluded from the current repository-only execution receipt.

**Source trace:** NFR-15.1; UC-001, UC-002, UC-004; QA-R69; `runtime_activation`.

**Work/acceptance:** verify a current private-MySQL backup or provider snapshot; scale the existing Northflank application service to zero; confirm zero containers; select the approved build while scale remains zero; start exactly one instance so `src/server/start.mjs` runs repeat-safe schema/instruction migrations against the preserved private TLS MySQL before HTTP startup; verify `/healthz`, database connectivity, Worker origin-key denial/direct access, Google owner authentication, selected settings/provider continuity, saved conversations and rollback. Do not replace the database, auth, provider grants or `nanoduck-neo` Worker, and do not touch predecessor resources. Any active consultation, ambiguous resource, failed migration/health/continuity check or missing rollback blocks activation.

## Current implementation evidence

The supplied `forge/runs/combined-updates-port-20260927/verification.json` binds aggregate local and named-CI observations to exact implementation/test revision `7b3b4545e2b8c18f488ac667973a0c3ddf661ff3`. GitHub Actions run `36282318357`, checks job `108516389873`, passed `npm run check` with 224 total / 224 passed / 0 failed / 0 skipped against disposable MySQL 8.4, including all four authored real-MySQL cases. Container job `108516389813` passed the root-image build and non-root runtime/tooling checks. All table, glass and integrated-app browser suites passed in Chromium, Firefox and Playwright WebKit; the production dependency audit reported zero vulnerabilities; artifact, diff and exact-commit path/secret checks passed; the shared-evidence synthetic case recorded 97,835 prompt bytes and the repeated-gap case recorded one research call plus one query-planning call; macOS `textutil` converted the synthetic native-table RTF; and scoped glass attribution was present.

The receipt names the local and CI executors/environments and retains hashes for exact-revision evidence, but it has no per-QA result records; it remains supporting evidence rather than a formal pass for QA-R61–QA-R69 or any whole gate. WebKit is not native Safari; disposable CI MySQL is not the existing private Northflank database; the container job is not a hosted start; and `textutil` is not a GUI reader. No live provider/account/public-search probe, representative-owner/H1–H10/assistive-technology session, private Northflank MySQL TLS/backup-restore check, Northflank/Cloudflare deployment, scale action, restart, secret change or consultation interruption occurred. Formal release readiness remains `not_evaluated`.

## Dependency Order

Preserved base: U-01 → U-02 → U-03 → U-04 → U-05/U-06 → U-07 → U-08. Combined port: U-08 → U-09 → U-10 → U-11 → U-12; U-13 depends on U-03/U-07 and may proceed beside U-09–U-12; U-14 depends on U-09/U-12/U-13; U-15 depends on U-03/U-14; U-16 waits for U-09–U-15 and final SDD reconciliation. U-17 is a separate operational successor to U-16 and never runs from repository completion alone.

A unit's implemented code and its evidence status are separate. Open real-MySQL/provider/browser/human/hosted seams block only the corresponding claims, while an active consultation blocks all activation. No calendar duration is invented.

## Cross-layer interfaces

These are the actual Neo seams. Producers own compatibility; consumers reject missing/forged immutable fields rather than substituting or truncating them.

| Interface / producer → consumer | Contract and compatibility | Integration evidence |
|---|---|---|
| C-01 owner session, U-02 → all private units | Google owner principal, consent, absolute expiry/revocation, CSRF and owner-only resources; provider grants never enter browser state. | QA-R01, QA-R02, QA-R43–QA-R45, QA-R48, QA-R55. |
| C-02 settings/instructions, U-03 → U-09/U-10/U-12 | Exact provider/model/effort, team/depth, sound and four validated guidance snapshots; future saves never rewrite an accepted request. | QA-R20–QA-R24, QA-R60, QA-U03. |
| C-03 accepted request, U-09 → U-10/U-11/U-12/U-14 | `requestMessageId`, exact owner message/attachments, accepted snapshot, generation and provider-workspace scope; fresh Send isolates, Continue/Retry reuses. | QA-R03, QA-R13, QA-R15, QA-R36, QA-R37, QA-R61. |
| C-04 parallel ledger, U-10 → U-09/U-11/U-12/client | Head roles/tasks/dependencies, assignment/result IDs, linked Critic order/response/assessment, revision and canonical messages committed transactionally. | QA-R05–QA-R09, QA-R22, QA-R38, QA-R62. |
| C-05 evidence table, U-11 → U-10/U-13/client | Request-local URL-plus-claim rows, stable `S-*` references, routing, reuse/fresh state and explicit gaps; unknown/foreign IDs cannot persist. | QA-R17–QA-R19, QA-R49, QA-R51, QA-R54, QA-R63. |
| C-06 usage/allowance, U-12 → client | Content-free attributable attempts, raw/cumulative reconciliation, missing/zero coverage, activity and independent account windows; privacy generation fences delayed reads. | QA-R23, QA-R47, QA-R54, QA-R55, QA-R58, QA-R59, QA-R64. |
| C-07 safe structured content, U-13 → U-14/U-07 | One restricted parsed Markdown structure becomes semantic DOM tables and escaped native RTF rows/cells. | QA-R11, QA-R26, QA-R46, QA-R65. |
| C-08 reading state, U-14 → client/storage | Selected panel and position identifiers only; page-memory draft/attachment/voice/focus; current-panel arrows and active Stop. | QA-R14, QA-R25, QA-R33, QA-R66, QA-S02–QA-S09. |
| C-09 glass lifecycle, U-15 → global pages | Permitted visible surface pixels only, 24/17/15 edge geometry, prior-frame replacement, synchronous privacy clear and non-optical fallbacks. | QA-R35, QA-R40–QA-R42, QA-R55, QA-R67. |
| C-10 safe inputs, U-06 → U-09/U-14/U-07 | Owned bounded image references and editable unsent browser transcript; no NanoDuck audio. | QA-R04, QA-R28–QA-R32, QA-R50, QA-R55, QA-U01. |
| C-11 records/restore, U-07 → U-13/U-14/U-17 | Complete confirmed record, sources/attachments, deletion tombstone, safe export and isolated restore. | QA-R25–QA-R27, QA-R52, QA-R56, QA-U04. |
| C-12 repository/activation, U-16 → U-17 | Exact approved commit/image/config/schema/instruction migration, preserved Northflank/private-MySQL/Google/Worker identity and rollback. | QA-R57, QA-R68, QA-R69; `target_repository_integrity`, `runtime_activation`. |

## Clause coverage

Every current PRD clause maps to implementation unit(s) and exact QA definitions. Shared security/privacy clauses intentionally span the units that enforce them. This table records work allocation, not an executed result. AC-001–AC-010 resolve through their PRD clause memberships.

| PRD clause | Implementation unit(s) | Exact canonical QA IDs |
|---|---|---|
| FR-01.1 | U-02 | QA-R01 |
| FR-01.2 | U-02 | QA-R02 |
| FR-02.1 | U-09 | QA-R03, QA-R61 |
| FR-02.2 | U-06 | QA-R04 |
| FR-02.3 | U-10 | QA-R05, QA-R62 |
| FR-02.4 | U-10 | QA-R06, QA-R62 |
| FR-02.5 | U-10 | QA-R07, QA-R62 |
| FR-02.6 | U-10 | QA-R08, QA-R62 |
| FR-02.7 | U-10 | QA-R09, QA-R62 |
| FR-02.8 | U-04 | QA-R10 |
| FR-02.9 | U-10 | QA-R62 |
| FR-02.10 | U-10 | QA-R62 |
| FR-02.11 | U-10 | QA-R62 |
| FR-02.12 | U-09 | QA-R61 |
| FR-02.13 | U-10 | QA-R62 |
| FR-02.14 | U-10 | QA-R62 |
| FR-02.15 | U-12 | QA-R64 |
| FR-03.1 | U-13 | QA-R11, QA-R65 |
| FR-03.2 | U-04 | QA-R12 |
| FR-03.3 | U-09 | QA-R13, QA-R61 |
| FR-03.4 | U-14 | QA-R14, QA-R66 |
| FR-03.5 | U-09/U-10 | QA-R15, QA-R61, QA-R62, QA-R66 |
| FR-03.6 | U-04 | QA-R16 |
| FR-04.1 | U-11 | QA-R17, QA-R63 |
| FR-04.2 | U-11 | QA-R18, QA-R63 |
| FR-04.3 | U-11 | QA-R19, QA-R63 |
| FR-05.1 | U-03 | QA-R20 |
| FR-05.2 | U-03 | QA-R21 |
| FR-05.3 | U-03/U-10 | QA-R22, QA-R62 |
| FR-05.4 | U-12 | QA-R23, QA-R64 |
| FR-05.5 | U-03 | QA-R24 |
| FR-05.6 | U-03 | QA-R60 |
| FR-06.1 | U-07/U-14 | QA-R25, QA-R66 |
| FR-06.2 | U-13 | QA-R26, QA-R65 |
| FR-06.3 | U-07 | QA-R27 |
| FR-07.1 | U-06 | QA-R28 |
| FR-07.2 | U-06 | QA-R29 |
| FR-07.3 | U-06 | QA-R30 |
| FR-07.4 | U-06 | QA-R31 |
| FR-07.5 | U-06 | QA-R32 |
| FR-08.1 | U-14 | QA-R33, QA-R66 |
| FR-08.2 | U-03 | QA-R34 |
| FR-08.3 | U-15 | QA-R35, QA-R67 |
| NFR-01.1 | U-09/U-14 | QA-R36, QA-R61, QA-R66 |
| NFR-01.2 | U-09/U-10 | QA-R37, QA-R61, QA-R62 |
| NFR-01.3 | U-10 | QA-R38, QA-R62 |
| NFR-01.4 | U-04 | QA-R39 |
| NFR-02.1 | U-13/U-14/U-15 | QA-R40, QA-R65, QA-R66, QA-R67 |
| NFR-02.2 | U-13/U-14/U-15 | QA-R41, QA-R65, QA-R66, QA-R67 |
| NFR-02.3 | U-08/U-15 | QA-R42, QA-R67 |
| NFR-10.1 | U-02 | QA-R43 |
| NFR-10.2 | U-02 | QA-R44 |
| NFR-10.3 | U-02 | QA-R45 |
| NFR-11.1 | U-02/U-13/U-15 | QA-R46, QA-R65, QA-R67 |
| NFR-11.2 | U-09/U-10/U-12/U-14 | QA-R47, QA-R61, QA-R62, QA-R64, QA-R66 |
| NFR-11.3 | U-02 | QA-R48 |
| NFR-12.1 | U-11 | QA-R49, QA-R63 |
| NFR-12.2 | U-06 | QA-R50 |
| NFR-12.3 | U-10/U-11 | QA-R51, QA-R63 |
| NFR-13.1 | U-02 | QA-R52 |
| NFR-13.2 | U-02/U-17 | QA-R53 |
| NFR-14.1 | U-09/U-11/U-12/U-13 | QA-R54, QA-R61, QA-R63, QA-R64, QA-R65 |
| NFR-14.2 | U-06/U-12/U-14/U-15 | QA-R55, QA-R64, QA-R66, QA-R67 |
| NFR-14.3 | U-07 | QA-R56 |
| NFR-15.1 | U-08/U-16/U-17 | QA-R57, QA-R68, QA-R69 |
| NFR-16.1 | U-02/U-11/U-12 | QA-R58, QA-R63, QA-R64 |
| NFR-16.2 | U-09/U-10/U-11/U-12/U-15 | QA-R59, QA-R62, QA-R63, QA-R64, QA-R67 |

## Surface and state coverage

Every canonical S-/ST state remains mapped. U-03 supplies the approved shell; listed runtime units own current behavior; U-16 verifies the exact repository result and U-17 verifies only hosted continuity.

| Surface | State IDs | Runtime unit(s) | QA / journey / use case |
|---|---|---|---|
| S-01 | ST-01, ST-02, ST-03, ST-04 | U-02, U-15 | QA-S01; J-01; UC-001 |
| S-02 | ST-05, ST-06, ST-07, ST-08, ST-09, ST-10, ST-11, ST-12, ST-13, ST-14, ST-15, ST-16, ST-17 | U-09, U-10, U-11, U-12, U-13, U-14, U-15 | QA-S02; J-02, J-03, J-05; UC-002, UC-003 |
| S-03 | ST-18, ST-19, ST-20 | U-07, U-14, U-15 | QA-S03; J-06; UC-004 |
| S-04 | ST-21, ST-22, ST-23, ST-24, ST-25 | U-02, U-03, U-12, U-14, U-15 | QA-S04; J-07; UC-005 |
| S-05 | ST-26, ST-27, ST-28, ST-29, ST-30, ST-31, ST-32, ST-33 | U-06 | QA-S05; J-02; UC-006 |
| S-06 | ST-34, ST-35, ST-36 | U-11, U-14 | QA-S06; J-04, J-06; UC-007, UC-004 |
| S-07 | ST-37, ST-38 | U-10, U-13, U-14 | QA-S07; J-03, J-06; UC-002, UC-004 |
| S-08 | ST-39, ST-40, ST-41, ST-42 | U-07, U-13 | QA-S08; J-06; UC-004 |
| S-09 | ST-43, ST-44 | U-03, U-14, U-15 | QA-S09; J-01, J-05, J-07; UC-001, UC-003, UC-005 |

## Prototype Promotion Plan

Only U-03 reuses presentation files from candidate `a`, `v8`, root `forge/design/candidates/a/v8`, tree `1de020dcfe48f3feb80db0e58ba911b821825b48730d32c72d9518ad512eb0d9`, algorithm `sdd-tree-sha256-v1`, no external render dependencies. Baseline and target hash are the Shared visual contract above. Production base commit: `f99744d603b4e27cb7e89eccde2f12b9652e8a01`; this full commit precedes the documentation-only approval/plan commit. The Phase 3 runner must preserve and verify ancestry, frozen bytes and empty destinations before promotion. A changed destination/base requires a source-bound plan amendment, not fabricated history.

| Frozen source path | Production destination | Strategy |
|---|---|---|
| forge/design/candidates/a/v8/index.html | public/index.html | adapt |
| forge/design/candidates/a/v8/styles.css | public/styles.css | adapt |
| forge/design/candidates/a/v8/app.js | src/client/app.js | reimplement |
| forge/design/candidates/a/v8/nanoduck.svg | public/nanoduck.svg | copy |
| forge/design/candidates/a/v8/nanoduck-original.svg | public/nanoduck-original.svg | copy |

Adapt only within the visual variance above: remove candidate/inspection/version code and fictional data; wire real modules and state semantics; preserve approved CSS/geometry/tokens and exact copied SVG bytes. Reimplement the mock handlers with real authorization-aware endpoints and a durable stream consumer. No other prototype path is authorized for promotion by this map. Missing capabilities are all U-02–U-07 backend, consent/session, persistence, encryption/authorization, actual agents/research, voice/upload processing, real catalog/usage and export/deletion/restore behavior. The prototype supplies none of those capabilities.

Existing U-03 receipts under `forge/runs/U-03/*/prototype-promotion.json` preserve the historical promotion record. Any future baseline promotion would require a new receipt at `forge/runs/U-03/{run_id}/prototype-promotion.json`. Only the separately authorized Phase 3 runner derives the actual Git diff and receipt, with all five expanded mappings and source/destination hashes, base/head commits, changed paths, patch hash, adaptation/variance list, baseline/plan hash, actual QA IDs, visual evidence and verification status. Required QA: QA-R33–QA-R35, QA-R40–QA-R42, QA-S01–QA-S09, QA-H01–QA-H10 and affected QA-U01–QA-U04. The combined update does not alter frozen candidate bytes or claim a new candidate promotion. Its reading and liquid-glass changes are the approved production override and are verified through U-13–U-15. Missing or mismatched historical promotion evidence still blocks claims tied to the original promoted bytes.

## Verification Plan

All 92 QA definitions remain **prepared / not_run** as formal check records. The combined verification receipt supplies aggregate local observations only, as classified above. Eight gates apply: `product_functional_requirements`, `product_security_requirements`, `approved_visual_baseline_fidelity`, `heuristic_usability_review`, `representative_user_task_validation`, `lifecycle_and_continuity`, `target_repository_integrity` and `runtime_activation`. QA-R68 alone verifies the exact repository/staged revision; QA-R69 alone verifies activation. Neither can inherit another check's evidence.

Before repository completion, bind the final commit/tree and rerun affected deterministic, browser, artifact, dependency, license and diff checks. Preserve positive/denied security cases for all 17 security IDs. Record check/gate, exact revision, baseline/override, source hashes, executor/time, environment/seam, expected/observed outcome, evidence path/hash and finding classification. Do not convert an aggregate exit code or screenshot into a broader pass.

Release evaluation still requires native Safari/physical-device support, GUI rich-text-reader inspection, H1–H10 expert review, representative-owner tasks, assistive technology, current provider tuple/live behavior, private Northflank MySQL TLS/backup-restore and hosted Google/Worker/Northflank continuity. The four disposable real-MySQL cases and container seam passed in named exact-revision CI, but those results do not replace hosted evidence. U-17 remains `not_run` until separately authorized. Repository completion, commit and push do not activate the runtime.

## Out Of Scope

This document limits deployment work to this Neo repository's one Northflank service, one private TLS-verified MySQL addon and dedicated `nanoduck-neo` Cloudflare Worker. It does not authorize deployment elsewhere, interruption of an active consultation, replacement or transfer of provider credentials, database reset, or any predecessor-resource change. The product excludes messengers, public/multiuser SaaS, payments, extra hosts, paid fallback, automatic external business actions, required notifications, native apps, PDF/SVG/video/audio/archive uploads and arbitrary uploads. Unchosen palette alternatives are historical design references. Any database reset remains outside this plan unless separately authorized after proven exclusive ownership and recovery evidence.

## Open Questions

No product or visual decision blocks repository finalization. Deliberate evidence gaps are live provider/account/public-search behavior; native Safari and physical devices; Word/LibreOffice or another GUI reader; H1–H10, representative-owner and assistive-technology sessions; private Northflank MySQL TLS/backup-restore; fresh Google/Worker/Northflank continuity; and hosted capacity after the cumulative changes. The named exact-revision CI run closes the disposable-MySQL and container seams only. Preserve missing versus failed evidence.

Runtime activation is a separate operator decision. It additionally requires exact production-resource identity, a verified current backup, zero active or recoverable consultations and rollback readiness. These gaps cannot be waived by a local pass or push.

## Handoff and implementation boundary

The combined implementation was already authorized by `forge/runs/combined-updates-port-20260927/implementation-prompt.json`; U-09–U-15 are present in the target working tree. The remaining repository handoff is U-16: final SDD/trace reconciliation, exact-revision checks, diff/staging audit, commit and push to the canonical Neo branch. Formal release readiness remains `not_evaluated`.

No current receipt authorizes U-17. Activation may occur only after separate authority and the zero-active-run, backup, scale-to-zero, select-approved-build, start-one-with-repeat-safe-startup-migration, health/continuity/rollback sequence. It must preserve the current Northflank service, private MySQL, Google owner authentication, selected provider connections and `nanoduck-neo` Worker and must not interrupt active consultations or touch predecessor resources.
