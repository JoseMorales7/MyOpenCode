# Web selection questions and temporary side chats

Status: source investigation and implementation plan only. No application changes. The later [installed ChatGPT investigation](chatgpt-selection-side-chat.md) adds artifact-backed design guidance; see the addendum below.

For the consolidated implementation sequence and proposed product defaults, use [docs/implementation-plan.md](../implementation-plan.md). This document retains the original source findings and investigation history.

Baseline: [upstream.md](../upstream.md). All source paths below are relative to `opencode/`.

## Requested behavior and acceptance criteria

1. Select text in an assistant response and choose **Ask here** or **Open side chat**. Capture the passage before focus changes; never submit merely because text was selected.
2. **Ask here** attaches a removable quotation to the existing composer, preserves its unsent text and attachments, and lets the user write a focused question. Sending uses the ordinary main-chat prompt path and its existing queue/steer behavior.
3. **Open side chat** shows the quote and a separate question input in the existing side-panel system. The main transcript, draft, scroll position, pending input, and running execution remain unchanged.
4. Before the first side-chat send, choose **Conversation context**, **Selection only**, or **Fresh question**. A fresh side chat can also open without selecting text.
5. Conversation context stops at the source response, not the latest response at send time. Follow-up questions keep that same boundary and include only their own side thread after it.
6. Selection-only sends the quote and the side thread, without main-conversation history. Fresh sends only the side thread. Shared provider configuration and model selection still apply; "no context" is not an unauthenticated or unconfigured model call.
7. Side chats accept follow-ups and support pending, stop, retry, and error states. Closing one aborts its pending request and forgets its local contents without deleting or interrupting the main session.
8. Side-chat generation is text-only: no agent actions, workspace writes, prompt admission, or durable child/fork session creation.
9. Preserve ordinary text selection, copying, links, code selection, virtualized history, session switching, and existing `/btw` usage.

## Source evidence

These are local source references, not REA Evidence IDs or runtime observations.

| ID | Source | Observation |
| --- | --- | --- |
| S1 | `packages/cli/src/commands/handlers/serve.ts`; `packages/cli/src/services/web-ui.ts`; `packages/cli/src/app-assets.ts` | `serve` runs the server process. The CLI serves the app shell/assets alongside the API. Production assets are embedded; local-source fallback reads `packages/app/dist`. |
| S2 | `packages/cli/script/app-assets.ts`; `packages/cli/script/build.ts` | CLI builds build and embed App assets with origin-based server connection. A frontend source edit does not change an already installed CLI. |
| S3 | `packages/app/src/session/screen.tsx`; `packages/app/src/session/timeline/message-timeline.tsx` | SolidJS App owns the session screen, timeline, composer region, and generic extension side region. Timeline rendering is virtualized and cached. |
| S4 | `packages/app/src/session/timeline/interaction.ts:202`; `packages/session-ui/src/message/message-content.tsx:624` | Selection currently unpins autoscroll. Assistant text already has `data-timeline-part-id` around its rendered Markdown. There is no selection-question action in these paths. |
| S5 | `packages/gui-extensions/src/btw/{index.ts,renderer.tsx,model.ts,panel.tsx}` | `/btw` already creates independent one-shot question tabs. It calls `session.generate`, has no follow-up input, and stores questions/answers locally until tab close. Its command is currently enabled only at desktop widths. |
| S6 | `packages/protocol/src/groups/session.ts:708`; `packages/server/src/handlers/session.ts`; `packages/core/src/session/generate.ts` | Session generation accepts a prompt, reads current settled session history, and returns text without admitting a prompt. It does not accept an earlier context boundary or a structured side conversation. |
| S7 | `packages/core/src/session/history.ts` | History preview selects the newest applicable compaction and omits an unsettled assistant suffix. Filtering its returned list afterward would not reliably implement an earlier boundary. |
| S8 | `packages/protocol/src/groups/generate.ts`; `packages/server/src/handlers/generate.ts`; `packages/core/src/generate.ts` | A stateless generation API already exists. It resolves the model using base configuration and does not create a stored Session. It currently accepts one prompt rather than role-separated dialogue. |
| S9 | `packages/gui-extensions/src/sdk/host-apis.ts:432`; `packages/app/src/runtime/extension/mounted-session.ts:145`; `packages/app/src/composer/{schema.ts,request.ts,comment-note.ts}` | Generic composer notes already support attachment, removal, comment presentation, prompt serialization, and restoration. Notes with empty comments are omitted from requests, so quote attachment must not rely on an empty note being sent. |
| S10 | `packages/core/src/session.ts:319`; `packages/schema/src/session-fork.ts` | Forking is durable, not a temporary chat mechanism. Core supports before/through message boundaries internally, but the public fork input is not a transient text-generation boundary API. |
| S11 | `packages/app/e2e/regression/btw-sidebar.spec.ts`; `packages/core/test/session-generate.test.ts`; `packages/core/test/generate.test.ts` | Existing owners cover side-tab isolation/restoration/close, stateless generation, and non-mutating session generation. The session-generation tests explicitly expect tool definitions in the current request, so changing all generation calls to tool-free would change an existing contract. |
| S12 | `packages/gui-extensions/AGENTS.md`; `packages/app/AGENTS.md` | Extension-specific behavior must stay outside generic host code; no per-row extension work. Production performance baselines are required before timeline/session changes. New visible strings need English i18n keys. |

