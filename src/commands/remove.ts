import chalk from "chalk";
import { rmSync } from "node:fs";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import type { OutputOptions } from "../utils/output.js";
import { Vault } from "../vault/vault.js";

/**
 * psst remove — delete a vault without re-initializing.
 */
export async function remove(options: OutputOptions = {}): Promise<void> {
  const vaultPath = Vault.findVaultPath({ global: options.global, env: options.env });

  if (!vaultPath) {
    const scope = options.global ? "global" : "local";
    const envMsg = options.env ? ` for environment "${options.env}"` : "";
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: "not_found" }));
    } else if (!options.quiet) {
      console.error(chalk.red("✗"), `No ${scope} vault found${envMsg}`);
    }
    process.exit(EXIT_USER_ERROR);
  }

  if (!options.quiet && !options.json) {
    const scope = options.global ? "global" : "local";
    const envLabel = options.env ?? "default";
    console.log(chalk.yellow("⚠"), `This will permanently delete the ${scope} "${envLabel}" vault.`);
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
    console.log(JSON.stringify({ success: true, path: vaultPath }));
  } else if (!options.quiet) {
    console.log(chalk.green("✓"), "Vault removed.");
  }
}
