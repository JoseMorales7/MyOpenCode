# MyOpenCode: quoted questions and temporary side chats

MyOpenCode customizes OpenCode's web application; it is not an official OpenCode release. The custom name changes web
branding only. CLI/package identifiers and the launcher's existing persistent profile paths remain unchanged, so the
rename does not move or reset your data.

See [implementation validation](quoted-side-chat-validation.md) for test results, known upstream test failures, and the
verified custom CLI artifact. **New side chat** is available in the session header/command palette; on narrow screens,
use the existing More menu without changing the original Session/Changes tabs.

## Use

### Install or rebuild from a source checkout

Install [Bun](https://bun.sh) and Git first. This checkout accepts **Bun `^1.4.2`, including 1.4.3**; setup checks the
manifest's version requirement before installing anything. Use a full checkout, not just `packages/cli`.

From the repository root (the directory containing `package.json`, `bun.lock`, and `packages/`):

```sh
./script/setup-custom-web.sh
./script/run-custom-web.sh
```

Both scripts locate the checkout from their own paths, so they also work when invoked from another directory. If your
layout puts this checkout inside an `opencode/` directory, use `./opencode/script/setup-custom-web.sh` and
`./opencode/script/run-custom-web.sh` from its parent.

If copied source files have lost their executable permissions, prefix either script command with `bash`.

Setup performs a frozen **development** dependency install at the monorepo root, verifies that the CLI can resolve its
workspace build tools, builds the CLI **with** embedded web assets in a staging directory, and checks the executable's
version. Only then does it publish the complete bundle to `.cache/quoted-side-chat/myopencode-cli`. The launcher reads the
recorded executable path, including a baseline build's different target folder. An existing ordinary Linux x64 bundle
without setup metadata still works.

Install/build/verification failures leave the current custom bundle untouched. Setup prints the location of its logs and
keeps partial output for diagnosis. Re-running setup repeats the frozen install, repairing missing workspace links. A
successful replacement retains the previous bundle at the printed backup path. These generated staging/backup folders
can be removed after checking the new build if disk space is needed; they are separate from your persistent profile.

For an older x64 CPU whose executable cannot run:

```sh
./script/setup-custom-web.sh --baseline
```

Network access, permissions, native-runtime compatibility, and free disk space can still cause failures; setup reports
them rather than claiming success or discarding the last build. It does not install over a global CLI, start a server,
change provider profiles, or restart a service.

#### Fixing `Cannot find module '@opencode/script'`

`@opencode/script` lives in this repository at `packages/script`; it is a CLI **devDependency**. That error means the CLI
cannot resolve the workspace, commonly because the root install was skipped or dependencies were installed for production
only. **Do not run `bun add @opencode/script`** or edit imports to work around it.

The supported repair is `./script/setup-custom-web.sh`. If doing the steps manually, install from the repository root
first:

```sh
NODE_ENV=development bun install --frozen-lockfile
```

Only after that succeeds can the CLI build use `--skip-install`. That build flag skips the upstream build's additional
cross-platform package install; it does **not** replace the initial workspace install. If the frozen install fails,
inspect the printed install log and check that the manifests and `bun.lock` belong to the same checkout rather than
silently updating the lockfile.

### Launch the modified web application

From the checkout, run:

```sh
./script/run-custom-web.sh
```

From the parent `MyOpenCode` directory, use `./opencode/script/run-custom-web.sh` instead. Open
**http://127.0.0.1:4097** after the CLI reports it is listening. If prompted, use username `opencode` and the server
password the CLI prints. The launcher stays in the foreground; **Ctrl+C** stops only that instance. It does not open a
browser or stop/restart the installed background service.

The default bundle is `.cache/quoted-side-chat/myopencode-cli`, populated by setup. No global `opencode` or Bun executable
is needed to run an already built binary. If it is missing, the launcher directs you to setup instead of silently using
the installed CLI.

```sh
./script/run-custom-web.sh --port 4098 /path/to/project
./script/run-custom-web.sh --profile /path/to/separate-profile
./script/run-custom-web.sh --help
```

The project argument sets the server's working directory; select/open a project in the web UI as needed. Each launch uses
a separate, persistent OpenCode profile under `${XDG_DATA_HOME:-$HOME/.local/share}/opencode-quoted-side-chat` unless
`--profile` is supplied. Configuration, sessions, cache, and state do not use the installed instance's directories. No
credentials or conversations are copied, so you may need to configure providers in this profile. Provider API-key
environment variables and project configuration still apply. This is profile isolation, **not** a filesystem sandbox.

You can also run the built executable's `serve` command directly, but then you must choose its profile/environment and
port yourself. The launcher is the safer way to keep it separate from your installed version.

### Quoted questions

Select prose or code in an assistant response:

- **Ask here** attaches a removable quotation to the main composer without replacing its draft. Click the quote card to
  add a comment, then type/send your question normally.
- **Ask in side chat** attaches the passage and focuses an independent composer. It does not send automatically. A
  compatible selection-only side thread can be reused; **New side chat** always starts another thread.

Before the first side-chat request, choose:

| Mode                 | Context supplied                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Conversation context | Main history through the captured source message, quotes, and this side thread's messages |
| Selection only       | Quotes and this side thread's messages, without main-chat history                         |
| Fresh question       | Only this side thread's messages, without main-chat history or quotes                     |

The conversation boundary includes the complete source response, not an exact cutoff at the highlighted word. It excludes
later messages and later compaction summaries. Selecting an unfinished response supports Selection only; conversation
context requires a settled boundary. Current provider/model configuration still applies.

Mode and boundary are fixed after sending. Start another side thread to change them. Side chats are text-only: they do
not admit main-session prompts, execute tools, modify files, or change the main session's model. Stop/retry acts on the
side request only. Closing a populated side thread asks for confirmation.

Side threads are kept in this client's local storage until closed, including across reloads. This is **not** memory-only
or a guarantee about provider-side retention. Existing one-shot `/btw question` behavior and saved answers remain intact.

## Develop and validate

Original source baseline: commit `73517183b3663ea3c525699baed724d4deca005a`, manifests `2.0.28`. Use the existing lockfile and
the compatible Bun version reported by setup. The original feature verification used Bun 1.4.2; setup also accepts 1.4.3.
The installed CLI may be a different version; editing this tree does not update its embedded web assets.

Run from `packages/core`:

```sh
bun run test test/session-generate.test.ts test/generate.test.ts
```

Run from `packages/app`:

```sh
bun run test:unit
bun run test:e2e:built -- e2e/regression/btw-sidebar.spec.ts
```

Run `bun run check` from the repository root and `bun run generate` from `packages/client` after public API changes.
Tests themselves run from their package directories, not the root. The tests use isolated fixtures and do not require
provider credentials or the user's live conversations.

For local UI development, use separate source backend and App dev servers as described in `packages/app/AGENTS.md`.
Choose unused ports and isolated application data; never replace or restart an existing live service to test this feature.

A host CLI build (`bun run build -- --single` from `packages/cli`) embeds the web application. Review its output cleanup
and install behavior first. Validate that built binary's `serve` command with isolated data before considering deployment.
Do not overwrite the installed CLI or replace the live service as part of building this checkout.
