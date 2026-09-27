# Definition of done and evaluation gates

## Source references and verification profile

This profile consumes the current PRD, context/terms bundle, guardrails, journey, screen map, wireframes, approved design brief and reconciled architecture. It also consumes [model-settings.md](model-settings.md), [northflank-deployment.md](northflank-deployment.md), the exact authorization and source receipts under `forge/runs/combined-updates-port-20260927/`, and the implementation runner's `verification.json` as supplied execution evidence. The approved visual binding remains `nanoduck-electric-a-v8-20260914` with its immutable target/tree hashes and the recorded 27 September reading/liquid-glass override.

**Definition Status: prepared. Release readiness: `not_evaluated`.** This document defines gates and classifies supplied evidence; this owner does not execute a gate or convert repository evidence into a hosted release result.

The owner manifest binds the current source and receipt hashes after each owner invocation. The implementation evidence is bound to exact revision `96e8827925107667163ebbd212d291a9d5b6d1c9`; later SDD/evidence metadata does not change the evaluated production bytes.

## Definition of done model

Acceptance means a requirement has the expected observable outcome at its named seam. Repository completion additionally requires current source/baseline binding, passing target-scoped checks, an inspected diff, preserved private/deployment boundaries and no open blocking finding for that completion claim. Hosted release requires fresh target evidence and the separate activation gate. A local fixture, browser engine, document converter, source inspection or receipt supports only the seam it exercised.

Three evidence lanes remain distinct:

1. **Repository and deterministic implementation:** target source, unit/system fixtures, browser automation, artifact/license/path/secret/diff inspection.
2. **External compatibility and human use:** native Safari/physical devices, GUI document readers, H1–H10 expert review and representative-owner tasks.
3. **Hosted runtime and activation:** private Northflank MySQL, current provider grants, Google callback, Worker ingress, one-replica lifecycle, backup/restore and rollback.

Passing one lane never passes another. Gate definitions stay `prepared`; each executed result has its own status.

## Verification profile

The implementation runner's target receipt records:

| Evidence | Recorded target result | Exact limit |
|---|---|---|
| `npm run check` | 224 total; 220 passed; 0 failed; 4 skipped | The four authored real-MySQL integration cases were skipped because no isolated disposable MySQL existed locally. No current CI execution is claimed. |
| `npm run test:browsers` | Passed in Chromium, Firefox and Playwright WebKit | WebKit is not native Safari and no physical-device result is claimed. |
| Native RTF check | macOS `textutil` converted the synthetic RTF to an HTML table with Unicode, escaping and sources intact | Word, LibreOffice and GUI-reader inspection were unavailable. |
| Workload measurement | Synthetic evidence-heavy prompt was 97,835 bytes; repeated gap issued one search | This is fixture evidence, not a live Codex/Claude subscription benchmark or hosted capacity result. |
| Artifact, license and diff checks | `npm run check` artifact validation and revision-bound `git diff --check` passed; scoped `THIRD_PARTY_NOTICES.md` and adjacent component attribution recorded | The result applies to this Neo target tree only. The nested read-only reference checkout is not a target artifact. |
| Runtime operation | None | No live provider probe, Northflank/Cloudflare deployment, scale action, restart, hosted health check, secret change or consultation interruption occurred. |

These observations may be bound to concrete QA results after the QA owner reconciles its checks. They do not by themselves set any whole gate to `passed`.

## Gate matrix

