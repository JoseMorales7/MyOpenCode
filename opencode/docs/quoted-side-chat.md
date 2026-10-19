# MyOpenCode: quoted questions and temporary side chats

MyOpenCode customizes OpenCode's web application; it is not an official OpenCode release. The custom name changes web
branding only. CLI/package identifiers and the launcher's existing persistent profile paths remain unchanged, so the
rename does not move or reset your data.

See [implementation validation](quoted-side-chat-validation.md) for test results, known upstream test failures, and the
verified custom CLI artifact. **New side chat** is available in the session header/command palette; on narrow screens,
use the existing More menu without changing the original Session/Changes tabs.

## Use

### Launch the modified web application

From the checkout, run:

```sh
./script/run-custom-web.sh
```

From the parent `MyOpenCode` directory, use `./opencode/script/run-custom-web.sh` instead. Open
**http://127.0.0.1:4097** after the CLI reports it is listening. If prompted, use username `opencode` and the server
password the CLI prints. The launcher stays in the foreground; **Ctrl+C** stops only that instance. It does not open a
browser or stop/restart the installed background service.

The default executable is the verified Linux x64 custom build in
`.cache/quoted-side-chat/myopencode-cli/cli-linux-x64/bin/opencode`. No global `opencode` or Bun executable is needed to run an already
built binary. If it is missing, the launcher prints the build command instead of silently using the installed CLI.

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

Source baseline: commit `73517183b3663ea3c525699baed724d4deca005a`, manifests `2.0.28`, Bun `1.4.2`. Use the existing lockfile.
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
