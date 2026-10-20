import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const setup = path.resolve(import.meta.dir, "../../../script/setup-custom-web.sh")

describe.skipIf(process.platform === "win32")("custom web setup", () => {
  test("installs development workspaces from the repository root before building and publishes the complete verified bundle", async () => {
    const root = await fixture()
    try {
      const result = run(root)
      expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
      const calls: { args: string[]; cwd: string; mode?: string }[] = (
        await Bun.file(path.join(root, "calls.jsonl")).text()
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      const install = calls.find((call) => call.args[0] === "install")
      expect(install).toMatchObject({ cwd: root, args: ["install", "--frozen-lockfile"], mode: "development" })
      const build = calls.find((call) => call.args[0] === "run")
      expect(build?.cwd).toBe(path.join(root, "packages/cli"))
      expect(build?.args).toContain("--skip-install")
      expect(calls.indexOf(install!)).toBeLessThan(calls.indexOf(build!))
      const bundle = path.join(root, ".cache/quoted-side-chat/myopencode-cli")
      expect(await Bun.file(path.join(bundle, "launcher-path")).text()).toBe("cli-linux-x64/bin/opencode\n")
      expect(await Bun.file(path.join(bundle, "support.txt")).text()).toBe("new supporting files")
      const previous = result.stdout.match(/Previous bundle retained at: (.+)/)?.[1]
      expect(previous).toBeDefined()
      expect(await Bun.file(path.join(previous!, "previous.txt")).text()).toBe("previous working bundle")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  for (const failure of ["install", "links", "build", "verify"]) {
    test(`keeps the previous bundle and reports the failure when ${failure} fails`, async () => {
      const root = await fixture()
      try {
        const result = run(root, failure)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain("Setup failed:")
        expect(result.stderr).toContain(".log")
        expect(await Bun.file(path.join(root, ".cache/quoted-side-chat/myopencode-cli/previous.txt")).text()).toBe(
          "previous working bundle",
        )
        expect(await Bun.file(path.join(root, ".cache/quoted-side-chat/myopencode-cli/launcher-path")).exists()).toBe(
          false,
        )
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    })
  }

  test.skipIf(process.arch !== "x64")(
    "records the baseline executable path without assuming the ordinary x64 target",
    async () => {
      const root = await fixture()
      try {
        expect(run(root, "", ["--baseline"]).code).toBe(0)
        expect(await Bun.file(path.join(root, ".cache/quoted-side-chat/myopencode-cli/launcher-path")).text()).toBe(
          `cli-${process.platform}-x64-baseline/bin/opencode\n`,
        )
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    },
  )
})

function run(root: string, failure = "", args: string[] = []) {
  const result = Bun.spawnSync(["bash", path.join(root, "script/setup-custom-web.sh"), ...args], {
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      PATH: `${root}/tools:${process.env.PATH}`,
      NODE_ENV: "production",
      SETUP_FIXTURE_ROOT: root,
      SETUP_FAILURE: failure,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode setup space "))
  await Promise.all(
    ["script", "packages/cli", "packages/script", "tools", ".cache/quoted-side-chat/myopencode-cli"].map((directory) =>
      fs.mkdir(path.join(root, directory), { recursive: true }),
    ),
  )
  await fs.copyFile(setup, path.join(root, "script/setup-custom-web.sh"))
  await Bun.write(path.join(root, "package.json"), JSON.stringify({ version: "2.0.28", packageManager: "bun@1.4.2" }))
  await Bun.write(path.join(root, "bun.lock"), "fixture lockfile")
  await Bun.write(
    path.join(root, "packages/script/package.json"),
    JSON.stringify({ name: "@opencode/script", exports: "./index.js" }),
  )
  await Bun.write(path.join(root, "packages/script/index.js"), "export const Script = {}")
  await Bun.write(path.join(root, ".cache/quoted-side-chat/myopencode-cli/previous.txt"), "previous working bundle")
  await Bun.write(
    path.join(root, "tools/bun"),
    `#!${process.execPath}
import fs from "node:fs/promises"
import path from "node:path"
const args = process.argv.slice(2)
const root = process.env.SETUP_FIXTURE_ROOT
const failure = process.env.SETUP_FAILURE
await fs.appendFile(path.join(root, "calls.jsonl"), JSON.stringify({ args, cwd: process.cwd(), mode: process.env.NODE_ENV }) + "\\n")
if (args[0] === "-e") {
  const result = Bun.spawnSync([process.execPath, ...args], { cwd: process.cwd(), env: process.env, stdout: "inherit", stderr: "inherit" })
  process.exit(result.exitCode)
}
if (args[0] === "install") {
  if (failure === "install") process.exit(17)
  if (failure !== "links") {
    const modules = path.join(root, "packages/cli/node_modules")
    await fs.mkdir(path.join(modules, "@opencode"), { recursive: true })
    await fs.symlink(path.join(root, "packages/script"), path.join(modules, "@opencode/script"))
    await fs.mkdir(path.join(modules, "@opentui/solid"), { recursive: true })
    await fs.writeFile(path.join(modules, "@opentui/solid/package.json"), JSON.stringify({ name: "@opentui/solid", exports: { "./bun-plugin": "./plugin.js" } }))
    await fs.writeFile(path.join(modules, "@opentui/solid/plugin.js"), "export default {}")
  }
  process.exit(0)
}
if (args[0] === "run") {
  if (failure === "build") process.exit(23)
  const out = args.find((arg) => arg.startsWith("--outdir=")).slice("--outdir=".length)
  const selected = args.find((arg) => arg.startsWith("--target="))
  const target = selected ? selected.slice("--target=".length).replace(/^opencode-/, "cli-") : "cli-linux-x64"
  const binary = path.join(out, target, "bin/opencode")
  await fs.mkdir(path.dirname(binary), { recursive: true })
  await fs.writeFile(binary, "#!" + process.execPath + "\\n" + (failure === "verify" ? "process.exit(19)\\n" : "console.log(" + JSON.stringify("opencode v" + process.env.OPENCODE_VERSION) + ")\\n"))
  await fs.chmod(binary, 0o700)
  await fs.writeFile(path.join(out, "support.txt"), "new supporting files")
  process.exit(0)
}
process.exit(31)
`,
  )
  await fs.chmod(path.join(root, "tools/bun"), 0o700)
  return root
}
