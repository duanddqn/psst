import chalk from "chalk";
import { rmSync } from "node:fs";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import type { OutputOptions } from "../utils/output.js";
import { Vault } from "../vault/vault.js";
import { init } from "./init.js";

/**
 * psst reinit — drop and re-initialize a vault.
 * Secrets in the vault will be lost. Prompts for confirmation.
 */
export async function reinit(args: string[], options: OutputOptions = {}): Promise<void> {
  const vaultPath = Vault.findVaultPath({ global: options.global, env: options.env });

  if (!vaultPath) {
    const scope = options.global ? "global" : "local";
    const envMsg = options.env ? ` for environment "${options.env}"` : "";
    console.error(chalk.red("✗"), `No ${scope} vault found${envMsg}`);
    process.exit(EXIT_USER_ERROR);
  }

  if (!options.quiet && !options.json) {
    const scope = options.global ? "global" : "local";
    const envLabel = options.env ?? "default";
    console.log(chalk.yellow("⚠"), `This will delete all secrets in the ${scope} "${envLabel}" vault.`);
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

  if (!options.quiet && !options.json) {
    console.log(chalk.dim("  Vault removed. Re-initializing..."));
    console.log();
  }

  await init(args, options);
}
