# User journey

27 September 2026. This journey preserves the existing `J-01`–`J-07` identities and describes the owner experience; requirement and use-case meanings remain in the PRD.

## Source references

[PRD](prd.md), [project context](project-context.md), [canonical terms](canonical-terms.md), [guardrails](guardrails.md), [combined-update authorization](../forge/runs/combined-updates-port-20260927/implementation-prompt.json) and [repository-neutral source receipt](../forge/runs/combined-updates-port-20260927/source-input.json).

## Primary user

The existing owner is the sole user and decision maker. No secondary persona, public customer or administrator journey is assumed. The owner may begin on a phone with limited typing time, return on a larger browser after interruption and use the app for consequential personal or business questions. Those device/attention conditions are source-backed design assumptions, not observed user research.

## User goal and starting context

The owner wants to describe one decision, see separately accountable specialist and Critic work, inspect the evidence and limitations, and leave with a practical next step without losing private work or spending attention on infrastructure. The most costly failures are invented certainty, cross-request context, a hidden unresolved correction, accidental Send, lost draft/history, misleading Usage and private content remaining visible after Logoff.

The normal start is the existing Google owner sign-in to the private Neo application. Deployment plumbing stays outside the everyday flow: Northflank, private MySQL, provider grants and the Cloudflare OAuth proxy are operator concerns, not setup steps for the owner.

## Journey overview

The primary journey covers `JOB-001`–`JOB-006` and `UC-001`–`UC-007`: enter → compose and accept one request → follow Head-led parallel work and Critic correction → inspect evidence → read/control the active request → act/export/revisit → adjust future settings and understand limits.

## Journey stages

| Stage | Owner action and decision | Friction, trust response and recovery | Outcome and trace |
|---|---|---|---|
| J-01 — Enter | Open the browser, use visible Login and give first-use processing consent when required. Return directly to private work during the 24-hour app session. | Repeated setup and exposed content break trust. Cancelled/invalid sign-in reveals nothing. The floating navigation remains readable through its supported glass or opaque fallback; Logoff is always reachable and clears private client content and sampled pixels synchronously. | Authenticated private workspace; UC-001 / JOB-003; FR-01.1–01.2, FR-08.3, NFR-10.1–10.3, NFR-14.2. |
| J-02 — Describe and Send | Type, attach an eligible owner-generated image or explicitly start voice recognition, review the editable draft/transcript and choose Send. | The owner must know what was accepted. Draft, attachment and voice state remain unsent until Send. Every fresh Send creates an independent accepted request, even inside the same chat; earlier requests remain readable but do not become model/evidence context. If work is active, the owner uses Stop before another Send rather than creating a hidden queue or second run. | One deliberate, isolated accepted request; UC-002/UC-003/UC-006 / JOB-001/JOB-002/JOB-006; FR-02.1–02.2, FR-02.12, FR-03.3, FR-07.1–07.5. |
| J-03 — Follow the team | Read Head's separately addressed roles/tasks and watch independent ready specialists complete in parallel while declared dependencies wait. Follow each Critic correction and the affected specialist's response or supported objection. | Generic tasks, truncation and ceremonial exchanges obscure accountability. Head authors every assignment/dependency; successful work appears when ready. A Critic order stays visibly unresolved until Critic assesses the linked response as corrected, objection upheld, unresolved or blocked by evidence. Unaffected specialists do not reply for ceremony. The quiet thinking state, optional sound and active Stop make progress/control perceptible without exposing hidden reasoning. | Substantive attributable exchange and assessed corrections; UC-002/UC-003 / JOB-001/JOB-002; FR-02.3–02.15, FR-03.1, FR-03.4. |
| J-04 — Check evidence | Inspect Sources beside the relevant work, open eligible English/Ukrainian links and ask for focused follow-up when a material claim remains uncertain. | A citation can look fresh while unsupported. Research begins from the need, not a keyword. Head may reuse a completed adequate record or request fresh research only inside this accepted request. Each distinct URL-plus-claim record exposes freshness/limits; stable S-references resolve before display/export. Unknown, prohibited, failed or conflicting evidence remains a visible gap rather than an invented source. | Inspectable request-scoped evidence; UC-007 / JOB-001/JOB-002; FR-04.1–04.3, NFR-12.1, NFR-12.3. |
| J-05 — Read and control | Move among Discussion, Outcome, Sources and Usage with the desktop reading rail or compact mobile selector. Use beginning/end arrows for the current visible panel, collapse input to read, reopen it to continue, Stop active work, or choose Continue/Retry after interruption/failure. | Long work can hide the current result or controls. Arrows never change panels. Collapsing/reopening input preserves draft, attachment and voice state and moves focus predictably; Stop stays reachable. Continue and Retry retain the same accepted request, exact work/evidence/order state and confirmed results, while a new Send creates a separate request. Refresh/reconnect restores the selected panel/open record/reading position without duplicating a confirmed reply. | Controlled reading and request-bound recovery; UC-002/UC-003/UC-004/UC-005 / JOB-002/JOB-004/JOB-005; FR-03.4–03.6, FR-06.1, FR-08.1. |
| J-06 — Act, export and revisit | Read Consolidated advice, including unresolved orders/gaps, requested deliverables, useful actions, main risk and revisit condition. Reopen the completed decision-named record, export it or explicitly delete it later. | A tidy answer or flattened table can hide important structure. Valid Markdown tables remain semantic and keyboard-inspectable in Discussion/Outcome without page overflow. Export produces the same structures as native bordered RTF tables with readable Unicode, links, roles and times; it is not a screenshot or pipe text. Cancelled deletion changes nothing. | Practical next step and owned durable record; UC-002/UC-004 / JOB-001/JOB-004; FR-02.7, FR-03.1, FR-06.1–06.3, NFR-14.3. |
| J-07 — Adjust and understand limits | Open Settings to change valid future model/reasoning, specialist count, review depth, sound or runtime instructions. Open Usage to inspect provider attempts by request/participant/stage/effort/activity and separately inspect account allowance/reset information. | Hidden substitution and charge-like counters mislead. Active work retains its accepted settings. Usage preserves provider provenance, response coverage, repeat-work union and missing versus explicit zero; partial/stale/unavailable remains labelled. Account allowance stays independent from conversation accounting, and no value is presented as a subscription charge. Logoff prevents delayed account data or lens repaint from restoring private content. | Controlled future preferences and truthful limits; UC-005 / JOB-003/JOB-005; FR-05.1–05.6, FR-08.2–08.3, NFR-14.1–14.2, NFR-16.1–16.2. |

