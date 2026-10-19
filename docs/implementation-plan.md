# Implementation plan: quoted questions and temporary side conversations

Implementation is now recorded on branch `quoted-side-chat`; see
[the validation report](../opencode/docs/quoted-side-chat-validation.md) and
[usage instructions](../opencode/docs/quoted-side-chat.md). The planning assumptions and sequence below are retained as
the design record; the existing one-shot `/btw` path was deliberately preserved alongside the new multi-message threads.

Status: ready for review; planning only. No application changes or service restarts authorized by this document.

## Baseline and scope

- Implementation target: the maintained Git checkout in `opencode/`, not the separate `implementation/` tree.
- Inspected commit: `73517183b3663ea3c525699baed724d4deca005a`, on `dev`, matching the local `origin/dev` reference. Rechecked while preparing this plan; working tree clean. No fetch/update performed.
- Source manifests: `2.0.28`; installed OpenCode CLI: previously reported `2.0.30`. Do not update either implicitly. Confirm whether to implement against this commit or align versions before creating the development branch.
- Required Bun: `1.4.2`; not found on PATH during investigation. Dependencies, browser tooling, builds, tests, and benchmarks still need verification.
- Primary delivery: the web application embedded in a custom CLI and opened through its `serve` command. Shared desktop-renderer behavior must not regress, but desktop-native features are not part of the work.

Supporting evidence:

- [OpenCode source investigation](investigations/web-selection-side-chat-plan.md)
- [Installed ChatGPT investigation](investigations/chatgpt-selection-side-chat.md)
- [Pinned source/artifact identities](upstream.md)

## 1. Product contract

### Main-chat questions

Selecting assistant prose or code offers **Ask here** and **Ask in side chat**. Actions capture the quote before browser focus changes; they never submit automatically.

**Ask here** adds a removable source-aware quote to the existing composer, preserves its current draft/attachments, and focuses it. The user writes and sends the question normally. Main-chat follow-ups use the current main conversation; selecting an old response does not rewind or fork it.

### Side conversations

**Ask in side chat** attaches the quote to a compatible side thread or opens a new thread, then focuses its independent question input. A visible **New side chat** action also works without a selection. Reuse must not discard an existing draft or silently change the context policy.

Before first send, the user chooses:

| Context mode | Model input |
| --- | --- |
| Conversation | Main history through a fixed source response, quotes, and this side thread's own dialogue |
| Selection only | Quotes and this side thread's own dialogue; no main history |
| Fresh | Only this side thread's own dialogue; no main history or retained quotes |

Each side thread supports follow-ups, stop, retry, and explicit close. Its requests do not enter the main Session inbox, alter the main conversation, change the main model/agent selection, or execute tools.

Switching an unsent thread to Fresh removes its quote attachments explicitly in the UI. After the first request, changing mode or source boundary starts a new side thread: a response derived from full history must not later be presented as context-free.

### Proposed defaults requiring approval before implementation

1. **Cutoff:** include the complete selected assistant message, but no later messages. Do not claim exact highlighted-word clipping. Initially support conversation mode for completed responses; text selected during streaming can still use Selection only.
2. **Lifetime:** preserve existing `/btw` semantics—locally retained until explicit close, including reload recovery, but never a normal persisted backend session. Clearly describe this as temporary-until-closed, not memory-only or guaranteed remote deletion. Memory-only would be an alternative decision, not another storage mode added speculatively.
3. **Reuse:** reuse only a side thread belonging to the same server/session and compatible mode/boundary; otherwise create one. Offer explicit New side chat so users can avoid reuse.
4. **Initial context:** selection actions open a new thread in Selection only unless the user chooses Conversation; the fresh entry opens in Fresh. Make the mode visible rather than infer it from question wording.
5. **Tools/streaming:** tool-free, complete-response generation for the first release. Agentic execution, token streaming, promotion/export, and automatic summarization are out of scope.

These defaults are recommendations, not prior user decisions. The existing explicit `/btw question` submission remains an immediate-send shortcut; only selection-toolbar actions are attach-only.

## 2. Architecture and state ownership

Extend `packages/gui-extensions/src/btw/`. Reuse the existing panel/layout infrastructure and non-mutating generation paths. Do not use durable `Session.fork`, create placeholder backend sessions, or implement a second agent runner.

### Quote

