# Installed ChatGPT: selected text and temporary side conversations

## Outcome and scope

The installed application contains a reusable text-selection overlay, structured quotation/annotation state, a temporary side-thread lifecycle, and a distinct ChatGPT **More details** sidebar request. These are related mechanisms, not one interchangeable API.

The useful model for OpenCode is **selection -> structured context attachment -> independent side conversation**, not selection -> immediately send a one-shot prompt. The traced local/work-thread path can reuse an open side chat and forks current history when it creates one. It does not establish the user's requested cutoff at an older selected response.

This is static analysis of the installed Linux package, not a UI recording or a reconstruction of OpenAI's servers. No account data, conversation databases, credentials, or browser profile were read. ChatGPT was not launched, attached, clicked, or restarted. No application source or installed artifacts were changed.

## Artifact identity

See [upstream.md](../upstream.md) for the OpenCode baseline and installed ChatGPT identity.

- Package/version: `chatgpt` / `26.1007.71326`; package metadata identifies OpenAI as maintainer, without independently proving publisher authenticity.
- Package manifest: `openai-codex-electron`, production build `20398`; Linux branding metadata specifies `chatgpt`.
- Runtime declarations: Owl / Electron `42.3.0`.
- Original artifact: `/usr/lib/chatgpt/resources/app.asar`.
- SHA-256: `676527450e8e1c8a700a88b625d2c741a89f8c623d54b3e652a472149a9c727a`.
- Size: 563,980,723 bytes; inventory: 21,144 members. No non-dependency application `.map` members were found in this inventory; source-map footer references are not recovered source maps.

## REA workflow and retained evidence

REA tools were not connected in this OpenCode session. `rea-agents@6.4.0 doctor --client opencode --json` reported missing OpenCode MCP registration and stale skill identity. No registration repair, configuration write, native-engine installation, or skill replacement was attempted. The existing npm-cached REA CLI supported static JavaScript analysis, so the investigation continued through that route. The initial `npx` diagnostic may populate npm's package cache.

This CLI does not advertise `source_paths` or summary detail on application analysis. Rather than analyze the entire 564 MB ASAR, a read-only ASAR member reader inventoried the package and copied selected members to a new analysis directory. Selected members preserve their paths, SHA-256 values, original offsets, and declared-integrity checks. Large bundles were inspected through additional unmodified contiguous function excerpts with byte-range provenance. No app code was executed.

Working evidence directory: `/tmp/opencode/chatgpt-analysis.KaxgXf/`.

| Reference | REA Evidence ID | Scope and limitation |
| --- | --- | --- |
| A1 | `ev_2f603c10ba2ff4da501f27a36328feac3bf3d98b29b1863058aec8f7cced0d17` | `rea-selected-app.json`: nine exact installed members, 176,993 bytes; eight JS files parsed, no parse failures. Application graph partial; semantic graph budget exhaustion reported for the conversation-runtime member. Outside dependencies remain unresolved. |
| A2 | `ev_32417174d77da79a862b470308ecbc4bf10dd6cd7bedd0386857b08f4e7f9d7f` | `rea-focused-fragments.json`: thirteen provenance-linked function excerpts, 35,308 bytes, no parse failures. Complete syntax-graph coverage only for those excerpts; semantic coverage unknown because original bundle bindings/dependencies are outside the derived tree. |

REA's root hashes identify the selected/derived analysis trees, not the original ASAR. The original ASAR identity above and `selection-manifest.json` / `focused-fragment-manifest.json` link the evidence back to installed bytes. Do not present A2 as a whole-app call-graph reconstruction. Behavioral conclusions below come from reading the actual syntax and checking relevant import/export aliases in the original bundled files.

Other retained files: `artifact-identity.json`, `asar-inventory.json`, `feature-search-index.json`, `evidence-summary.json`, and `supplemental-static-locations.json`. Proprietary extracted JavaScript and large generated Evidence remain outside the repository.

## Findings

### 1. Selection is a first-class UI capability

**Observed in packaged syntax (A2, `selection-geometry.js`, `selection-overlay.js`):**

- Uses browser `Selection` and a cloned DOM `Range`, with extracted selected text and a source target identity.
- Rejects selections crossing different eligible targets and selections inside editable content. The ChatGPT view additionally checks that selection is within one assistant Markdown message and excludes special writing/learning/editable/copy-excluded elements.
- Anchors the toolbar using visible selection rectangles, intersects ancestor scroll clipping, accounts for zoom/RTL, and clamps horizontal position within the viewport.
- Handles selection changes, pointer gestures, keyboard changes, scroll, and resize, with animation-frame scheduling and cleanup.
- Contributes actions only when their callbacks are available. Bundled labels include **Ask ChatGPT**, **Add to chat**, **More details**, **Ask in side chat**, **Comment**, and **Edit**; not every surface necessarily exposes all of them.

**Implementation lesson:** use one active-surface selection controller and callback-based actions. Do not add independent selection listeners to every virtualized row.