## Value moment

The central value moment is a specific Critic correction that changes, sharpens or validly upholds a specialist result and is then explicitly assessed, with inspectable evidence supporting the resulting recommendation. The owner can see which task, response and source led there rather than trusting a generic consensus claim.

## Failure, recovery and safe exits

A typed draft remains distinct from accepted work. Voice Cancel aborts browser recognition; permission, service, language or network failure keeps typed content, and NanoDuck receives no audio. Image rejection keeps the draft. Stop preserves confirmed messages and rejects late publication. Retry resumes only missing work for the same accepted request; a fresh Send never inherits its provider workspace, evidence or private context. Provider authorization, quota, outage and app-session expiry present distinct next actions.

Unsafe research destinations, unknown S-references, prohibited-language output and provider tool transcripts are rejected or receive only their bounded same-context repair; accepted work remains intact when repair fails. Malformed Markdown remains text. Unsupported glass rendering, reduced transparency and forced colours use the readable opaque fallback. Ordinary glass refresh keeps the prior valid frame until replacement; privacy transitions clear immediately.

The repository update preserves the existing Northflank service, private TLS MySQL records, Google authentication, Cloudflare proxy, provider connections and active consultations. It does not deploy or restart them. Any later activation is a separate operator action: confirm zero active consultations, preserve recovery/rollback, scale to zero, select the verified build and start exactly one instance. The owner journey never treats repository checks as live activation evidence.

Safe exits are Logoff, Stop, cancelled voice, cancelled deletion, leaving an unsent draft and closing/reopening the browser within the app-session rule. None silently accepts, deletes or rebases work.

## Success state

The owner leaves with complete current-request Consolidated advice or one clearly bounded unanswered issue; assessed Critic findings; inspectable evidence; truthful Usage/allowance state; and a durable private record that can be revisited or exported. The result contains every requested deliverable without arbitrary truncation and does not claim consensus where disagreement remains.

## Open questions

No material journey question blocks the authorized repository update. Phone/desktop assumptions, critical voice/control behavior, native Safari/physical-device behavior, representative-owner outcomes and safe Neo activation still require their declared evidence. Formal release readiness remains `not_evaluated`.