## Recommended architecture

Extend the built-in `btw` GUI extension rather than inventing a second session implementation. It already owns side panels, tabs, storage, cancellation controllers, and retry presentation. Keep its existing command and saved answers readable.

Add a generic selected-response capability to the App/GUI-extension boundary. App owns interpreting browser selection and identifying its session/message/text part. Extensions consume typed selections and contribute actions; the host must not import `btw` internals or hardcode its command ID. Do not make an extension inspect arbitrary timeline DOM itself.

Use one delegated selection controller and one floating action surface at timeline-container level, not a listener/menu/store on every row. Reuse the existing production text-part identity. Scope the controller to the active timeline: cached inactive sessions must not supply selections. Snapshot the quote and identity before opening a toolbar, panel, or composer.

For **Ask here**, reuse the existing note/comment pipeline where it can represent the quote faithfully. Carry the quotation as explicit quoted content, preserve a source link/identity where supported, and keep the actual question in the main composer. Audit empty-note filtering, request formatting, draft/history persistence, retry, and revert/fork restoration together. If the existing note shape cannot preserve a distinct quotation cleanly, add a narrowly scoped App quote-context variant rather than pretending it is a file attachment. No new prompt-admission endpoint is needed.

For side chats, use non-mutating model-generation paths. Conversation mode needs bounded session generation. Selection-only/fresh can build on the stateless generator, passing the chosen model explicitly. Extend both with role-separated user/assistant side-dialogue input rather than encoding an expanding transcript as an ambiguous instruction string. Exact public field names should be finalized with the API contract change.

Make tool-free behavior explicit for the new side-chat request path, including the request sent after applicable preparation/hooks. Do not globally strip tools from existing `session.generate` calls. Reuse provider resolution, authentication, model options, and error handling; do not expose provider credentials to the browser or run the durable Session runner for a side question.

### Context boundaries

- Bind conversation-mode chats to the selected message's identity. Follow-ups and retries must not silently advance to the latest main chat.
- Resolve the cutoff using the server's ordered message sequence, not lexical ID sorting, client pagination, or only the messages currently rendered in the browser.
- Apply the upper bound before choosing compaction/checkpoint history. A later summary must not leak later conversation into an older side question.
- Bound instruction-update messages as well. Current model/provider configuration may still apply; do not claim to recreate every historical hidden instruction/configuration value.
- Keep the bounded read separate from ordinary runner semantics; reuse existing history conversion and provider-compatible compaction behavior without changing normal Session execution.
- If the source boundary was removed by revert/deletion or is otherwise unavailable, report that explicitly. Do not silently fall back to latest context.
- Start by supporting settled assistant responses. Handle text from an actively streaming response explicitly (selection-only remains possible; bounded conversation mode can explain why it must wait). Do not invent completed tool results.
- If history exceeds the model window, report it or offer an explicit reduced-context choice. Do not compact or mutate the main chat to make a side question fit.

### Product decisions to settle before implementation

