import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const launcher = path.resolve(import.meta.dir, "../../../script/run-custom-web.sh")

describe.skipIf(process.platform === "win32")("custom web launcher", () => {
  test("offers help and rejects invalid arguments without starting a server", async () => {
    expect((await launch(["--help"])).stdout).toContain("separate foreground server")
    for (const args of [["--port"], ["--port", "0"], ["--port", "65536"], ["--port", "abc"], ["--unknown"]]) {
      const result = await launch(args)
      expect(result.code).toBe(2)
      expect(result.stderr).toContain("Error:")
    }
    const missing = await launch(["--binary", "/nonexistent/custom-opencode"])
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain("Custom executable not found")
    expect(missing.stderr).toContain("setup-custom-web.sh")
  })

  test("uses the installed bundle's recorded executable path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-web-recorded-"))
    try {
      const repo = path.join(root, "checkout")
      const bundle = path.join(repo, ".cache/quoted-side-chat/myopencode-cli")
      await fs.mkdir(path.join(repo, "script"), { recursive: true })
      await fs.copyFile(launcher, path.join(repo, "script/run-custom-web.sh"))
      await fs.mkdir(path.join(bundle, "cli-linux-x64-baseline/bin"), { recursive: true })
      await Bun.write(path.join(bundle, "launcher-path"), "cli-linux-x64-baseline/bin/opencode\n")
      await Bun.write(
        path.join(bundle, "cli-linux-x64-baseline/bin/opencode"),
        "#!/usr/bin/env bash\nprintf 'RECORDED CUSTOM BUILD\\n'\n",
      )
      await fs.chmod(path.join(bundle, "cli-linux-x64-baseline/bin/opencode"), 0o700)
      const child = Bun.spawnSync(
        ["bash", path.join(repo, "script/run-custom-web.sh"), "--profile", path.join(root, "profile")],
        { stdout: "pipe", stderr: "pipe" },
      )
      expect(child.exitCode).toBe(0)
      expect(child.stdout.toString()).toContain("RECORDED CUSTOM BUILD")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test("executes the chosen build in the project with isolated profile paths and no inherited service credentials", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-web-launcher-"))
    try {
      const project = path.join(root, "project with spaces")
      const profile = path.join(root, "separate profile")
      const binary = path.join(root, "custom build")
      await fs.mkdir(project)
      await Bun.write(
        binary,
        `#!${process.execPath}\nconsole.log("LAUNCHED " + JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), config: process.env.OPENCODE_CONFIG_DIR, data: process.env.XDG_DATA_HOME, cache: process.env.XDG_CACHE_HOME, state: process.env.XDG_STATE_HOME, tmp: process.env.TMPDIR, db: process.env.OPENCODE_DB ?? null, password: process.env.OPENCODE_PASSWORD ?? null, legacy: process.env.OPENCODE_SERVER_PASSWORD ?? null, file: process.env.OPENCODE_CONFIG ?? null, inline: process.env.OPENCODE_CONFIG_CONTENT ?? null, handoff: process.env.OPENCODE_PTY_HANDOFF ?? null }))\n`,
      )
      await fs.chmod(binary, 0o700)
      const result = await launch(["--binary", binary, "--profile", profile, "--port", "04097", project], {
        OPENCODE_DB: "/do-not-use/live.db",
        OPENCODE_PASSWORD: "do-not-inherit",
        OPENCODE_SERVER_PASSWORD: "legacy-do-not-inherit",
        OPENCODE_CONFIG: "/do-not-use/config.json",
        OPENCODE_CONFIG_CONTENT: "{}",
        OPENCODE_PTY_HANDOFF: "do-not-inherit",
      })
      expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
      expect(result.stdout).toContain("Starting MyOpenCode at http://127.0.0.1:4097")
      const line = result.stdout.split("\n").find((line) => line.startsWith("LAUNCHED "))
      expect(line).toBeDefined()
      expect(JSON.parse(line!.slice("LAUNCHED ".length))).toEqual({
        args: ["serve", "--hostname", "127.0.0.1", "--port", "4097"],
        cwd: project,
        config: path.join(profile, "config/opencode"),
        data: path.join(profile, "data"),
        cache: path.join(profile, "cache"),
        state: path.join(profile, "state"),
        tmp: path.join(profile, "tmp"),
        db: null,
        password: null,
        legacy: null,
        file: null,
        inline: null,
        handoff: null,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

async function launch(args: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn(["bash", launcher, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code }
}
