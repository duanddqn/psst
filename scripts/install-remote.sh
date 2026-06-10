#!/usr/bin/env bash
# install-remote.sh — Build psst for Linux and install on a remote machine via SSH
#
# Usage:
#   ./install-remote.sh <vault> [arch] [install-dir]
#
# The vault must have SSH_IP, SSH_USER, SSH_PASS secrets.
# After install, psst is available at install-dir on the remote machine.
#
# arch:        arm64 (default), arm, x64
# install-dir: ~/.local/bin (default)

set -e

VAULT="${1:?Usage: $0 <vault> [arch] [install-dir]}"
ARCH="${2:-arm64}"
INSTALL_DIR="${3:-~/.local/bin}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.."

declare -A TARGETS=(
    [arm64]="bun-linux-arm64"
    [arm]="bun-linux-arm"
    [x64]="bun-linux-x64"
)

BUN_TARGET="${TARGETS[$ARCH]}"
if [[ -z "$BUN_TARGET" ]]; then
    echo "Unknown arch '$ARCH'. Supported: arm64, arm, x64" >&2
    exit 1
fi

BINARY="psst-linux-$ARCH"
LOCAL_BINARY="$SCRIPT_DIR/$BINARY"

echo "Building psst for $BUN_TARGET..."
(cd "$BUILD_DIR" && bun build --compile --target="$BUN_TARGET" src/main.ts --outfile "scripts/$BINARY")

echo "Uploading and installing on remote ($VAULT)..."

psst "$VAULT" run python -c "
import paramiko, os, stat

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(os.environ['SSH_IP'], username=os.environ['SSH_USER'], password=os.environ['SSH_PASS'])

sftp = ssh.open_sftp()
sftp.put('$LOCAL_BINARY', '/tmp/psst')
sftp.close()

install_dir = '$INSTALL_DIR'
_, out, err = ssh.exec_command(f'mkdir -p {install_dir} && mv /tmp/psst {install_dir}/psst && chmod +x {install_dir}/psst && {install_dir}/psst --version')
print(out.read().decode().strip())
e = err.read().decode().strip()
if e: print(e)

ssh.close()
"

echo "psst installed at $INSTALL_DIR/psst on remote."

# Clean up local build artifact
rm -f "$LOCAL_BINARY"
