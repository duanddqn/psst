#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import { exec } from "./commands/exec.js";
import { exportSecrets } from "./commands/export.js";
import { get } from "./commands/get.js";
import { history } from "./commands/history.js";
import { importSecrets } from "./commands/import.js";
import { init } from "./commands/init.js";
import { list } from "./commands/list.js";
import { listEnvs } from "./commands/list-envs.js";
import { rm } from "./commands/rm.js";

import { rollback } from "./commands/rollback.js";
import { run } from "./commands/run.js";
import { scan } from "./commands/scan.js";
import { set } from "./commands/set.js";
import { tag, untag } from "./commands/tag.js";
import { passwd } from "./commands/passwd.js";
import { reinit } from "./commands/reinit.js";
import { proxy } from "./commands/proxy.js";
import { loadPsstConfig } from "./vault/psst-config.js";
import { Vault } from "./vault/vault.js";

const KNOWN_COMMANDS = new Set([
  "init", "reinit", "passwd", "change-password", "proxy",
  "set", "get", "list", "rm", "remove", "delete",
  "import", "export", "scan", "tag", "untag",
  "history", "rollback", "run",
]);

const HELP = `
psst - AI-native secrets manager

VAULT MANAGEMENT
  psst init                                  Create local vault (.psst/)
  psst init --global                         Create global vault (~/.psst/)
  psst init --vault <name>                   Create vault with given name
  psst init --backend aws                    Create vault backed by AWS Secrets Manager
  psst init --backend aws --aws-region us-east-1 --aws-prefix psst/
  psst init --backend restapi --rest-url http://localhost:5000 [--rest-api-key <key>]
  psst init --key-backend sqlite             Use password-protected sqlite keystore (no OS keychain)
  psst reinit                                Drop and re-initialize a vault (secrets lost)
  psst rm vault <name>                       Delete a local vault
  psst rm vault @<name>                      Delete a global vault
  psst passwd                                Change sqlite keystore password
  psst list vaults                           List available vaults

SECRET MANAGEMENT
  psst set <NAME> [VALUE]       Set secret (prompt if no value)
  psst set <NAME> --stdin       Set secret from stdin
  psst set <NAME> --tag <t>     Set secret with tags (repeatable)
  psst get <NAME>               Get secret value (human debugging)
  psst list                     List secret names
  psst list --tag <t>           List secrets with tag (repeatable)
  psst rm item <NAME>           Remove secret
  psst rm <NAME>                Remove secret (shorthand)
  psst tag <NAME> <t1> [t2...]  Add tags to secret
  psst untag <NAME> <t1>...     Remove tags from secret
  psst history <NAME>           Show version history for secret
  psst rollback <NAME> --to N   Restore secret to version N

IMPORT/EXPORT
  psst import <file>                    Import secrets from .env file
  psst import <vault> <file>            Import into specific vault
  psst import --stdin                   Import secrets from stdin
  psst import --from-env                Import from environment variables
  psst export                           Export secrets to stdout (.env format)
  psst export <vault>                   Export specific vault to stdout
  psst export --env-file <f>            Export secrets to file
  psst export <vault> --env-file <f>    Export specific vault to file

AGENT EXECUTION
  psst run <command>              Run command with ALL secrets injected
  psst run --tag <t> <command>    Run with secrets matching tag
  psst <NAME> [NAME...] -- <cmd>  Inject specific secrets and run command
  psst --tag <t> -- <cmd>         Inject secrets with tag and run command

SECRET SCANNING
  psst scan                       Scan files for leaked secrets
  psst scan --staged              Scan only git staged files
  psst scan --path <dir>          Scan specific directory

OPTIONS
  --no-mask                       Disable output masking (for debugging)

VAULT SHORTHAND
  psst <vault> <cmd>            Use vault by name, falls back to global if no local match
  psst @<vault> <cmd>           Force global vault  (e.g. psst @anyplan list)
  psst list <vault>             List secrets in vault
  psst export <vault>           Export vault to stdout
  psst import <vault> <file>    Import into vault

GLOBAL FLAGS
  -g, --global                  Use global vault (~/.psst/) instead of local
  --vault <name>                Use specific vault (default: "default")
  --env <name>                  Alias for --vault (deprecated)
  --tag <name>                  Filter by tag (repeatable for multiple tags)
  --json                        Output as JSON
  -q, --quiet                   Suppress output, use exit codes

PROXY MODE
  psst proxy enable --rest-url <url> [--api-key <key>]   Enable proxy (persists to ~/.psst/proxy.json)
  psst proxy disable                                      Disable proxy, revert to local vaults
  psst proxy status                                       Show current proxy config
  psst list vaults                                        List vaults on server (when proxy enabled)
  psst --vault prod set KEY                               Set secret in "prod" vault on server

ENVIRONMENT VARIABLES
  PSST_GLOBAL                   Alternative to --global flag (set to "1" or "true")
  PSST_VAULT                    Alternative to --vault flag
  PSST_ENV                      Alias for PSST_VAULT (deprecated)
  PSST_REST_URL                    Alternative to --rest-url flag
  PSST_API_KEY                Alternative to --api-key flag

EXAMPLES
  psst init                                               # Create local vault
  psst init --global                                      # Create global vault
  psst set STRIPE_KEY
  psst set AWS_KEY --tag aws --tag prod                   # Set with tags
  psst list
  psst list --tag aws                                     # Filter by tag
  psst run ./deploy.sh                                    # All secrets injected
  psst --tag aws run ./deploy.sh                          # Only aws-tagged secrets
  psst STRIPE_KEY -- curl -H "Authorization: $STRIPE_KEY" https://api.stripe.com
  psst --vault prod run ./deploy.sh                       # Use prod vault
  psst --global list                                      # List from global vault
`;

