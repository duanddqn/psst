# install-remote.ps1 — Build psst for Linux and install on a remote machine via SSH
#
# Usage:
#   .\install-remote.ps1 -Vault fiora
#   .\install-remote.ps1 -Vault fiora -InstallDir /usr/local/bin -Arch arm64
#
# The vault must have SSH_IP, SSH_USER, SSH_PASS secrets.
# After install, psst is available system-wide on the remote machine.

param(
    [Parameter(Mandatory)][string]$Vault,
    [ValidateSet("arm64", "arm", "x64")]
    [string]$Arch = "arm64",
    [string]$InstallDir = "~/.local/bin"
)

$targets = @{
    "arm64" = "bun-linux-arm64"
    "arm"   = "bun-linux-arm"
    "x64"   = "bun-linux-x64"
}

$bunTarget = $targets[$Arch]
$binary    = "psst-linux-$Arch"
$buildDir  = "$PSScriptRoot\.."

# Build psst for the target platform
Write-Host "Building psst for $bunTarget..." -ForegroundColor Cyan
Push-Location $buildDir
bun build --compile --target=$bunTarget src/main.ts --outfile "scripts/$binary"
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
Pop-Location

Write-Host "Uploading and installing on remote ($Vault)..." -ForegroundColor Cyan

$localBinary = "$buildDir\scripts\$binary"

psst $Vault run python -c @"
import paramiko, os, stat

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(os.environ['SSH_IP'], username=os.environ['SSH_USER'], password=os.environ['SSH_PASS'])

sftp = ssh.open_sftp()
sftp.put(r'$($localBinary -replace '\\', '/')', '/tmp/psst')
sftp.close()

install_dir = '$InstallDir'
_, out, err = ssh.exec_command(f'mkdir -p {install_dir} && mv /tmp/psst {install_dir}/psst && chmod +x {install_dir}/psst && {install_dir}/psst --version')
print(out.read().decode().strip())
e = err.read().decode().strip()
if e: print(e)

ssh.close()
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host "psst installed at $InstallDir/psst on remote." -ForegroundColor Green
} else {
    Write-Error "Installation failed."
}

# Clean up local build artifact
Remove-Item $localBinary -ErrorAction SilentlyContinue