A serializable quote has a local ID, captured text, source server/session/message/text-part identity, optional rendered-text locator, and optional user comment. A locator is for reopening/highlighting the passage, not an asserted raw Markdown offset. Keep the text snapshot usable if the source can no longer be revealed.

- Browser-safe generation payloads belong in Schema/Protocol as needed.
- Browser-only locators and App draft presentation belong in the owning UI contracts.
- Keep quoted material and inherited history as reference data, separate from the user's active request.
- Add an explicit quote context variant to the App composer, while reusing existing attachment/card UI. Do not force quote semantics into a file or a generic note string.

### SideThread

A side thread owns its ID, server/session owner, context mode, fixed optional source-message boundary, model choice, quotes, completed dialogue, draft, and last request outcome. Keep pending-request controllers transient rather than serialized. Persist only the agreed local thread state.

The panel/controller belongs to the `btw` extension. Main composer state stays in App. New selection actions call typed capabilities directly; do not simulate typing/submitting `/btw`, which could clear or otherwise operate on the main composer.

### Generation

Keep existing authenticated client calls and provider/model configuration. Recommended API evolution is additive:

- Retain existing prompt-only generation callers and their behavior.
- Add an explicit optional side-chat request block to the session and stateless generation contracts, with previous role-separated user/assistant messages and structured quotes. `prompt` remains the current question; do not include it again in prior dialogue.
- Session side-chat input additionally requires a through-message boundary; stateless side-chat input has no Session context lookup. Pass the desired model explicitly without switching the main Session's model.
- Exact field/type names are finalized in the contract commit using upstream conventions. Validate at the owning boundary, including roles, message ownership/completion, and practical request-size limits.
- Enforce tool-free final requests for this new mode, without changing legacy `session.generate` semantics or tool expectations. Preserve applicable provider hooks/configuration; do not claim a client flag alone enforces tool isolation.

Follow the existing Schema -> Core/Protocol -> Server dependency direction. Generated Client runtime must not import Core or Server.

## 3. Implementation sequence

### Milestone A — Prepare and benchmark

1. Approve the defaults and source version, then create a short branch/worktree from the agreed `origin/dev` baseline, e.g. `quoted-side-chat`.
2. Locate/install the required Bun and install dependencies with the existing lockfile; identify available browser tooling.
3. Capture production tab-switch and selection/scroll benchmark baselines before modifying session/timeline code. Run serially and preserve raw results outside tracked application modules.
4. Use isolated development endpoints and test data. Never restart or replace the user's current app/server.

**Exit gate:** reproducible baseline, toolchain, and benchmark record. Stop here if the environment cannot validate subsequent changes.

### Milestone B — Structured quotes and main-chat attachment

Primary files: `packages/app/src/composer/{schema.ts,state.ts,request.ts,comment-note.ts,submit.ts}`, composer attachment/history/persistence modules, and shared quote presentation in `packages/session-ui/src/` where necessary.

1. Introduce the explicit quote context/presentation shape with backward-compatible decoding of existing drafts and sent messages.
2. Add a removable quote card and optional comment editor, preserving the separately typed request.
3. Serialize quote text/source/comment as reference context while retaining presentation metadata for the timeline.
4. Preserve quotes through failed-send restoration, draft/history restore, and existing revert/fork composer restoration. Quotes are sent once, not silently reattached on the next prompt.
5. Keep existing file/note/image attachments and queue/steer behavior unchanged.

**Exit gate:** quote round-trip and normal prompt submission work without altering unrelated draft content.

### Milestone C — Selection controller and generic extension capability

Primary files: `packages/app/src/session/timeline/`, `packages/app/src/runtime/extension/`, `packages/gui-extensions/src/sdk/`, and only the necessary production identity hooks in `packages/session-ui/src/message/`.

1. Add a generic typed selected-response/action capability. App interprets its own DOM; extensions consume a typed snapshot. The host must not name `btw` or depend on its internals.
2. Register one controller and floating action surface per active timeline. Reuse text-part identity rather than install listeners/state on each virtualized row.
3. Capture nonempty selections within one eligible assistant response; exclude editor inputs, message metadata, controls, and unrelated cross-message ranges.
4. Preserve native copy, links, code selection, pointer/keyboard selection, scroll behavior, and focus. Clean up stale selections on session changes/unmount and ignore cached inactive timelines.
5. Wire Ask here to milestone B and register Ask in side chat through the generic capability. Before the side-thread work lands, do not expose a nonfunctional action.
6. Document SDK additions in TSDoc and the GUI-extension README. Add English i18n strings at the owning layer; retain upstream semantic theme tokens.

