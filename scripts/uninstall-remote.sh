#!/usr/bin/env bash
# uninstall-remote.sh — Remove psst from a remote machine via SSH
#
# Usage:
#   ./uninstall-remote.sh <vault> [install-dir]
#
# install-dir: ~/.local/bin (default)

set -e

VAULT="${1:?Usage: $0 <vault> [install-dir]}"
INSTALL_DIR="${2:-~/.local/bin}"

echo "Removing psst from remote ($VAULT)..."

psst "$VAULT" run python -c "
import paramiko, os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(os.environ['SSH_IP'], username=os.environ['SSH_USER'], password=os.environ['SSH_PASS'])

_, out, err = ssh.exec_command('rm -f $INSTALL_DIR/psst && echo removed')
print(out.read().decode().strip())
e = err.read().decode().strip()
if e: print(e)

ssh.close()
"

echo "psst removed from $INSTALL_DIR on remote."
