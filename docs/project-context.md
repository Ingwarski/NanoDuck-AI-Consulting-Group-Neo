# Project context

27 September 2026 · Current product authority: [product idea](product-idea.md) and [PRD](prd.md). The [model preservation record](model-settings.md), [Northflank deployment record](northflank-deployment.md) and repository-neutral combined-update receipts provide qualified grounding. This bundle clarifies those sources; it does not replace them or make historical evidence current.

## Authority, language and identity

Working language is English, from the owner's latest substantive request. Product conversations and source metadata support English and Ukrainian only; the first substantive request sets a consultation's language and an explicit supported-language change wins. Russian and Belarusian language, terminology, sources and URLs are prohibited, including `.ru`, `.by`, `.su` and Cyrillic equivalents. Role names, provider/model identifiers and the preserved IT terms in [canonical terms](canonical-terms.md) remain English.

**NanoDuck Consulting Group** is a private decision-support and coaching browser application for one existing owner, who is both user and decision maker. The owner wants substantive Head Consultant, specialist and Critic work; inspectable public evidence; truthful limits; and a practical outcome with little operational effort. The seven PRD use cases cover entry, consultation, interruption, history, Settings, dictation and research. No additional persona, audience segment or commercial service is assumed.

The 27 September combined-update receipt authorizes implementation, verification, commit and push in this Neo repository. It does not authorize deployment, restart, credential changes, destructive migration, live subscription probing or interruption of an active consultation. Runtime activation remains a separate controlled action.

## Platforms, hosting and saved choices

Phone browsers are primary; tablet and desktop complete the same tasks. The responsive evidence set covers 320, 390, 430, 768, 1280 and 1440 CSS px, with WCAG 2.2 AA as the planning target. Current Safari, Chrome, Firefox and Edge are release targets. Voice input uses browser-native recognition in Safari and Chrome where available; typing remains available when recognition, permission, language support or connectivity is unavailable. Ukrainian recognition uses the browser's Ukrainian locale, with `uk-UA` as the supported locale.

The only permitted hosted topology for this repository is one Northflank Sandbox project with one application service and one private TLS-verified MySQL addon, Google owner authentication, and the dedicated free Cloudflare Worker `nanoduck-neo` solely as the OAuth-compatible public proxy. The service uses one application replica, MySQL advisory-lock leadership, disabled autoscaling and disabled automatic deployment. Direct non-health access to the Northflank origin is denied by the shared origin-key boundary. A later activation follows the stopped-service release sequence and begins only after confirming that no consultation is active. The predecessor GoDaddy application and local-server runs are historical evidence, not current Neo deployment targets or sources of live state.

Preserve the authenticated 14 September defaults for both Head/specialists and Critic: Codex `gpt-6-astra` with `xhigh`. `gpt-6-sol` is an additional explicit Codex choice. A newly selected Claude branch begins at Opus 5 / High; Opus 5.5 is another explicit choice, both with Low, Medium, High, Extra and Max. No added choice silently replaces a saved value. The implementation pins Codex `0.155.1` and Claude Code `2.1.280`. Specialist count remains 1/2/3/5/Auto, discussion depth remains 1/3/5/Auto team review rounds, and the defaults remain two specialists and one round. Accepted work retains its settings and contract; already accepted legacy runs retain their original semantics until terminal.

## Downstream decision index

| Fact | Consequence for downstream work | Authority |
|---|---|---|
| Every fresh Send creates one accepted request with an internal immutable `requestMessageId`. | Bind its exact owner message, settings, assignments, results, orders, evidence, sources and Usage to that ID. Continue and Retry reuse it; a later Send receives a new boundary and cannot inherit prior request or provider-workspace context. | PRD FR-02.12, FR-03.3, FR-03.5 |
| Head authors roles, individual assignments and substantive dependencies. | Execute independent ready work in parallel; wait only on Head-declared prerequisites and never replace Head text with application-authored generic work. | PRD FR-02.9–FR-02.11 |
| Critic findings are linked records, not conversational ceremony. | Preserve each correction order and the matching response; only a Critic assessment can mark it corrected, uphold an objection, leave it unresolved or record an evidence block. | PRD FR-02.13–FR-02.14 |
| Public evidence belongs to one accepted request. | Use minimized queries, stable resolved S-references and distinct URL-plus-claim records. Reuse completed scoped evidence only when Head selects it; run fresh research when Head identifies a gap that reuse cannot answer. | PRD FR-04.1–FR-04.3 |
| Provider-work accounting and account allowance are separate facts. | Preserve actual prompt/prefix bytes, attempts, provider-reported fields, attribution, coverage, response counts, repeat-work union and activity counts without double counting or inventing subscription charges. | PRD FR-02.15, FR-05.4 |
| Reading controls operate on the current visible panel. | Keep Discussion/Outcome/Sources/Usage selection, reading position, draft/attachments/voice state and active Stop available; arrows move only to that panel's beginning or end. | PRD FR-03.4, FR-06.1, FR-08.1 |
| Tables are structured content. | Render valid Markdown as semantic browser tables and export the same parsed structure as native RTF rows/cells; malformed tables remain text. | PRD FR-03.1, FR-06.2 |
| Electric A v8 remains frozen and approved. | Apply only the scoped final liquid-glass navigation override: displaced curved edges, clear centre, native undistorted controls, permitted same-origin sampling, synchronous privacy clear and no blank replacement frame. | PRD FR-08.3 |

## Scope, privacy and ownership constraints

The PRD remains the concise MVP and exclusion authority. Included work is the private responsive consultation app, durable chat archive, independent accepted requests, scoped research, semantic records/export, Settings and truthful Usage. Excluded work includes public registration, multiuser SaaS, billing, generic provider integrations, native apps, PDF or arbitrary-file uploads, automatic external business actions, cross-request memory/evidence reuse, model fallback and unrelated redesign.

Source code is public. Conversations, attachments, identity/session data, provider grants, settings and instructions, request/work/evidence ledgers, Usage/account records and encryption material are private. The authenticated owner is the only attachment user and stated that submitted images will be self-generated; that statement is a trust boundary, not provenance proof. NanoDuck receives only the editable voice transcript the owner chooses to Send, not audio. Public artifacts use fictional content. AI role names do not claim human employment or licensure.

An accepted message and its confirmed work survive refresh and authorized restart recovery. Logoff clears private client state. Stop fences late work; Continue/Retry preserve completed work and resume only the missing current-request step. Repository reconciliation must preserve the existing database, authentication, provider connections, stored private data and active consultations.

## Assumptions, risks and open evidence

- Floating navigation means the approved persistent desktop bar and mobile hamburger behavior; it is not arbitrarily draggable. Electric A v8 remains the approved baseline, while the final liquid-glass contract is a narrow material/content-footprint override rather than a new candidate or approval.
- Northflank Sandbox capacity and Cloudflare Worker allowance are constrained. Current provider entitlement, exact active model tuples, peak memory, private-MySQL restore, restart recovery and safe activation require current environment evidence; historical predecessor or earlier deployment evidence cannot substitute.
- Native Safari, physical-device behavior, document-reader coverage and representative-owner outcomes remain release evidence gaps. Expert review and passing repository/browser checks are not user research or live-service proof.
- Formal release readiness remains `not_evaluated`. No material product-intent or vocabulary question blocks this authorized reconciliation; any new behavior or hosting boundary returns to its upstream owner.