**Exit gate:** selection/attachment works with long virtualized history and does not cause a closed-panel performance regression.

### Milestone D — Isolated generation and bounded history

Primary files: `packages/core/src/session/{generate.ts,history.ts}`, `packages/core/src/session.ts`, `packages/core/src/generate.ts`, `packages/protocol/src/groups/{session.ts,generate.ts}`, `packages/server/src/handlers/{session.ts,generate.ts}`, and browser-safe Schema contracts.

1. Add the optional side-chat API contracts without changing defaults for existing callers.
2. Resolve conversation cutoffs by the server's ordered message sequence, not ID spelling or browser pagination.
3. Apply the cutoff before choosing compaction/checkpoint history. Exclude later summaries and later instruction-update messages; retain existing provider-compatible history conversion and settled-tool semantics.
4. Keep this bounded preview separate from ordinary Session runner behavior. Do not compact, prompt, fork, or interrupt the parent to answer a side question.
5. Assemble quoted context, reference-only inherited history, previous side dialogue, and the current question with explicit roles. Prevent inherited tasks/plans/approvals from becoming active instructions.
6. Route Selection only/Fresh through stateless generation, without workspace history or project instructions. Normal shared provider configuration still applies.
7. Propagate typed missing-boundary, incomplete-source, context-size, provider, and cancellation errors. Never fall back silently to latest history or silently truncate context. Current provider/system configuration may apply; this is not a promise to replay all historical hidden configuration exactly.
8. Regenerate clients with `bun run generate` from `packages/client`; do not hand-edit generated outputs.

**Exit gate:** captured final model requests prove the correct context boundary/mode, no tools for side mode, no main durable mutation, and no regression in old prompt-only generation.

### Milestone E — Multi-message side panel and lifecycle

Primary files: `packages/gui-extensions/src/btw/{index.ts,model.ts,renderer.tsx,panel.tsx,i18n/en.ts}`.

1. Expand the current one-question model into SideThread state. Migrate existing `{ id, question, answer? }` records without discarding saved `/btw` answers. Legacy threads with unknown context provenance remain readable; continuing one must choose an explicit new context policy/boundary rather than invent a historical cutoff.
2. Add the visible mode selector, quote cards, source indicator, message list, independent input, and New side chat action. Reuse UI primitives without importing App internals into GUI extensions.
3. Implement attach-and-focus/reuse, compatible-thread checks, and an explicit new-thread path. Preserve drafts in both composers.
4. Keep `/btw question` as an immediate-send shortcut that creates its own thread. Capture a settled history boundary at invocation for its conversation-mode request; preserve its independent-tab behavior.
5. Lock mode/boundary after the first request and maintain only that side thread's follow-up history. Later parent messages never enter an already anchored thread.
6. Implement stop, retry, and close using per-thread request identity/controllers. Ignore late responses after stop/close or ownership changes; do not recreate removed threads. Stop must not call the parent's Session interrupt endpoint.
7. Verify transport cancellation reaches server/provider work when supported. If local cleanup/persistence fails, show the failure rather than claim the chat was forgotten. Confirm closing a populated thread before loss of its local dialogue.
8. Reuse existing side-panel and mobile-view infrastructure. Review the current desktop-only `/btw` guard intentionally; narrow screens must not acquire an unusable second column.

**Exit gate:** full selection -> side question -> follow-up -> stop/retry/close flow, independent of main execution and safe across session changes/reload.

### Milestone F — Verification and packaged delivery

1. Complete the validation matrix below using existing test owners.
2. Run package typechecks, full repository checks, generated-client verification, and changed-file lint.
3. Repeat production benchmarks on the same workload/machine conditions and inspect regressions. Do not invent hardware-dependent pass/fail timing thresholds.
4. Build a host-platform custom CLI with App assets included; verify its actual `serve` workflow on an isolated endpoint/profile, including the changed API and web bundle together.
5. Capture wide/narrow UI screenshots. Document verified setup/build/test/launch commands in README and include baseline, validation, and limitations in the change description.
6. Do not install over the existing CLI or restart the live service without separate authorization. Keep changes reviewable, diff against `origin/dev`, and target any PR at `dev`.

