import chalk from "chalk";
import { rmSync } from "node:fs";
import { EXIT_ERROR, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import type { OutputOptions } from "../utils/output.js";
import { Vault } from "../vault/vault.js";
import { getUnlockedVault } from "./common.js";

async function rmItem(name: string, options: OutputOptions): Promise<void> {
  const vault = await getUnlockedVault(options);
  const removed = await vault.removeSecret(name);
  if (removed) await vault.clearHistory(name);
  vault.close();

  if (!removed) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: "not_found", name }));
    } else if (!options.quiet) {
      console.error(chalk.red("✗"), `Secret ${chalk.bold(name)} not found`);
    }
    process.exit(EXIT_USER_ERROR);
  }

  if (options.json) {
    console.log(JSON.stringify({ success: true, name }));
  } else if (!options.quiet) {
    console.log(chalk.green("✓"), `Secret ${chalk.bold(name)} removed`);
  }
}

async function rmVault(envName: string, options: OutputOptions): Promise<void> {
  const isGlobal = envName.startsWith("@");
  const env = isGlobal ? envName.slice(1) : envName;
  const vaultPath = Vault.findVaultPath({ global: isGlobal || options.global, env });

  if (!vaultPath) {
    const scope = isGlobal || options.global ? "global" : "local";
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: "not_found", env }));
    } else if (!options.quiet) {
      console.error(chalk.red("✗"), `No ${scope} vault found for "${env}"`);
    }
    process.exit(EXIT_USER_ERROR);
  }

  if (!options.quiet && !options.json) {
    const scope = isGlobal || options.global ? "global" : "local";
    console.log(chalk.yellow("⚠"), `This will permanently delete the ${scope} "${env}" vault.`);
    console.log(chalk.dim(`  ${vaultPath}`));

    if (process.stdin.isTTY) {
      process.stdout.write("  Type YES to confirm: ");
      const reader = Bun.stdin.stream().getReader();
      let line = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          line += chunk;
          if (chunk.includes("\n") || chunk.includes("\r")) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (line.trim() !== "YES") {
        console.log(chalk.dim("Aborted."));
        process.exit(0);
      }
    }
  }

  rmSync(vaultPath, { recursive: true, force: true });

  if (options.json) {
    console.log(JSON.stringify({ success: true, env, path: vaultPath }));
  } else if (!options.quiet) {
    console.log(chalk.green("✓"), `Vault "${env}" removed.`);
  }
}

export async function rm(args: string[], options: OutputOptions = {}): Promise<void> {
  const sub = args[0];

  if (sub === "vault") {
    const envArg = args[1];
    if (!envArg) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: "missing_env" }));
      } else if (!options.quiet) {
        console.error(chalk.red("✗"), "Usage: psst rm vault <env> | psst rm vault @<env>");
      }
      process.exit(EXIT_USER_ERROR);
    }
    await rmVault(envArg, options);
    return;
  }

  if (sub === "item") {
    const name = args[1];
    if (!name) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: "missing_name" }));
      } else if (!options.quiet) {
        console.error(chalk.red("✗"), "Usage: psst rm item <NAME>");
      }
      process.exit(EXIT_USER_ERROR);
    }
    await rmItem(name, options);
    return;
  }

  // Backward compat: psst rm <NAME>
  if (sub && !sub.startsWith("-")) {
    await rmItem(sub, options);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ success: false, error: "missing_subcommand" }));
  } else if (!options.quiet) {
    console.error(chalk.red("✗"), "Usage: psst rm item <NAME> | psst rm vault <env>");
  }
  process.exit(EXIT_USER_ERROR);
}