### 2. Quotes and comments are structured, separate from the typed request

**Observed (A2, `response-selection-anchor.js`, `response-annotation-state.js`, `chat-quote-attachment-state.js`; supplemental manual inspection of the shared prompt serializer):**

- The response-annotation path stores selected text, optional annotation/comment, a message ID, a DOM text locator, and optional message-relative rendered-text offsets.
- Its locator records a selector, start/end offsets, and the range text. This is rendered DOM text positioning, not raw Markdown source positioning.
- Add/edit/remove operations update a dedicated `responseTextAnnotations` collection; they do not replace the composer's typed prompt.
- The ChatGPT quote path has a separate attachment shape: ID, text, optional source, `sourceMessageId`, and `sourceOccurrence`. The occurrence index distinguishes repeated matching phrases within a response.
- The shared local/work prompt serializer presents response annotations as a structured array containing text/comment/source, with the user's request kept separately. Ordinary selected-text attachments have their own context section.

**Implementation lesson:** introduce an explicit quote/annotation model in OpenCode, reusing existing attachment UI where appropriate. Preserve source identity, quote text, and user comment independently; do not merely paste a blockquote into the prompt or misrepresent it as a file attachment.

### 3. Ask in side chat attaches; it does not necessarily send or create a new chat

**Observed (A2, `selection-to-side-thread.js`; supplemental `xYr` inspection):**

- The callback receives selected text.
- It searches the right and bottom panels, preferring the active tab, for an eligible existing side chat. It can also attach to a still-loading side chat through its provisional client-thread identity.
- It creates a side chat only if no eligible one is found.
- It queues a selected-text attachment into that side chat and focuses its composer. The attachment helper does not submit a model request.

**Implementation lesson:** separate **add selection to side chat** from **send question**. An explicit new-side-chat action can coexist with reuse of an existing thread; context mode/boundary must remain visible to prevent accidental reuse of an incompatible thread.

### 4. The local/work side chat is an ephemeral child conversation

**Observed (A2, `side-context-creation.js`, `fork-dispatch.js`, `side-thread-lifecycle.js`; A1, `side-chat-composer`):**

- The ordinary local creation path asks the conversation manager to fork with `ephemeral: true`, `sideConversation: true`, and parent navigation metadata.
- That call supplies no `targetTurnId`. The fork dispatcher therefore selects `forkConversationFromLatest`, not a fork at the highlighted source message.
- It has its own conversation identity, tab identity, history, composer, loading/failure presentation, and later messages. The bundled composer also renders an expired-side-chat state.
- A different cloud-host path creates a side conversation and injects reference context rather than using that same local fork implementation. Those paths must not be conflated.
- The creation instructions explicitly mark inherited history as reference-only: do not resume old tasks, requests, approvals, tool calls, or plans. Only requests made within the side conversation are active.
- Those instructions permit non-mutating inspection and potentially available tools; they prohibit workspace mutation unless newly requested. This is not the same as a hard no-tools generation path.

**Inference:** the intent is lightweight exploration with independent execution state. The static client code does not prove server enforcement, memory-only retention, absence of logs, or every permission/cancellation property.

**Implementation lesson:** adopt the explicit side-conversation boundary instruction even if OpenCode uses simpler tool-free generation instead of a fork. OpenCode's existing durable `Session.fork` is not a drop-in equivalent to this ephemeral fork.

### 5. Temporary means explicit lifecycle, not just a hidden ordinary chat

**Observed (A2, `side-thread-lifecycle.js`, plus close-confirmation syntax in the original app-initial bundle):**

- A side-tab close can ask for confirmation before losing its conversation; the bundled dialog warns that the chat cannot be recovered and offers a preference to skip future confirmations.
- The close path handles active voice, requests ephemeral voice-history cleanup, and calls `discardConversationFromCache` for the side conversation.
- If cleanup fails, it can restore the side tab rather than falsely presenting the conversation as discarded.
- There is special recovery logic for an interrupted remote ephemeral side conversation, including transfer of cached history into a replacement conversation as reference-only context.

**Unknown:** actual server storage lifetime, whether all chat content survives process/app restart, deletion beyond app cache, and provider-side retention. An `ephemeral` flag and a discard request are not proof that no bytes were ever stored.

### 6. ChatGPT More details is a separate server-backed path

**Observed (A2, `chat-selection-actions.js`, `chat-more-details-request.js`):**

- In the regular ChatGPT conversation view, an eligible assistant selection can expose **More details**, behind feature gates.
- Its request includes source conversation ID, source message ID, the selected-text query, locale, and category `ask_sidebar`.
- The request builder sends these as conversation/message references and `ask_sidebar_params`. It does not send a client-built full historical transcript in this traced request.

**Unknown:** what the remote service actually retrieves, whether it clips at the source message or selected passage, model/system prompt construction, and retention. No authenticated requests were made or captured.

**Important distinction:** source-message references used to explain a passage are not evidence that the local ephemeral-side-chat path uses that same context boundary.