**Exit gate:** acceptance criteria pass in the packaged web app, not just a Vite development page.

## 4. Validation matrix

| Observable contract | Existing owner to extend | Credible regression protected |
| --- | --- | --- |
| Quote text/source/comment survives draft/send/restore; other attachments remain intact | App composer schema/request/history tests | Quote omitted as an empty note, stripped on restore, or sent repeatedly |
| Selection actions preserve draft, native selection/copy, source identity, and focus | Existing App composer/timeline e2e keeper | Toolbar collapses range before capture or acts on an inactive session |
| Side follow-ups, context UI, compatible reuse, close/retry/reload and responsive layout | `packages/app/e2e/regression/btw-sidebar.spec.ts` | Side input mutates main draft, crosses threads, or resurrects a closed chat |
| Earlier-response cutoff excludes later messages/compactions/instruction updates and pending work | `packages/core/test/session-generate.test.ts` / owning history tests | Side question reads newest context instead of selected history |
| Selection/Fresh carry no main history; side requests have no tools or durable Session writes | Existing Core generation tests | UI-only toggle leaks parent context or legacy tools remain enabled |
| Existing generate callers retain behavior | Current Core/Server generation tests | New side-chat restrictions change normal generation |
| New API validation/error surface and client contract | Existing Protocol/Server/Client owners | Invalid boundary accepted or client built against stale schema |
| Generic selection capability has correct lifecycle | Existing extension-host component tests | Stale action registrations survive unmount/reload |
| Existing `/btw` records remain readable | Owning storage migration test, with UI continuation in side-panel keeper | New schema discards saved questions or assigns invented context |
| Timeline remains stable and lightweight | Existing production benchmarks and selection/scroll stability scenarios | Selection feature adds per-row work or disrupts virtualization |

Add each behavior once at its strongest owning boundary; do not duplicate assertions across layers. Before adding a test, document its observable contract, plausible regression, and why existing coverage does not already prove it. Use deterministic fixtures and web-first Playwright assertions, not timing sleeps or test-only production hooks. Follow the package's Playwright reading requirements before editing E2E tests. Use `agent-browser` for manual browser automation when available.

## 5. Planned checks and commands

These commands are established by the inspected manifests/guides, not executed successfully in this environment yet:

| Directory | Command / purpose |
| --- | --- |
| `opencode/` | `bun run check` — canonical lint/typecheck |
| `opencode/` | `bun run lint:changed` — touched GUI-extension files |
| Each affected package | `bun typecheck` — focused typecheck; never invoke `tsc` directly |
| `packages/core` | `bun run test test/session-generate.test.ts test/generate.test.ts` — generation contracts |
| `packages/app` | `bun run test:unit` — owning unit contracts |
| `packages/app` | `bun run test:e2e:built -- e2e/regression/btw-sidebar.spec.ts` plus touched composer/timeline keepers |
| `packages/app` | `bun run bench:tabs` — serial production before/after baseline; selection stability uses its dedicated config |
| `packages/client` | `bun run generate` after public API changes; inspect generated diff and existing generated-client checks |
| `packages/cli` | `bun run build -- --single` — host build with web assets; review build output cleanup/install behavior and use a dedicated output |

Run tests from package directories, never the repository root. For local UI work, the guide specifies a separate source backend (`bun dev serve --port 4096` from the repository root) and App (`bun dev -- --port 4444` from `packages/app`). Verify free ports and isolated data first; these commands must not replace/restart an existing service. Do not use the hosted-web proxy for local UI verification.

## 6. Done means

- The approved selection, context-mode, follow-up, lifecycle, and draft-preservation contracts work.
- Side chats neither admit main-session prompts nor execute tools or modify workspace files.
- Existing `/btw`, attachments, history restoration, main-session execution, and normal generation remain covered.
- Side-thread lifecycle and retention are described accurately; no unsupported privacy/deletion claims.
- Generated client/API stay aligned; required checks pass or specific unavailable checks are reported.
- Production performance is compared against the recorded baseline.
- A custom packaged CLI actually serves the changed UI/API together.
- Only then is deployment to the user's installed OpenCode proposed for separate approval.