| Gate | Purpose, source and applicability | Required evidence and pass/block condition | Rerun and automation |
|---|---|---|---|
| `product_functional_requirements` | All UC-001–UC-007 and FR-01.1–FR-08.3, including restored review-fixes prerequisites and updates A–F. Applies to repository completion and release. | Concrete checks must prove the request, parallel, evidence, usage, table/export, reading and glass outcomes below. Every applicable clause passes without false success, silent substitution, lost accepted work or missing coverage. Four skipped real-MySQL cases prevent a claim that the MySQL seam passed locally. | Rerun after behavior, schema, provider adapter, prompt contract, persistence, export or client-state change. Automated fixtures/browser scripts plus target/manual seams. |
| `product_security_requirements` | Every security obligation listed in Product security membership. Required and active for implementation/release. | Allowed and denied outcomes at the actual server/client/provider/Worker/MySQL boundaries, dependency/config evidence and protected-data inspection. No mockup or visual evidence substitutes. Every applicable security clause and its QA membership must pass; any unrun applicable check blocks a security release claim. | Rerun after any trust, data, input, identity, provider, dependency, rendering, telemetry or hosting change. Automated and authorized manual implementation evidence. |
| `approved_visual_baseline_fidelity` | Electric A v8 plus the authorized reading/liquid-glass override, all applicable routes/states/viewports. | Bind baseline ID and immutable hashes, permitted variance and current target revision. Show no unexplained hierarchy/token/control drift and prove the 24/17/15 optical contract on real Discussion, Conversations and Settings content. Browser-engine evidence is labelled by engine; native Safari remains separate. | Rerun after baseline, style, layout, rendering, responsive or glass change. Browser/visual review; native-device checks remain manual. |
| `heuristic_usability_review` | H1–H10 across J-01–J-07, all UCs, applicable errors/recovery and desktop/mobile states. | Named expert review with tasks, routes, states, viewports, findings and severity/release effect. Screenshots or automated interaction alone do not pass it. Any omitted applicable heuristic or open blocking finding blocks this gate. | Rerun after navigation, flow, copy, controls, recovery or accessibility behavior changes. Manual expert review; not executed by this owner. |
| `representative_user_task_validation` | Critical owner tasks in the design brief: consulting, reading/evidence/Usage, voice, Settings, interruption, export and deletion. | Observed representative-owner completion records task/device/success criterion and findings without moderator rescue, unintended action or accepted-work loss. AI/browser automation is not user research. Required unrun tasks block a release pass. | Rerun after material task/interaction change or closure of a blocking finding. Manual owner sessions; not run. |
| `lifecycle_and_continuity` | NFR-01.1–01.4 and the preserved Northflank/private-TLS-MySQL/Google/`nanoduck-neo` topology. | Fresh target evidence for restart fencing, Stop/Continue, accepted binding, encrypted persistence/deletion/restore, exact tuples, TLS, Google session/CSRF, Worker origin-key denial, one leader/replica, health and rollback. Local fixtures support implementation but cannot pass the hosted seam. | Rerun after runtime/config/schema/provider/auth/edge/storage/recovery change and every activation candidate. Mixed automated/manual target evidence. |
| `target_repository_integrity` | User's target-only, public-repository, provenance and licensing constraints; NFR-15.1. Applies before completion/commit/push. | Inspect the final target diff and intended staged set. No absolute input path, secret, provider grant, private record, owner identifier or reference-checkout content; no infrastructure replacement; license notices cover adapted glass source without relicensing unrelated code. Artifact, dependency and diff checks pass on the exact revision. Any prohibited material or unintended path blocks. | Rerun after any source/doc/asset/dependency/staging change. Largely automated plus final human diff/staging inspection. |
| `runtime_activation` | Separate operational gate for applying the approved revision to the existing Neo runtime; NFR-15.1 and Northflank architecture. It is not required to finish or push repository work, but is required before claiming the hosted update active or release-ready. | Explicit activation authority; zero active consultation executions and confirmation that no recoverable work will be interrupted; verified current backup; scale to zero; select/deploy approved build; run compatible repeat-safe migrations; start exactly one instance; verify health, TLS MySQL, Worker origin key, Google owner auth, settings/conversation continuity and rollback path. Any active work, ambiguous resource, failed check or replacement-first restart blocks. | Run once per authorized deployed revision and rerun after rollback/redeploy. Manual provider operations plus hosted smoke evidence. Current execution status: `not_run`. |

### Functional completion contracts

The `product_functional_requirements` gate requires all of these reusable outcomes:

