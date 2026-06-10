# uninstall-remote.ps1 — Remove psst from a remote machine via SSH
#
# Usage:
#   .\uninstall-remote.ps1 -Vault fiora
#   .\uninstall-remote.ps1 -Vault fiora -InstallDir /usr/local/bin

param(
    [Parameter(Mandatory)][string]$Vault,
    [string]$InstallDir = "~/.local/bin"
)

Write-Host "Removing psst from remote ($Vault)..." -ForegroundColor Cyan

psst $Vault run python -c @"
import paramiko, os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(os.environ['SSH_IP'], username=os.environ['SSH_USER'], password=os.environ['SSH_PASS'])

_, out, err = ssh.exec_command('rm -f $InstallDir/psst && echo removed')
print(out.read().decode().strip())
e = err.read().decode().strip()
if e: print(e)

ssh.close()
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host "psst removed from $InstallDir on remote." -ForegroundColor Green
} else {
    Write-Error "Uninstall failed."
}
