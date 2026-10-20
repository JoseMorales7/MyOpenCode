# MyOpenCode workspace installation repair

## Baseline and reported failure

The maintained fork was clean on `main` at `ae31cd8cd8902f5aec1f3b1390768b0501f699f0` before this task. Its source remains
OpenCode `2.0.28` with the committed MyOpenCode features and branding. No source update or upstream branch replacement
was performed. See [upstream.md](../upstream.md).

On another Linux x64 checkout, the user reported Bun `1.4.3` failing to import `@opencode/script` from
`packages/cli/script/build.ts` while invoking the raw build with `--single --skip-install`.

`@opencode/script` is a local workspace at `packages/script`, declared as a CLI devDependency. It must be linked by the
monorepo's dependency installation before the build's static imports can resolve. The `--skip-install` flag controls an
additional cross-platform install inside the builder; it does not bootstrap the workspace. The build's Bun policy is
`^1.4.2`, so Bun `1.4.3` is supported rather than the cause of this missing-module error.

## Implementation

- Added `opencode/script/setup-custom-web.sh`, which locates the source root independently of the caller's directory.
- Uses only Bun built-ins for the initial version check, before importing any missing workspace tooling.
- Runs `NODE_ENV=development bun install --frozen-lockfile` at the root, then probes build-tool resolution from the CLI
  package without evaluating `@opencode/script` and its release/version side effects.
- Builds the complete custom CLI and embedded web assets into a dedicated staging directory. A failed dependency install,
  unresolved workspace, failed build, or unusable executable does not replace the current custom bundle.
- Checks the candidate executable's version before publishing; preserves the previous bundle at a printed backup path.
- Writes `launcher-path` metadata so `run-custom-web.sh` uses the installed target rather than assuming a fixed CPU variant.
  Existing ordinary Linux x64 bundles without metadata and explicit `--binary` overrides remain supported.
- `--baseline` chooses an explicit upstream host target. Inspection showed upstream `--single --baseline` can include
  several variants, so passing those flags alone would not reliably produce one host executable.
- Updated the launcher's missing-binary message, README, and usage guide to direct users through setup, not a raw build
  that assumes dependencies are already installed.

Setup does not write a global executable, start/restart a server, copy credentials, or change provider profiles. Existing
application functionality, dependency manifests, and the lockfile were not changed. Generated staging directories and
logs are intentionally retained under the ignored `.cache/quoted-side-chat/` path; a network or host-runtime failure is
still possible and is reported rather than hidden.

## Validation

- Bash syntax validation passed for setup and launcher.
- With Bun `1.4.3`, the focused CLI suites passed **9 tests / 51 assertions**. They cover installation from a different
  directory and a checkout path containing spaces, forcing development dependencies despite an inherited production
  environment, build order, preserving an existing bundle through four failure phases, publishing supporting files,
  selecting a baseline executable, and loading its recorded path from the launcher.
- Ran the real setup with Bun `1.4.3` and `NODE_ENV=production` inherited: the frozen root workspace install, resolver
  probes, web/CLI build, executable verification, and publication all succeeded. It reported custom version
  `2.0.28-quoted-side-chat` and retained the previous build.
- The root `bun run check` passed after the changes. `git diff --check` passed.
- Logs for the actual run are in `opencode/.cache/quoted-side-chat/setup-verification.log` and the printed
  `setup.qvuetJ/` directory. Final check output is in `opencode/.cache/quoted-side-chat/setup-check-final.log`.

The full native build was validated on Linux x64. The baseline variant's selection is regression-tested with a controlled
builder; this follow-up did not run a second native baseline build or start the web server. No inspection of the failing
remote machine or its files was performed.
