# psst 🤫

[![Tests](https://img.shields.io/github/actions/workflow/status/Michaelliv/psst/ci.yml?label=Tests&color=brightgreen)](https://github.com/Michaelliv/psst/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/Michaelliv/psst/branch/main/graph/badge.svg?token=DTPTV090HF)](https://codecov.io/gh/Michaelliv/psst) [![License](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)

**Because your agent doesn't need to know your secrets.**

---

## The Hall of Shame

I keep pasting API keys into Claude Code. Or just letting it `cat .env`. Every time I tell myself I'll stop doing that. I never do.

```bash
# "just read the .env"
cat .env

# "here, use this key"
sk-live-4wB7xK9mN2pL8qR3...
```

Your secrets are now:
- 📜 In the model's context window
- 📟 In your terminal history
- 📁 In that log file you forgot about
- 🎓 Training data (maybe?)
- 📸 Screenshot material for your coworker's Slack

**There's a better way.**

---

## What if agents could *use* secrets without *seeing* them?

```bash
# Agent writes this:
psst STRIPE_KEY -- curl -H "Authorization: Bearer $STRIPE_KEY" https://api.stripe.com

# What the agent sees:
# ✅ Command executed successfully

# What actually ran:
# curl -H "Authorization: Bearer sk_live_abc123..." https://api.stripe.com
```

The secret never touches the agent's context. It's injected into the subprocess environment at runtime.

**The agent orchestrates. psst handles the secrets.**

---

## Storage backends

psst supports pluggable storage backends. Pick the one that fits your environment:

| Backend   | Storage                          | Best for                               |
|-----------|----------------------------------|----------------------------------------|
| `sqlite`  | Local encrypted SQLite DB        | Laptops, dev machines (default)        |
| `aws`     | AWS Secrets Manager              | EC2 / headless / shared team secrets   |
| `restapi` | Centralized psst-server (HTTP)   | Home labs, shared across machines      |

### SQLite (local, encrypted)

```
psst init                              # OS keychain for key storage (default)
psst init --key-backend sqlite         # Password-protected key (no OS keychain required)
```

This is what you get out of the box: a local SQLite DB encrypted with AES-256-GCM, with the key stored in your OS keychain (or `PSST_PASSWORD` as a fallback in headless environments).

Use `--key-backend sqlite` on machines without a keychain (e.g. Windows headless, Docker) — psst will prompt for a password on first use and store the encrypted key alongside the vault.

```bash
# Full example
psst init --global --key-backend sqlite
psst set API_KEY                       # prompts for password once, then value
psst list
psst run python app.py
```

### AWS Secrets Manager

When you're running on EC2 with an IAM role, or you want secrets shared across machines, use the AWS backend:

```
psst init --backend aws --aws-region us-east-1
psst init --backend aws --aws-region us-east-1 --aws-prefix psst/
psst init --backend aws --aws-region us-east-1 --aws-profile my-profile
```

This writes a `config.json` into the vault directory:

```json
{
  "backend": "aws",
  "aws": {
    "region": "us-east-1",
    "prefix": "psst/"
  }
}
```

From then on, every `psst set`, `psst get`, `psst list`, `psst run`, `psst SECRET -- cmd`, etc. transparently uses AWS Secrets Manager instead of SQLite. **Same commands, different storage.**

**What you get with the AWS backend:**
- 🔐 Encryption at rest via AWS KMS (no local key management)
- 📜 Native version history (via AWS versioning) — `psst history` and `psst rollback` both work
- 🏷️  Tags synced to AWS resource tags (`psst:tag:<name>`) — filter server-side or client-side
- 👥 Shared access via IAM — team members with the right role see the same vault
- 🤖 Zero-config auth on EC2 (instance profile) or via `AWS_PROFILE`

**Configuration resolution:**
- `aws.region` → `AWS_REGION` → `AWS_DEFAULT_REGION` (first non-empty wins)
- `aws.prefix` → defaults to `psst/`
- `aws.profile` → default credential provider chain if unset

**Multi-tenant safety:** psst tags every secret it creates with `psst:managed=true` and filters listings by that tag + your configured prefix, so it won't touch or list secrets in your AWS account that weren't created by psst.

**Failure mode:** if AWS is unreachable, psst fails fast — it does not fall back to a local cache. No stale secrets.

### REST API (psst-server)

A lightweight alternative to heavy central secret stores (HashiCorp Vault, AWS Secrets Manager). Run `psst-server` — a single self-contained binary — on any machine, and point all your clients at it. No infrastructure, no cloud account, no agents to manage.

Pair with [Tailscale](https://tailscale.com) or [WireGuard](https://www.wireguard.com) for secure access across machines without exposing the server to the internet — just use the VPN IP as the `--rest-url`.

#### Server setup

Deploy `psst-server` (ASP.NET Core, self-contained binary) on your server. Config lives at `~/.psst-server/appsettings.json`:

```json
{
  "ApiKey": "your-api-key",
  "DbPath": "/home/user/.psst-server/secrets.db",
  "Urls": "http://0.0.0.0:5000"
}
```

See [`server/README.md`](server/README.md) for build and deploy instructions.

#### Client setup (proxy mode)

```bash
# Point all psst commands at the server (persists to ~/.psst/psst.json)
psst proxy enable --rest-url http://192.168.1.10:5000 --api-key <key>

# Verify
psst proxy status
```

#### Daily use

Once proxy is enabled, all commands work exactly as normal — they just hit the server:

```bash
psst set API_KEY secret123             # stored on server
psst get API_KEY                       # retrieved from server
psst list                              # list secrets on server
psst list vaults                       # list vaults on server
psst run python app.py                 # secrets injected from server

# Vault namespacing
psst --vault prod set DB_URL postgres://...
psst prod list
psst prod run ./deploy.sh
```

#### Toggle proxy on/off

The URL and API key are always saved — disable/enable just toggles routing:

```bash
psst proxy disable    # fall back to local vaults
psst proxy enable     # back to server (no need to re-enter url/key)
psst proxy status     # show current state
```

**Server down?** Disable the proxy and use a local vault as a fallback — your credentials stay intact and re-enabling is one command when the server comes back.

```bash
psst proxy disable
psst set API_KEY secret123    # stored locally while server is down
psst proxy enable             # back to server when it's up
```

---

## For Humans

You set up psst once. Then your agent handles the rest.

### Installation

```bash
npm install -g psst-cli
```

### Setup (one-time)

```bash
# Create vault (stores encryption key in your OS keychain)
psst init

# Add your secrets
psst set STRIPE_KEY          # Interactive prompt, value hidden
psst set OPENAI_API_KEY
psst set DATABASE_URL

# Verify
psst list
```

That's it.

### Managing Secrets

```bash
psst set <NAME>               # Add/update secret (interactive)
psst set <NAME> value         # Set inline
psst set <NAME> --stdin       # Pipe value in (for scripts)
psst get <NAME>               # View value (debugging only)
psst list                     # List all secret names
psst rm <NAME>                # Delete secret
```

Secret names are always stored uppercase — `psst set stripe_key` saves as `STRIPE_KEY`.

#### Array and object values

```bash
psst set HOSTS "[server1,server2,server3]"       # string array → JSON
psst set WEIGHTS "[1, 2.5, 0.8]"                 # number array → JSON
psst set CONFIG '{"host":"db","port":5432}'       # object → JSON
psst set MIXED '[1, "hello", 12.8]'              # mixed types → JSON
```

Values that start with `[` or `{` are parsed and stored as compact JSON.

#### Import/Export

```bash
psst import .env                        # Import from .env file
psst import <vault> .env                # Import into specific vault
psst import --stdin                     # Import from stdin
psst import --from-env                  # Import from environment variables
psst export                             # Export to stdout (.env format)
psst export <vault>                     # Export specific vault to stdout
psst export --env-file .env             # Export to file
psst export <vault> --env-file .env     # Export specific vault to file
```

### Vaults

Organize secrets by project or environment:

```bash
psst init --vault prod        # Create vault named "prod"
psst init --global            # Create global vault (~/.psst/)

# Vault shorthand — two equivalent forms:
psst prod list                # psst <vault> <cmd>
psst list prod                # psst <cmd> <vault>  (list/export/import only)

psst prod set API_KEY         # Set in prod vault
psst prod run ./deploy.sh     # Run with prod secrets
psst @prod list               # Force global vault lookup

# List all vaults
psst list vaults
```

Vaults are stored at `~/.psst/envs/<name>/` (global) or `.psst/envs/<name>/` (local).

### Global Flags

All commands support:
```bash
-g, --global                  # Use global vault (~/.psst/)
--vault <name>                # Use specific vault
--tag <name>                  # Filter by tag (repeatable)
--json                        # Structured JSON output
-q, --quiet                   # Suppress output, use exit codes
```

### Local vs Global Vaults

By default, psst creates a **local vault** in your project directory:

```bash
psst init                     # Creates .psst/ in current directory
psst init --env dev           # Creates .psst/envs/dev/ in current directory
```

For user-wide secrets, use the global vault:

```bash
psst init --global            # Creates ~/.psst/
psst --global set API_KEY     # Store in global vault
psst --global list            # List global secrets
```

### Secret Scanning

Prevent accidentally committing secrets to git:

```bash
# Scan files for leaked secrets
psst scan                     # Scan all tracked files
psst scan --staged            # Scan only git staged files
psst scan --path ./src        # Scan specific directory
```

The scanner checks for **actual vault secret values** — no regex false positives. If a secret is found:

```
✗ Secrets found in files:

  config.js:12
    Contains: STRIPE_KEY

Found 1 secret(s) in 1 file(s)
```

### Secret History & Rollback

Accidentally overwritten a secret? psst keeps the last 10 versions automatically.

```bash
# View version history
psst history API_KEY

# History for API_KEY
#
# ● current (active)
# ● v2  01/15/2026 14:30
# ● v1  01/10/2026 09:15
#
# 2 previous version(s)
#   Rollback: psst rollback API_KEY --to <version>

# Restore a previous version
psst rollback API_KEY --to 1
# ✓ Rolled back API_KEY to v1
```

Rollback is reversible — the current value is archived before restoring, so you can always undo.

### Secret Tags

Organize secrets with tags for easier management:

```bash
# Add tags when setting secrets
psst set AWS_KEY --tag aws --tag prod
psst set STRIPE_KEY --tag payments --tag prod

# Manage tags on existing secrets
psst tag DB_URL prod                  # Add tag
psst untag DB_URL dev                 # Remove tag

# List secrets filtered by tag
psst list --tag aws                   # Only aws-tagged secrets
psst list --tag prod                  # Only prod-tagged secrets

# Run commands with tagged secrets only
psst --tag aws -- aws s3 ls           # Inject only aws-tagged secrets
psst --tag prod run ./deploy.sh       # Run with only prod secrets
```

Tags use OR logic when filtering — `psst list --tag aws --tag payments` returns secrets with either tag.

---

## For Agents

**You don't read secrets. You use them.**

### The Simple Way

```bash
psst run <command>
```

This injects **all** vault secrets into the command's environment. You never see the values.

```bash
# Run any command with all secrets available
psst run ./deploy.sh
psst run python my_script.py
psst run docker-compose up
```

### Specific Secrets

If you only need certain secrets:

```bash
psst <SECRET_NAME> [SECRET_NAME...] -- <command>
```

```bash
# Single secret
psst STRIPE_KEY -- curl -H "Authorization: Bearer $STRIPE_KEY" https://api.stripe.com

# Multiple secrets
psst AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY -- aws s3 ls
```

### What You Get Back

- Exit code of the command
- stdout/stderr of the command (with secrets automatically redacted)
- **Not** the secret value

Secrets are automatically replaced with `[REDACTED]` in command output. Use `--no-mask` if you need to see the actual output for debugging.

### Checking Available Secrets

```bash
psst list                     # See what's available
psst list --json              # Structured output
```

### If a Secret is Missing

psst will automatically check environment variables as a fallback. If neither the vault nor the environment has the secret, the command will fail.

Ask the human to add it:
> "I need `STRIPE_KEY` to call the Stripe API. Please run `psst set STRIPE_KEY` to add it."

---

## How It Works

```
┌───────────────────────────────────────────────────────┐
│  Agent Context                                        │
│                                                       │
│  "I need to deploy the app"                           │
│  > psst run ./deploy.sh                               │
│                                                       │
│  [Command executed, exit code 0]                      │
│                                                       │
│  (Agent never sees any secret values)                 │
└───────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────┐
│  psst                                                 │
│                                                       │
│  1. Retrieve encryption key from OS Keychain          │
│  2. Decrypt STRIPE_KEY from local vault               │
│  3. Inject into subprocess environment                │
│  4. Execute: curl ... (with $STRIPE_KEY expanded)     │
│  5. Return exit code to agent                         │
└───────────────────────────────────────────────────────┘
```

**Security model:**
- Secrets encrypted at rest (AES-256-GCM)
- Encryption key stored in OS Keychain (macOS Keychain, libsecret, Windows Credential Manager)
- Secrets automatically redacted in command output (`[REDACTED]`)
- Secrets never exposed to agent context
- Zero friction for legitimate use

---

## SDK

psst is also a library. Requires Bun runtime.

```typescript
import { Vault } from "psst-cli";

// Pass the key directly — no unlock step, no keychain, no env vars
const vault = new Vault("/path/to/.psst", { key: "your-secret-key" });

// Read and write secrets
await vault.setSecret("API_KEY", "sk-live-abc123", ["prod"]);
const secret = await vault.getSecret("API_KEY");
const all = vault.listSecrets();

// History and rollback
const history = vault.getHistory("API_KEY");
await vault.rollback("API_KEY", 1);

vault.close();
```

Create a new vault programmatically:

```typescript
import { Vault } from "psst-cli";

const vaultPath = "/app/.psst";
await Vault.initializeVault(vaultPath, { skipKeychain: true });

const vault = new Vault(vaultPath, { key: "your-secret-key" });
await vault.setSecret("DB_URL", "postgres://...");
vault.close();
```

Works in Docker, CI, or anywhere — no OS keychain required.

---

## CI / Headless Environments

When keychain isn't available, use the `PSST_PASSWORD` environment variable:

```bash
export PSST_PASSWORD="your-master-password"
psst STRIPE_KEY -- ./deploy.sh
```

---

## FAQ

**Q: Why not just use environment variables?**

Because `export STRIPE_KEY=sk_live_...` puts the secret:
- In your shell history
- In your agent's context (if it ran the export)
- Visible to `env` and `printenv`

psst keeps secrets out of the agent's context entirely.

**Q: Why not use a .env file?**

.env files are fine for local dev, but:
- Agents can `cat .env` and see everything
- Easy to accidentally commit
- No encryption at rest

**Q: Is this like HashiCorp Vault?**

Vault is for teams and infrastructure. psst is for your laptop and your AI agent. Different tools, different problems.

**Q: What if the agent runs `psst get STRIPE_KEY`?**

It'll print the value. That's a feature for human debugging. If you're worried, don't give your agent shell access. But honestly, if an agent has shell access, it can already do much worse things.

**Q: How is the encryption key stored?**

In your OS keychain:
- **macOS**: Keychain.app (unlocked when you log in)
- **Linux**: libsecret / gnome-keyring
- **Windows**: Credential Manager

---

## Philosophy

- **Local-first**: Your secrets never leave your machine. No cloud, no sync, no account.
- **Agent-first**: Designed for AI agents to use, not just humans.
- **Zero friction**: No passwords to type (keychain handles it).
- **Single binary**: Works everywhere Bun runs.

---

## Development

```bash
# Install dependencies
bun install

# Run locally
bun run src/main.ts --help

# Build single binary
bun run build
```

---

## License

MIT

---

<p align="center">
  <b>psst</b> — <i>because your agent doesn't need to know your secrets</i>
</p>