async function main() {
  const args = process.argv.slice(2);

  // Parse global flags
  const json = args.includes("--json");
  const quiet = args.includes("--quiet") || args.includes("-q");

  // Parse --global flag or fallback to PSST_GLOBAL
  let global = args.includes("--global") || args.includes("-g");
  if (!global && process.env.PSST_GLOBAL) {
    global =
      process.env.PSST_GLOBAL === "1" ||
      process.env.PSST_GLOBAL.toLowerCase() === "true";
  }

  // Parse --vault (preferred) or --env (legacy alias) flag, fallback to PSST_VAULT / PSST_ENV
  let env: string | undefined;
  const vaultIndex = args.indexOf("--vault");
  const envIndex = args.indexOf("--env");
  const resolvedIndex = vaultIndex !== -1 ? vaultIndex : envIndex;
  if (
    resolvedIndex !== -1 &&
    args[resolvedIndex + 1] &&
    !args[resolvedIndex + 1].startsWith("-")
  ) {
    env = args[resolvedIndex + 1];
  } else if (process.env.PSST_VAULT) {
    env = process.env.PSST_VAULT;
  } else if (process.env.PSST_ENV) {
    env = process.env.PSST_ENV;
  }

  // Load persisted proxy config, then let CLI flags / env vars override
  const savedProxy = loadPsstConfig().proxy;

  let restUrl: string | undefined = (savedProxy?.enabled !== false) ? savedProxy?.url : undefined;
  const restUrlIndex = args.indexOf("--rest-url");
  if (restUrlIndex !== -1 && args[restUrlIndex + 1] && !args[restUrlIndex + 1].startsWith("-")) {
    restUrl = args[restUrlIndex + 1];
  } else if (process.env.PSST_REST_URL) {
    restUrl = process.env.PSST_REST_URL;
  }

  let apiKey: string | undefined = savedProxy?.apiKey;
  const apiKeyIndex = args.indexOf("--api-key");
  if (apiKeyIndex !== -1 && args[apiKeyIndex + 1] && !args[apiKeyIndex + 1].startsWith("-")) {
    apiKey = args[apiKeyIndex + 1];
  } else if (process.env.PSST_API_KEY) {
    apiKey = process.env.PSST_API_KEY;
  }

  // Parse --tag flags (can appear multiple times)
  const tags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && args[i + 1] && !args[i + 1].startsWith("-")) {
      tags.push(args[i + 1]);
    }
  }

  const options = {
    json,
    quiet,
    env,
    global,
    tags: tags.length > 0 ? tags : undefined,
    restUrl: restUrl ? { url: restUrl, apiKey: apiKey } : undefined,
  };

  // Remove global flags from args for command processing
  const cleanArgs = args.filter((a, i) => {
    if (a === "--json" || a === "--quiet" || a === "-q") return false;
    if (a === "--global" || a === "-g") return false;
    if (a === "--vault" || a === "--env") return false;
    if (i > 0 && (args[i - 1] === "--vault" || args[i - 1] === "--env")) return false;
    if (a === "--tag") return false;
    if (i > 0 && args[i - 1] === "--tag") return false;
    if (a === "--api-key") return false;
    if (i > 0 && args[i - 1] === "--api-key") return false;
    return true;
  });

  // Env shorthand: `psst @anyplan <cmd>` (global) or `psst anyplan <cmd>` (local, or global if no local match)
  if (cleanArgs.length > 0 && !env) {
    const first = cleanArgs[0];
    if (first.startsWith("@")) {
      options.global = true;
      options.env = first.slice(1);
      cleanArgs.shift();
    } else if (!first.startsWith("-") && !KNOWN_COMMANDS.has(first)) {
      // Resolve scope: local first, then global (unless --global already set)
      const localMatch = Vault.findVaultPath({ global: false, env: first });
      const globalMatch = Vault.findVaultPath({ global: true, env: first });
      if (options.global && globalMatch) {
        options.env = first;
        cleanArgs.shift();
      } else if (localMatch) {
        options.env = first;
        cleanArgs.shift();
      } else if (globalMatch) {
        options.global = true;
        options.env = first;
        cleanArgs.shift();
      }
    }
  }

  // Sync local vars so commands that pass env/global directly stay consistent
  const resolvedEnv = options.env;
  const resolvedGlobal = options.global;

  if (
    cleanArgs.length === 0 ||
    cleanArgs[0] === "--help" ||
    cleanArgs[0] === "-h"
  ) {
    if (!quiet) console.log(HELP);
    process.exit(0);
  }

  if (cleanArgs[0] === "--version" || cleanArgs[0] === "-v") {
    if (json) {
      console.log(JSON.stringify({ version: pkg.version }));
    } else if (!quiet) {
      console.log(`psst ${pkg.version}`);
    }
    process.exit(0);
  }

  const command = cleanArgs[0];

  // Check if this is the exec pattern: psst SECRET [SECRET...] -- cmd
  // Also handles: psst --tag <t> -- cmd (dashDashIndex can be 0 with tags)
  const dashDashIndex = cleanArgs.indexOf("--");
  if (dashDashIndex > 0 || (dashDashIndex === 0 && options.tags?.length)) {
    const noMask = cleanArgs.includes("--no-mask");
    const secretNames = cleanArgs
      .slice(0, dashDashIndex)
      .filter((a) => a !== "--no-mask");
    const cmdArgs = cleanArgs.slice(dashDashIndex + 1);

    if (cmdArgs.length === 0) {
      console.error("Error: No command specified after --");
      process.exit(1);
    }

    await exec(secretNames, cmdArgs, {
      noMask,
      env: resolvedEnv,
      global: resolvedGlobal,
      tags: options.tags,
    });
    return;
  }

  // Standard commands
  switch (command) {
    case "proxy":
      await proxy(cleanArgs.slice(1), options);
      break;

    case "init":
      await init(cleanArgs.slice(1), options);
      break;

    case "reinit":
      await reinit(cleanArgs.slice(1), options);
      break;

    case "passwd":
    case "change-password":
      await passwd(options);
      break;

    case "set": {
      if (!cleanArgs[1]) {
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: "missing_name" }),
          );
        } else if (!quiet) {
          console.error("Error: Secret name required");
          console.error("Usage: psst set <NAME> [VALUE]");
        }
        process.exit(1);
      }
      const setStdin = cleanArgs.includes("--stdin");
      // Value is cleanArgs[2] if it exists and isn't a flag
      const setValue =
        cleanArgs[2] && !cleanArgs[2].startsWith("-")
          ? cleanArgs[2]
          : undefined;
      await set(cleanArgs[1], { ...options, stdin: setStdin, value: setValue });
      break;
    }

    case "get":
      if (!cleanArgs[1]) {
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: "missing_name" }),
          );
        } else if (!quiet) {
          console.error("Error: Secret name required");
          console.error("Usage: psst get <NAME>");
        }
        process.exit(1);
      }
      await get(cleanArgs[1], options);
      break;

    case "list": {
      if (cleanArgs[1] === "vaults" || cleanArgs[1] === "envs") {
        await listEnvs(options);
      } else {
        // psst list <vault>
        const listVault = cleanArgs[1] && !cleanArgs[1].startsWith("-") ? cleanArgs[1] : undefined;
        if (listVault && !options.env) {
          const globalMatch = Vault.findVaultPath({ global: true, env: listVault });
          options.env = listVault;
          if (globalMatch) options.global = true;
        }
        await list(options);
      }
      break;
    }

    case "rm":
    case "remove":
    case "delete":
      await rm(cleanArgs.slice(1), options);
      break;

    case "import": {
      const fromStdin = cleanArgs.includes("--stdin");
      const fromEnv = cleanArgs.includes("--from-env");
      const patternIndex = cleanArgs.indexOf("--pattern");
      const pattern =
        patternIndex !== -1 ? cleanArgs[patternIndex + 1] : undefined;

      let importArgs = cleanArgs.slice(1).filter((a) => !a.startsWith("--") && a !== pattern);

      // psst import <vault> <file> — first bare arg is vault if it matches a known vault
      if (importArgs.length > 0 && !options.env) {
        const maybeVault = importArgs[0];
        const localMatch = Vault.findVaultPath({ global: false, env: maybeVault });
        const globalMatch = Vault.findVaultPath({ global: true, env: maybeVault });
        if (localMatch || globalMatch) {
          options.env = maybeVault;
          if (globalMatch && !localMatch) options.global = true;
          importArgs = importArgs.slice(1);
        }
      }

      await importSecrets(importArgs, {
        ...options,
        stdin: fromStdin,
        fromEnv,
        pattern,
      });
      break;
    }

    case "export": {
      const envFileIndex = cleanArgs.indexOf("--env-file");
      const envFile =
        envFileIndex !== -1 ? cleanArgs[envFileIndex + 1] : undefined;

      // psst export <vault> [--env-file <f>]
      const exportVault = cleanArgs[1] && !cleanArgs[1].startsWith("-") ? cleanArgs[1] : undefined;
      if (exportVault && !options.env) {
        const globalMatch = Vault.findVaultPath({ global: true, env: exportVault });
        options.env = exportVault;
        if (globalMatch) options.global = true;
      }

      await exportSecrets({ ...options, envFile });
      break;
    }

    case "scan":
      await scan(cleanArgs.slice(1), options);
      break;

    case "tag":
      await tag(cleanArgs.slice(1), options);
      break;

    case "untag":
      await untag(cleanArgs.slice(1), options);
      break;

    case "history":
      if (!cleanArgs[1]) {
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: "missing_name" }),
          );
        } else if (!quiet) {
          console.error("Error: Secret name required");
          console.error("Usage: psst history <NAME>");
        }
        process.exit(1);
      }
      await history(cleanArgs[1], options);
      break;

    case "rollback": {
      if (!cleanArgs[1]) {
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: "missing_name" }),
          );
        } else if (!quiet) {
          console.error("Error: Secret name required");
          console.error("Usage: psst rollback <NAME> --to <version>");
        }
        process.exit(1);
      }
      const toIndex = cleanArgs.indexOf("--to");
      if (toIndex === -1 || !cleanArgs[toIndex + 1]) {
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: "missing_version" }),
          );
        } else if (!quiet) {
          console.error("Error: --to <version> required");
          console.error("Usage: psst rollback <NAME> --to <version>");
        }
        process.exit(1);
      }
      const targetVersion = parseInt(cleanArgs[toIndex + 1], 10);
      await rollback(cleanArgs[1], targetVersion, options);
      break;
    }

    case "run": {
      const runNoMask = cleanArgs.includes("--no-mask");
      const runCmdArgs = cleanArgs.slice(1).filter((a) => a !== "--no-mask");

      if (runCmdArgs.length === 0) {
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: "missing_command" }),
          );
        } else if (!quiet) {
          console.error("Error: Command required");
          console.error("Usage: psst run <command>");
        }
        process.exit(1);
      }

      await run(runCmdArgs, {
        noMask: runNoMask,
        env: resolvedEnv,
        global: resolvedGlobal,
        tags: options.tags,
      });
      break;
    }

    default:
      if (json) {
        console.log(
          JSON.stringify({ success: false, error: "unknown_command", command }),
        );
      } else {
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
      }
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
