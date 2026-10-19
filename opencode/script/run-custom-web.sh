#!/usr/bin/env bash
set -euo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
binary="$repo/.cache/quoted-side-chat/myopencode-cli/cli-linux-x64/bin/opencode"
profile="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-quoted-side-chat"
project="$PWD"
port=4097
directory_set=false

usage() {
  cat <<'HELP'
Usage: run-custom-web.sh [options] [PROJECT_DIRECTORY]

Run MyOpenCode's web app as a separate foreground server.

  --port PORT       Loopback port (default: 4097).
  --profile DIR     Persistent, separate MyOpenCode config/data/cache/state directory.
                    Default: $XDG_DATA_HOME/opencode-quoted-side-chat, or
                    ~/.local/share/opencode-quoted-side-chat.
  --binary FILE     Use another explicitly selected custom build.
  -h, --help        Show this help without starting a server.

Open the printed URL in a browser. If prompted, use username "opencode" and
the server password printed by the CLI. Ctrl+C stops this foreground instance.
Providers may need configuring in this separate profile. Existing environment
provider keys and project configuration can still apply; this is not a sandbox.
HELP
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 2
}

while (($#)); do
  case "$1" in
    --port|--profile|--binary)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --port) port="$2" ;;
        --profile) profile="$2" ;;
        --binary) binary="$2" ;;
      esac
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      (($# <= 1)) || die "Expected at most one project directory"
      if (($#)); then
        [[ "$directory_set" == false ]] || die "Expected one project directory"
        project="$1"
      fi
      break
      ;;
    -*) die "Unknown option: $1 (see --help)" ;;
    *)
      [[ "$directory_set" == false ]] || die "Expected one project directory"
      project="$1"
      directory_set=true
      shift
      ;;
  esac
done

[[ "$port" =~ ^[0-9]{1,5}$ ]] || die "Port must be a number from 1 to 65535"
port=$((10#$port))
((port >= 1 && port <= 65535)) || die "Port must be from 1 to 65535"
[[ -n "$profile" ]] || die "Profile directory cannot be empty"
[[ -d "$project" ]] || die "Project directory does not exist: $project"
[[ "$profile" == /* ]] || profile="$PWD/$profile"
[[ "$binary" == /* ]] || binary="$PWD/$binary"

if [[ ! -f "$binary" || ! -x "$binary" ]]; then
  printf 'Custom executable not found: %s\n' "$binary" >&2
  printf 'Install this checkout\047s dependencies with Bun 1.4.2, then build it:\n\n' >&2
  printf '  cd %q\n' "$repo/packages/cli" >&2
  printf '  OPENCODE_CHANNEL=local OPENCODE_VERSION=2.0.28-quoted-side-chat bun run build -- --single --skip-install --outdir=%q\n' "$repo/.cache/quoted-side-chat/myopencode-cli" >&2
  exit 1
fi

# Do not inherit a database/config redirect, server credential, or terminal handoff
# from another instance. Provider API-key environment variables remain available.
unset OPENCODE_DB OPENCODE_CONFIG OPENCODE_CONFIG_CONTENT OPENCODE_TEST_HOME
unset OPENCODE_PASSWORD OPENCODE_SERVER_PASSWORD OPENCODE_PTY_HANDOFF
export XDG_CONFIG_HOME="$profile/config"
export XDG_DATA_HOME="$profile/data"
export XDG_CACHE_HOME="$profile/cache"
export XDG_STATE_HOME="$profile/state"
export OPENCODE_CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
export TMPDIR="$profile/tmp"

previous_umask="$(umask)"
umask 077
mkdir -p -- "$OPENCODE_CONFIG_DIR" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$TMPDIR"
umask "$previous_umask"
cd -- "$project"

printf 'Starting MyOpenCode at http://127.0.0.1:%s\n' "$port"
printf 'Profile: %s\nWorking directory: %s\n' "$profile" "$PWD"
printf 'The installed CLI and its background service are not replaced. Press Ctrl+C to stop.\n\n'
exec "$binary" serve --hostname 127.0.0.1 --port "$port"
