# OpenCode baseline

## Installation-reliability follow-up

- Current maintained checkout: `/home/jose/code/MyOpenCode/opencode`, fork
  <https://github.com/JoseMorales7/MyOpenCode.git>, clean `main` at
  `ae31cd8cd8902f5aec1f3b1390768b0501f699f0` before this task. `origin/dev` is not present in this fork; no upstream reset,
  fetch, branch replacement, or application changes were performed for setup work.
- Upstream ancestry remains the OpenCode `2.0.28` source described below. The MyOpenCode branding and prior custom features
  are committed in this fork and must be preserved.
- User-reported failure: Bun `1.4.3` on Linux x64 cannot resolve the local workspace `@opencode/script` while running the
  CLI build with `--skip-install` on another checkout. That package is a CLI devDependency, linked by installing from the
  monorepo root. The build's version policy is `^1.4.2`, so Bun `1.4.3` is compatible.
- Setup now runs a frozen development workspace install before probing build-tool resolution, builds in a dedicated
  staging directory, verifies the resulting executable, then publishes the complete bundle to the launcher's canonical
  `myopencode-cli` location. Existing profiles and live services are out of scope.

## Source inspected for the web side-chat plan

- Repository: <https://github.com/anomalyco/opencode.git>
- Local checkout: `/home/jose/code/MyOpenCode/opencode`
- Branch: `dev`; local `origin/dev` points to the same commit.
- Commit: `73517183b3663ea3c525699baed724d4deca005a`
- Commit subject: `fix(plugin): keep each Promise hook rejection on its own tool call (#55263)`
- Root, App, CLI, Client, and Core manifests declare version `2.0.28`.
- Working tree was clean before and after source inspection.
- Required package manager: `bun@1.4.2`, from the root manifest. Bun is not on the current PATH.

Here, "baseline" means this commit, not the latest upstream release. No fetch or source update was performed.

The same commit and clean checkout were rechecked for the [consolidated implementation plan](implementation-plan.md).
Implementation subsequently proceeded on branch `quoted-side-chat`, without changing the pinned upstream commit or
updating the source manifests/lockfile. Bun 1.4.2 was located through its version-pinned npm package and dependencies
installed with the frozen lockfile.

The repository changes, checks, benchmark comparison, and isolated custom-CLI launch are recorded in
[implementation validation](../opencode/docs/quoted-side-chat-validation.md). The verified custom version is
`2.0.28-quoted-side-chat`; it has not replaced the installed executable.

A launcher was subsequently added at `opencode/script/run-custom-web.sh`, using the same source baseline and custom
artifact. It invokes the custom binary's foreground `serve` directly, defaults to loopback port 4097, and assigns separate
persistent config/data/cache/state/tmp directories. It does not replace the executable on PATH or use managed-service
discovery. The working implementation branch remains `quoted-side-chat`; earlier uncommitted feature changes were
preserved.

The MyOpenCode branding follow-up uses the same pinned commit and preserves the existing uncommitted custom-feature
and launcher work. Scope is the customized web app's title, install metadata, wordmarks, About identity, and launcher
messages. Package/import names, `opencode` CLI/API identifiers, provider product names, upstream legal attribution, and
existing profile/data paths are deliberately unchanged. A fresh production tab-switch baseline was recorded before
editing the new-session wordmark at `opencode/.cache/quoted-side-chat/branding-before.log`.

## Installed artifact

- CLI path previously resolved to `/home/jose/.opencode/bin/opencode`.
- `opencode --version` reported `opencode v2.0.30` during the initial discovery in this conversation.
- The installed CLI is not the same declared version as the inspected checkout. Its embedded web assets and API behavior have not been inspected or compared with source.

## Installed ChatGPT comparison target

- Debian package: `chatgpt`, version `26.1007.71326`, architecture `amd64`.
- Launcher: `/usr/bin/chatgpt` -> `/usr/lib/chatgpt/codex-launcher` -> `/usr/lib/chatgpt/ChatGPT`.
- App metadata: `codexAppBrand: chatgpt`, production flavor, build number `20398`.
- Packaged runtime metadata: Owl shell; package manifest declares Electron `42.3.0`. These are package declarations, not runtime execution observations or a signature verification.
- JavaScript artifact: `/usr/lib/chatgpt/resources/app.asar`, 563,980,723 bytes, 21,144 inventoried members.
- ASAR SHA-256: `676527450e8e1c8a700a88b625d2c741a89f8c623d54b3e652a472149a9c727a`.
- Comparison method: read-only static inspection of selected shipped JavaScript, with REA CLI 6.4.0 evidence. Original artifacts, account/profile data, and running applications were not modified.

See [ChatGPT selection and side-chat findings](investigations/chatgpt-selection-side-chat.md) for exact evidence scope, source ranges, limitations, and implications for the OpenCode plan.

## Scope and limitations

`implementation/` also contains OpenCode source, but the work uses the Git checkout in `opencode/` as the authoritative
source baseline. Implementation changes are confined to that checkout and project documentation. `implementation/`,
installed applications, user databases, credentials, and live services remain untouched. Packaging verification used a
fresh isolated profile and its own foreground server process.

The original OpenCode plan was source-based; implementation validation now includes build, test, benchmark, browser,
and packaged HTTP checks. The separate ChatGPT comparison remains a static shipped-JavaScript investigation; it does
not establish ChatGPT's runtime or remote-server behavior. No real provider-backed generation was performed during
validation.

See [the investigation and execution plan](investigations/web-selection-side-chat-plan.md).