## Source locations

All ranges below are zero-based UTF-8 byte ranges, end-exclusive, within the named original ASAR member. Function names are build-local minified names, not stable APIs.

| Original member | Range | Excerpt / owner |
| --- | --- | --- |
| `webview/assets/app-primary-5f3a759d18a6.js` | 925120–929419 | Selection geometry helpers, starting `I9e` |
| same | 929419–940728 | Selection overlay/action composition, starting `W9e` |
| same | 1307728–1308967 | Selected text -> side thread, `idt` and wrapper |
| same | 1218808–1219861 | Side initial-prompt handling, `Gct` |
| `webview/assets/chatgpt-conversation-page-8d29b61da77d.js` | 31532–31661 | Repeated-selection occurrence, `um` |
| same | 78966–82057 | ChatGPT selection validation/actions, `Eg` / `jg` |
| `webview/assets/app-initial-17317d71fd80.js` | 9492484–9495539 | DOM quote locators, `aec` / `xec` |
| same | 3763409–3763905 | Annotation add/edit/remove, `SYr` / `CYr` / `wYr` / `TYr` |
| same | 2168902–2169052 | ChatGPT quote attachment fields, `ISn` |
| same | 8784023–8787195 | Local ephemeral side creation/reference instructions, `QOs` |
| same | 8794248–8799945 | Side opening/close/cleanup, `Sks` / `Eks` |
| same | 5391985–5392785 | Latest-versus-turn fork dispatch, `psa` |
| same | 4522617–4523435 | More details request fields, `Qwi` |
| same | 3763290–3763409 | Supplemental selected-text attachment helper, `xYr` |
| `webview/assets/app-shared-6fc3d63f0486.js` | 3028216–3035062 | Supplemental context serialization, `Icn` |

The three large members' SHA-256 values matched their ASAR-declared integrity hashes:

- app-initial: `3cec672b3ffa028c5e7d47eab4198ef0102bd04955e45282154de8aa3f840ce1`
- app-primary: `c741541b60fc5f876244b1e43e914c26f5b33dfd8f4be6f11d0bd4b2817f8e8b`
- app-shared: `e24dc1a9e516fb12b36edfe2ae984185ca1238787fcc19938501a097b1acd06c`

## Recommended changes to the OpenCode plan

Keep the user's requirements, not every ChatGPT implementation detail:

1. **Adopt:** source-aware structured quotes, optional comments, and the selection-toolbar pattern.
2. **Adopt:** attaching selections without auto-sending, with an independent side composer.
3. **Adopt:** reusing a compatible existing side thread, with an explicit way to start another. Unlike blind reuse, compatibility must include the selected context mode and source boundary.
4. **Adopt:** explicit reference-only treatment of inherited history and honest close/cleanup/error behavior.
5. **Keep as a user-specific enhancement:** Conversation / Selection only / Fresh context choices and the older-response cutoff. They were not established as a selector in the traced ChatGPT paths. The local creation path instead requests latest-history inheritance.
6. **Keep as a deliberate OpenCode simplification:** tool-free transient generation, unless agentic side chats are separately requested. Do not recreate ChatGPT's entire local/cloud execution environment, voice recovery, or durable-route framework.
7. **Do not reuse OpenCode's durable fork blindly:** retain the planned non-admitting side-thread model, or design a genuine ephemeral backend abstraction if server-owned side threads become necessary. A normal fork followed by attempted deletion is not equivalent.

An internal OpenCode model should therefore distinguish a **Quote** (source identity + text + locator + optional comment), a **SideThread** (context policy + fixed source boundary + independent messages/draft), and **Generation** (isolated request/cancellation/error state). These are design recommendations informed by evidence, not recovered OpenCode or ChatGPT source interfaces.

## Checklist and remaining questions

| Question | Status |
| --- | --- |
| Which installed application/version was inspected? | Answered by package/artifact identity; publisher signature not checked. |
| How is selected text detected and anchored? | Answered for traced shipped UI paths. |
| How are quote/comment and normal prompt separated? | Answered for traced ChatGPT attachment and local annotation paths. |
| Does selection automatically send? | Traced Ask in side chat path attaches and focuses; no send in that callback. Other entry points can send initial prompts. |
| How does temporary side-thread creation/close work? | Partially answered: client fork/start/discard logic, not remote enforcement or physical retention. |
| Does it inherit exactly through the selected message? | Not established for More details; local side creation explicitly chooses latest history. |
| Does this build offer all three requested context modes? | Not established by these bounded traces; no whole-app negative claim. |
| Does the user's account expose these exact buttons/flags? | Unresolved: no runtime observation. |

If runtime confirmation is wanted, the next step is a user-approved demonstration using a synthetic conversation and the relevant UI surface, with an explicitly supplied/debuggable target or a redacted recording. Do not read existing conversation history or capture authenticated traffic by default. No REA reconnection or configuration changes are required for the static findings above.