1. **Cutoff granularity.** Recommend conversation history through the selected assistant message, with no later messages. Stopping at the exact highlighted word inside a response is a different requirement: Markdown DOM offsets are not raw Markdown offsets, and repeated text makes substring matching ambiguous. If exact passage-level cutoff is required, first validate a source-position mapping through the Markdown renderer, then add part/offset boundaries. Never label whole-response context as exact passage-level context.
2. **Temporary lifetime.** Recommend existing `/btw` semantics: retained locally while the tab exists, survives reload, forgotten on explicit tab close, never stored as a normal backend chat. If "temporary" means never written to browser storage, use memory-only storage for new side threads instead. Do not silently remove existing saved `/btw` answers. Neither choice promises deletion from provider records or infrastructure logs.
3. **Context changes after sending.** Recommend locking the context mode and source boundary after the first send; changing them starts a new side thread. Otherwise a supposedly context-free thread can retain answers derived from full history.

These are recommendations, not decisions already made by the user. Multi-message selections and exact intra-response clipping should not be silently added to the first implementation.

## Execution phases

### 0. Prepare a reproducible development baseline

- Confirm this checkout versus `implementation/` as the modification target, and decide whether to align source with installed `2.0.30` before starting. Do not update source implicitly.
- Install/locate Bun 1.4.2 and dependencies using the repository lockfile. Use a short development branch/worktree based on `origin/dev` after target/version agreement.
- Capture the required production timeline/session benchmark baseline before application edits; preserve raw reports outside tracked application modules. Record serial median/p95 results for tab switching and relevant selection/scroll workloads.
- Do not restart the running application or background service. Use separate isolated development/test endpoints and data.

### 1. Selection and Ask here

- Add the typed generic selection/action boundary and delegated controller in App, documenting any GUI-extension SDK changes in its README/TSDoc.
- Offer actions for nonempty selections contained in eligible assistant prose/code, excluding composer inputs, metadata, tool controls, and selections crossing unrelated messages.
- Add the accessible floating action surface, preserve native copy/selection behavior, and dismiss stale selections on navigation/unmount.
- Implement quote attachment through the existing composer path. Do not auto-send, clear drafts, or interrupt an active main session.
- Primary owners: `packages/app/src/session/timeline/`, `packages/app/src/runtime/extension/`, `packages/gui-extensions/src/sdk/`, `packages/app/src/composer/`. Shared Session UI changes only if production identity/quote rendering needs them.

### 2. Non-mutating contextual dialogue API

- Add browser-safe contracts for optional structured dialogue and bounded context in Schema/Protocol as appropriate. Keep existing prompt-only callers valid and retain their defaults.
- Implement bounded history assembly in Core and wire server handlers, including useful invalid/unavailable-boundary errors.
- Extend stateless generation for the same text-only side dialogue and selected model. Keep it independent of Session history and workspace instruction loading.
- Enforce side-chat text-only execution and pass cancellation through the authenticated client path. Verify that abort actually stops server/provider work where the transport supports it; the existing UI AbortController alone is not proof.
- Run `bun run generate` from `packages/client` after public API changes. Never hand-edit generated clients. Preserve Schema/Core/Protocol/Server dependency direction.

### 3. Expand the existing side panel

- In `packages/gui-extensions/src/btw/`, add the context selector, removable quote preview, source indicator, dialogue list, and separate follow-up composer.
- Keep side-chat input/history/model state independent of the main composer. Reuse low-level editor/UI pieces, not the adapter that admits durable session prompts or runs shell commands.
- Preserve existing one-shot `/btw question` entry as a shortcut into a thread and add a visible fresh-side-chat entry point. Do not switch the main session's model merely to choose a side-chat model.
- Keep request state and replies scoped to server/session/thread. Closing one aborts and deletes only that thread. Late replies cannot recreate closed threads or overwrite another active chat.
- Version/migrate local storage if follow-ups are persisted: convert `{ id, question, answer? }` to the new dialogue shape without dropping saved answers. If memory-only is selected, keep old stored tabs readable until explicitly closed.
- Reuse existing wide/narrow panel layout instead of adding a second sidebar system; review the existing desktop-only command guard intentionally. Add English localization keys at their owning layer.
- Retain complete-response generation for the initial change; streaming is a separate protocol enhancement, not required to deliver context modes or follow-ups.

### 4. Validate and package

- Extend the current keeper suites rather than create duplicate test owners. Cover the contracts in the table below.
- Compare production performance to phase 0, particularly when the side panel is closed and the timeline should pay almost no new cost.
- Build the custom CLI with App assets included and test that binary's `serve` on an isolated endpoint/profile. A Vite-only demo is not sufficient acceptance for the requested launch workflow.
- Keep the installed binary and live service intact. Provide launch/install instructions only after the package is verified and deployment is authorized.