- **Request isolation and recovery:** two Sends in one conversation have distinct accepted owner IDs, run scopes, provider workspaces, prompts, evidence and sources. An ambiguous replay returns the original body/attachments/message/run only. Continue/Retry retains the original request ID and committed ledger across Stop/restart without rebinding, replaying completed siblings or accepting late-generation commits. Complete text produces a visible `context_too_large` failure rather than truncation/substitution. In-memory fixtures are insufficient for the private-MySQL binding/restart claim.
- **Parallel Head/Critic work:** Head authors specific tasks and an acyclic dependency set. Every dependency-ready independent worker overlaps; a blocked worker does not replay completed siblings. Critic findings link to the exact assignment/result; consultant response and Critic assessment are distinct commits. No order counts fulfilled until assessment records `resolved_corrected` or `resolved_objection_upheld`; open/blocked orders make final advice explicitly provisional. Fixed depth and bounded Auto complete without generic assignments, ceremonial replies or false consensus.
- **Scoped research/evidence:** sanitized public queries contain no private request details. Evidence is request-local and assignment-routed; distinct claims from one URL retain distinct stable `S-*` references. References resolve in prose and structured values. Unknown/foreign IDs get one bounded repair and never persist. Reuse of a completed current-request record performs no new search and is labelled reuse; `fresh:true` performs a new research attempt. Stop/Continue preserves the plan.
- **Authoritative usage/account/activity:** every provider attempt is counted once and attributed to immutable request, participant/assignment, purpose, stage, model and effort. Codex raw response records reconcile with cumulative totals without addition; Claude input counts ordinary/cache-read/cache-create once. `usageSource`, `usageCoverage` and `responseCount` remain inspectable. Missing is never zero; stale/partial/legacy/failed state remains labelled. Provider, request, participant, repeat-work, task, consultant/review/order/research/web-action activity and timeline are internally consistent. Account allowance is read-only, content-free and separate from conversation totals; delayed data cannot repaint after privacy generation changes.
- **Markdown and RTF tables:** restricted Markdown produces semantic header/body tables, safe links and a keyboard-focusable horizontal region without page overflow at narrow widths. Export produces bounded native RTF rows/cells with Unicode and RTF escaping and no executable fields/objects. `textutil` proves the recorded conversion seam; compatibility with Word/LibreOffice/GUI readers remains unproven until separately observed.
- **Reading and active work:** desktop rail and compact mobile selector choose the same Discussion/Outcome/Sources/Usage state. Top/bottom arrows operate on the current visible panel. Composer collapse/restore retains draft, attachments, voice state and focus; active work always keeps Stop reachable. Refresh state contains only allowed identifiers/view/scroll state, never draft/private record content, and clears on Logoff.
- **Final liquid glass:** on real Discussion, Conversations and Settings layouts, a 24px sampling bleed, edge band up to 17px and displacement up to 15px create actual curved-edge pixel displacement with a clear centre and undistorted native controls. Content extends beneath both curved ends using destination-responsive widths. Ordinary mutation retains the previous frame until one coalesced replacement, with no blank repaint. Nested scroll, mutation, resize, font-ready and visibility changes refresh. Logout, lock, hidden/disallowed render and failure clear synchronously. Private field values never affect the sample; pixels are neither persisted nor transmitted. Reduced-transparency/forced-colour fallback remains readable.

### Product security membership

The required `product_security_requirements` gate covers NFR-10.1, NFR-10.2, NFR-10.3, NFR-11.1, NFR-11.2, NFR-11.3, NFR-12.1, NFR-12.2, NFR-12.3, NFR-13.1, NFR-13.2, NFR-14.1, NFR-14.2, NFR-14.3, NFR-15.1, NFR-16.1 and NFR-16.2. Each requires implementation-phase allowed/denied QA evidence. No applicable item may be excluded, made advisory or satisfied by a mockup.

### Clause-to-gate allocation

- FR-01.1–01.2, FR-02.1–02.15, FR-03.1–03.6, FR-04.1–04.4, FR-05.1–05.7, FR-06.1–06.3, FR-07.1–07.5 and FR-08.1–08.3 map to `product_functional_requirements`.
- FR-08.1–08.3 and NFR-02.1–02.3 additionally map to `approved_visual_baseline_fidelity`; applicable accessibility behavior also needs implementation-level functional evidence.
- NFR-01.1–01.4 map to `lifecycle_and_continuity`.
- NFR-10.1–NFR-16.2 map to `product_security_requirements`; NFR-15.1 additionally maps to `target_repository_integrity` and, for hosted application, `runtime_activation`.
- H1–H10 map to `heuristic_usability_review`; the design brief's observed owner tasks map to `representative_user_task_validation`.

Every applicable screen-map state and recovery transition needs concrete QA membership. These mappings may overlap because their evidence classes are independent.

## Eval result format

Each executed result records:

