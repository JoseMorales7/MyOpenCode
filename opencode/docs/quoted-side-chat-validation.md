# Quoted side-chat implementation and validation

Implemented on branch `quoted-side-chat`, based on `origin/dev` commit
`73517183b3663ea3c525699baed724d4deca005a` (source manifests `2.0.28`). No upstream update, installation replacement,
database migration, or live-service restart was performed. Changes are uncommitted for review.

## Delivered

- Assistant-text selection toolbar: Ask here / Ask in side chat, without automatic submission.
- Structured, removable main-composer quotes with optional comments and source/rendered-text identity.
- Independent side dialogue with Conversation context / Selection only / Fresh question.
- Fixed inclusive source-message context, excluding later messages, compactions, and instruction updates.
- Follow-ups, isolated stop/retry, local reload restoration, and confirmation before forgetting a populated thread.
- Desktop and narrow-screen entry points that preserve the original mobile tabs and Open file control.
- Existing one-shot `/btw` command and its saved answers remain supported unchanged.
- Opt-in generation contracts and regenerated clients; normal generation defaults remain intact. The Promise client
  re-exports quote types without introducing a runtime Effect/Schema dependency into its lightweight entrypoint.

## Checks

| Check | Result |
| --- | --- |
| Root `bun run check` | Passed; all 36 package typecheck tasks succeeded. Existing warn-level repository lint findings remain. |
| Root `bun run lint:changed` | Passed, zero findings in touched GUI TypeScript files. |
| `packages/core`: focused generation tests | 9 passed, 0 failed. |
| `packages/schema`: full test suite | 70 passed, 0 failed. |
| `packages/app`: unit suite | 749 passed, 0 failed. |
| Built-App browser regression suites | 55 passed, 0 failed, no retries. |
| Generated-client repeat generation | Identical output hashes; no hand-edited generated files. |
| `git diff --check` | Passed. |

The browser run includes `btw-sidebar`, `composer`, `side-panels`, `timeline-history`, `timeline-cache`, and
`mobile-session`. It covers the old `/btw` behavior as well as new quote/context/follow-up/close flows. A new narrow-screen
case also guards return to the main composer after stopping/retrying a side request. That case caught and verified the
fix for retaining an enclosing Solid Match's tab getter beyond the mobile panel's lifetime.

Tests use isolated fixtures. Chromium `147.0.7727.15` was installed using Playwright's Ubuntu 24.04 fallback because the
host's Ubuntu 26.04 identifier is not yet supported. No provider credentials or real user conversations were used.

### Existing Client test failures

The complete Client suite reports **225 passed, 4 failed**. A separate clean detached worktree at the original upstream
commit reproduced the same four failures and the same 884 assertions:

- `public import boundaries > isolates each public entrypoint`: the Effect service bundle's eager Protocol inventory.
- `exposes every standard HTTP API group`: the existing `integration.connect.external` entry is absent from the expectation.
- `session methods use the public HTTP contract`: existing `interrupt?continue=true` expectation versus the current contract.
- `session methods retain decoded Effect inputs and outputs`: existing `idle` DateTime input expectation.

These upstream issues were not hidden by changing tests or unrelated client functionality. The temporary baseline
worktree was clean and removed afterward. The baseline was run before a harness restart; its temporary raw log is no
longer retained, but the matching failure names/counts were recorded during execution.

## Production performance comparison

Same `long-complex-markdown-v1` fixture: two 200-exchange sessions, 400 messages per session, 1440 x 900 viewport,
Chromium, routed fixture API, service workers blocked, review closed. Each scenario ran three times serially against a
production bundle. Medians in milliseconds:

| Scenario / metric | Before | After |
| --- | ---: | ---: |
| Cold: first correct observation | 154.3 | 151.8 |
| Cold: stable observation | 168.8 | 176.3 |
| Warm: first correct observation | 26.8 | 27.6 |
| Warm: stable observation | 62.9 | 64.5 |

These are small diagnostic samples, not a statistically powered performance guarantee. No machine-dependent threshold
was imposed. Before/after runs occurred across interrupted harness sessions, so machine-load variation cannot be
controlled retrospectively. The initial baseline's temporary raw files were cleared by a harness restart; the after-run
records are retained in `.cache/quoted-side-chat/performance-records.json`. No large regression signal was observed.

## Packaged CLI verification

The final host-platform CLI was built with web assets included, using Bun 1.4.2, local channel, and custom version
`2.0.28-quoted-side-chat`. Output:

```text
.cache/quoted-side-chat/cli/cli-linux-x64/bin/opencode
```

A fresh isolated HOME/config/data/cache/state profile was used to launch that binary's foreground `serve` on loopback
port 4525, then stop only that owned test process. Checks passed:

- Authenticated `/api/info` reported the custom version.
- The embedded HTML and its JavaScript entrypoint were served successfully.
- The running binary's OpenAPI exposed `sideChat` on both session and stateless generation payloads.

The installed OpenCode executable and elected background service were not replaced or restarted. This smoke test did not
make a paid/provider-backed generation request. Core tests inspect actual assembled model requests; the browser tests
drive the production frontend with deterministic API responses.

## Artifacts and remaining limits

### Launcher follow-up

`script/run-custom-web.sh` now launches the verified binary directly, without requiring Bun at runtime or falling back to
the installed executable. It binds loopback port 4097 by default and uses a separate persistent OpenCode profile. It
clears inherited database/config redirects, server passwords, and terminal handoff data before executing the server.
Provider environment variables and project configuration remain available; the profile is not a filesystem sandbox.

Launcher validation passed:

- `bash -n script/run-custom-web.sh`.
- `packages/cli`: `bun test test/custom-web-launcher.test.ts` — 2 tests, 16 assertions, no failures.
- `packages/cli`: `bun typecheck`.
- Real custom-binary launch through the script, in a project path containing spaces, with an isolated test profile on
  loopback port 4529. Authenticated info reported `2.0.28-quoted-side-chat`; embedded HTML was served. The test instance
  was stopped afterward. Evidence is retained in `.cache/quoted-side-chat/launcher-smoke.json`.

See [launch instructions](quoted-side-chat.md#launch-the-modified-web-application). No default user profile was created or
modified during the test, and no installed service was replaced or restarted.

Ignored local build/log artifacts are under `.cache/quoted-side-chat/`, including `check.log`, `lint-changed.log`,
`browser-tests.log`, `core-tests.log`, `schema-tests.log`, `app-tests.log`, `performance.log`, `cli-build.log`, and
`serve-smoke.json`. Synthetic wide/narrow screenshots are under `packages/app/e2e/test-results/`.

Context ends after the complete source message, not the exact selected word. Side dialogue is tool-free and does not
stream tokens in this first version. Its client-local contents survive reload until explicitly closed; this is not
memory-only storage or a promise about provider-side retention. See [usage and build instructions](quoted-side-chat.md).
