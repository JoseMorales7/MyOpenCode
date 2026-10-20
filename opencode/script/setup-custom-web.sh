#!/usr/bin/env bash
set -euo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cache="$repo/.cache/quoted-side-chat"
destination="$cache/myopencode-cli"
build_options=()

usage() {
  cat <<'HELP'
Usage: setup-custom-web.sh [--baseline]

Install this checkout's workspace dependencies, build MyOpenCode's web app and
host CLI, and verify the executable before replacing the launcher's custom build.
Run from any directory. Requires Bash, Git, and a compatible Bun on PATH.

  --baseline   Build the upstream baseline variant for an older x64 CPU.
  -h, --help   Show help without installing or building anything.

No global executable, provider profile, or running service is changed.
Dependency installation and builds can require network access and disk space.
Logs, failed build output, and the previous successful bundle are kept under
.cache/quoted-side-chat/. Re-running setup repeats the frozen workspace install.
HELP
}

fail() {
  printf 'Setup failed: %s\n' "$*" >&2
  exit 1
}

while (($#)); do
  case "$1" in
    --baseline) build_options=(--baseline) ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s (see --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

[[ -f "$repo/package.json" && -f "$repo/bun.lock" && -f "$repo/packages/script/package.json" ]] ||
  fail "Use a full MyOpenCode source checkout, including bun.lock and packages/script."
command -v bun >/dev/null 2>&1 || fail "Bun is not on PATH. Install Bun from https://bun.sh and re-run this script."
command -v git >/dev/null 2>&1 || fail "Git is required to install the checkout's dependencies."
[[ -z "${BUN_COMPILE_RELEASE:-}" ]] || command -v unzip >/dev/null 2>&1 ||
  fail "unzip is required when BUN_COMPILE_RELEASE is set."

cd -- "$repo"
printf '[1/4] Checking Bun and the source checkout...\n'
# Use only Bun built-ins: @opencode/script cannot be imported until workspaces are installed.
if ! version="$(bun -e '
  const pkg = await Bun.file("package.json").json()
  const expected = pkg.packageManager?.match(/^bun@(.+)$/)?.[1]
  if (!expected || !Bun.semver.satisfies(Bun.version, "^" + expected)) {
    console.error(`This checkout requires Bun ^${expected ?? "unknown"}; found ${Bun.version}.`)
    process.exit(1)
  }
  console.log(pkg.version + "-quoted-side-chat")
')"; then
  fail "Select a compatible Bun version on PATH and re-run setup."
fi

if ((${#build_options[@]})); then
  if ! target="$(bun -e '
    if (process.arch !== "x64") {
      console.error("--baseline is only supported for x64 hosts.")
      process.exit(1)
    }
    console.log("opencode-" + (process.platform === "win32" ? "windows" : process.platform) + "-x64-baseline")
  ')"; then
    fail "Cannot select a baseline target for this host."
  fi
  # Upstream --single --baseline includes multiple variants; select exactly the requested host variant.
  build_options=("--target=$target")
fi

mkdir -p -- "$cache"
run="$(mktemp -d "$cache/setup.XXXXXX")"
printf 'Setup logs and build output: %s\n' "$run"
printf '[2/4] Installing all workspace dependencies from %s...\n' "$repo"
# Build tools such as @opencode/script are devDependencies; do not inherit production-only installation.
if ! NODE_ENV=development bun install --frozen-lockfile 2>&1 | tee "$run/install.log"; then
  fail "Workspace installation failed. Check network access, permissions, and disk space; see $run/install.log. The existing custom build was not replaced."
fi

cd -- "$repo/packages/cli"
if ! bun -e 'Bun.resolveSync("@opencode/script", process.cwd()); Bun.resolveSync("@opentui/solid/bun-plugin", process.cwd())' >"$run/workspace-check.log" 2>&1; then
  fail "The CLI build workspaces are still unavailable after installation. Use the full checkout and a development install; see $run/install.log and $run/workspace-check.log. The existing build was not replaced."
fi

printf '[3/4] Building the custom CLI with embedded web assets...\n'
# --skip-install skips the upstream build's extra cross-platform install, not the workspace install above.
if ! OPENCODE_CHANNEL=local OPENCODE_VERSION="$version" bun run build -- --single --skip-install "${build_options[@]}" --outdir="$run/build" 2>&1 | tee "$run/build.log"; then
  fail "The build failed; see $run/build.log. Dependencies were installed and can be reused on the next attempt. The existing custom build was not replaced."
fi

printf '[4/4] Verifying the built executable...\n'
candidates=()
while IFS= read -r -d '' file; do candidates+=("$file"); done < <(
  find "$run/build" -type f \( -path '*/bin/opencode' -o -path '*/bin/opencode.exe' \) -print0
)
((${#candidates[@]} == 1)) || fail "Expected one host executable, found ${#candidates[@]}. Inspect $run/build; the existing build was not replaced."
candidate="${candidates[0]}"
if ! "$candidate" --version >"$run/verify.log" 2>&1; then
  fail "The executable cannot run on this host; see $run/verify.log. On an older x64 CPU, try --baseline. The existing build was not replaced."
fi
reported="$(cat "$run/verify.log")"
[[ "$reported" == *"$version"* ]] || fail "The built executable reported an unexpected version; see $run/verify.log. The existing build was not replaced."
printf '%s\n' "${candidate#"$run/build/"}" > "$run/build/launcher-path"

# Keep the complete bundle, not just the binary: packaged artifacts can have supporting files.
if [[ -e "$destination" || -L "$destination" ]]; then
  mv -- "$destination" "$run/previous" || fail "Cannot preserve the existing custom bundle; it was not replaced."
fi
if ! mv -- "$run/build" "$destination"; then
  if [[ -e "$run/previous" || -L "$run/previous" ]]; then
    mv -- "$run/previous" "$destination" || fail "Cannot publish the new bundle or restore the previous one. The previous bundle is at $run/previous."
  fi
  fail "Cannot publish the new custom bundle. Check permissions and disk space."
fi

printf '\nMyOpenCode %s is ready.\n' "$version"
printf 'Build: %s\nLogs: %s\n' "$destination" "$run"
if [[ -e "$run/previous" || -L "$run/previous" ]]; then
  printf 'Previous bundle retained at: %s\n' "$run/previous"
fi
printf 'Start it with:\n  %q\n' "$repo/script/run-custom-web.sh"