- gate ID and concrete QA check ID;
- Definition Status and Execution Status (`not_run`, `passed`, `failed`, `blocked`, `deferred` or source-backed `not_applicable`);
- exact implementation revision, baseline ID/target/tree hashes and relevant source hashes;
- executor, timestamp, environment, route/state/viewport/device/browser or provider fixture;
- command or manual procedure, evidence kind/path/hash and readable observations;
- finding ID, applicability, PRD severity, release effect, rationale and recommendation;
- superseded evidence and the exact rerun trigger.

For MySQL, provider, browser/device and activation evidence, the result also identifies whether the seam was memory fixture, disposable MySQL, CI MySQL, WebKit, native Safari, physical device, local provider fixture, live provider, local container or hosted Northflank. Missing seam identity makes the result insufficient for that claim.

## Evidence requirements

Fresh evidence must match the exact target revision and relevant configuration without exposing secrets or private records. Retain prior runs; supersede them explicitly after affected source changes. A pass requires readable evidence of the expected outcome, not an empty path, exit code alone or a screenshot standing in for behavior.

The four skipped real-MySQL tests remain `not_run` locally. CI is a potential runner, not evidence until a named CI run and revision are recorded. Playwright WebKit remains WebKit evidence. `textutil` remains conversion evidence. Historical predecessor tests, caches, probes and GoDaddy observations are not Neo passes. No live-provider or hosted-deployment claim can derive from deterministic fixtures.

## Failure and blocker classification

Use the PRD canonical P0–P3 severity and release-effect definition without a competing shorthand. A failed, blocked, deferred or unrun applicable check cannot be relabelled passed. Missing external evidence blocks only the claim that requires that seam: it does not erase a valid local repository result.

Examples:

- a cross-request context leak, false accepted-request binding, lost Stop fence, unsafe evidence reference, usage overcount, private-value glass sample, auth/CSRF bypass, secret/path leak or data-destructive migration is blocking;
- a skipped disposable-MySQL case blocks the MySQL integration claim, while leaving the matching memory fixture result intact;
- absence of native Safari, GUI-reader, representative-user, live-provider or deployment evidence keeps those claims unevaluated rather than manufacturing a product failure.

## Rerun and recovery rules

Rerun the smallest complete affected gate set after a source, dependency, baseline, schema, prompt/instruction, provider, telemetry, rendering, auth, edge or hosting change. A repaired blocking finding reruns the failed check plus its nearest integration/browser boundary. Request/recovery changes rerun duplicate Send, Stop, Continue, restart and MySQL variants together. Usage changes rerun provider normalization, delayed updates, attribution and Usage UI together. Glass changes rerun geometry, mutation replacement, privacy clear and both fallbacks on all three real target pages and supported browser engines.

If a runner is interrupted, record the result `blocked` or `not_run`; do not infer completion from partial logs. Activation failure keeps the service stopped or follows the documented compatible rollback, preserves the database and records the exact failed stage before any retry.

## PR, merge and completion rules

The authorized implementation may be committed and pushed after the complete SDD owner chain, target-only diff/staging inspection and applicable local checks remain clean. The artifact checker cannot substitute for functional, security, visual, human or hosted evidence. This document adds no external merge policy.

Repository completion may report the exact local passes and named gaps. It must state that four real-MySQL cases were skipped locally and no named CI run is recorded, WebKit is not native Safari, `textutil` is not a GUI reader, no live provider probe ran and no deployment occurred. Formal release readiness stays `not_evaluated` until every applicable release gate has fresh passing evidence and no blocking finding.

`runtime_activation` remains separate from repository completion. It may run only with explicit operational authority and the zero-active-run, backup, scale-to-zero/select-build/start-one sequence. Writing, testing, committing or pushing this repository does not activate Northflank.

## Out of scope

This owner does not run tests, CI, providers, representative-user sessions, deployments, scale actions, restarts, secret changes, database resets or deletions. It does not redefine QA checks, implementation units, architecture, product requirements or the frozen baseline.

## Open questions

No gate-definition gap blocks downstream QA reconciliation. Pending evidence is: the four disposable/CI MySQL cases, an actual CI run, native Safari and physical devices, Word/LibreOffice or another GUI reader, H1–H10 expert review, representative-owner tasks, current exact provider tuple probes, private-MySQL restore, fresh Google/Worker/Northflank continuity and a separately authorized activation. Release readiness remains `not_evaluated`.