## Validation ownership

| Contract | Test owner / existing place to extend |
| --- | --- |
| Select, attach quote, preserve draft, remove quote, send normal focused prompt | App composer/timeline e2e keeper; use real browser selection, including code/Markdown and keyboard selection |
| Side follow-ups, context indicator, independent tabs/sessions, retry/close/reload, responsive panel | `packages/app/e2e/regression/btw-sidebar.spec.ts` |
| Correct older-message cutoff, no later summary/update leakage, missing boundary, no main durable mutations | `packages/core/test/session-generate.test.ts` or the owning bounded-history module's tests |
| Selection/fresh requests contain no main history and do not create stored sessions | `packages/core/test/generate.test.ts` |
| New API shape, typed client generation, bad boundary response | Existing Protocol/Server contract owners; regenerated Client checks |
| Generic selection capability lifecycle | Existing App extension-host component tests if that boundary gains a new contract; not a duplicate of side-panel e2e behavior |
| No timeline regression | Existing production tab benchmarks and selection/scroll stability scenarios; no machine-dependent pass/fail timing threshold |

Each new test must name the observable contract, a credible regression, and why an existing test does not already catch it. Preserve old `/btw` isolation and non-admission assertions while intentionally replacing assertions that prohibit a follow-up input. Follow Playwright's locator, isolation, auto-waiting, and web-first assertion guidance; no timing sleeps or test-only production hooks.

### Commands established by manifests/source (not run here)

- Repository root: `bun run check`; `bun run lint:changed` when GUI extensions change.
- Each affected package: `bun typecheck`.
- `packages/core`: `bun run test test/session-generate.test.ts test/generate.test.ts`.
- `packages/app`: `bun run test:unit`; `bun run test:e2e:built -- e2e/regression/btw-sidebar.spec.ts` plus the touched composer/timeline keepers.
- `packages/app`: `bun run bench:tabs` before and after, and relevant cases from `e2e/performance/timeline-stability/` using their own config.
- `packages/client`: `bun run generate` after public API changes.
- `packages/app`: `bun dev -- --port 4444` for local UI edits, targeting an isolated source backend. The repository guide names `bun dev serve --port 4096` from the root for that backend; check ports first and do not replace a live service.
- `packages/cli`: `bun run build -- --single` builds the host-platform CLI including web assets. Review its output-directory cleanup and dependency-install behavior before execution; use a dedicated build output.

## Remaining limitations

- No browser, build, tests, benchmarks, or packaged behavior was exercised. Bun and `agent-browser` were not found on PATH. Browser-specific selection behavior remains to be verified.
- Installed CLI `2.0.30` behavior has not been compared against this `2.0.28`-manifest checkout. Source findings are not claims about the installed build.
- Exact inside-response context clipping and memory-only lifetime require the product decisions above. The plan does not claim they already exist.
- The visible web UI is shared with desktop; changes must remain web-safe and avoid requiring desktop IPC even if the primary delivery target is `opencode serve`.

## Installed ChatGPT comparison addendum

The [artifact investigation](chatgpt-selection-side-chat.md) refines this plan without changing the user's requirements:

- Prefer an explicit structured quote/annotation model, preserving source identity and optional comment separately from the typed question, over forcing every quote into a generic note string.
- Let **Ask in side chat** attach and focus without sending; optionally reuse an existing compatible side thread and provide an explicit new-thread action. Do not reuse a thread with a different context policy/boundary silently.
- Include an explicit reference-only boundary instruction so inherited tasks, plans, tool calls, and approvals are not treated as active side-chat requests.
- Preserve the user's three context choices and earlier-response cutoff. They are not proven ChatGPT behavior: the traced local/work side-chat implementation requests latest-history inheritance, while ChatGPT's separate More details request leaves context assembly to its server.
- Keep OpenCode's initial tool-free/transient generation approach as a deliberate simplification. ChatGPT's ephemeral fork is not equivalent to OpenCode's existing durable fork, and its richer tool/voice/cloud machinery is outside this request.
- Treat close/discard failures honestly. Do not infer memory-only storage or remote deletion from the word temporary.

The comparison was static; no application/UI/runtime test was performed and no account data was inspected. Full artifact identity, REA Evidence IDs, byte locations, and limitations are in the linked report.
