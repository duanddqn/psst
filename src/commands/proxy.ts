import chalk from "chalk";
import type { OutputOptions } from "../utils/output.js";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { loadPsstConfig, updatePsstConfig } from "../vault/psst-config.js";

export type { ProxySettings as ProxyConfig } from "../vault/psst-config.js";

export function loadProxyConfig() {
  return loadPsstConfig().proxy ?? null;
}

export async function proxy(args: string[], options: OutputOptions = {}): Promise<void> {
  const sub = args[0];

  if (sub === "enable") {
    const current = loadPsstConfig().proxy;
    updatePsstConfig({ proxy: { url: current?.url ?? "", ...current, enabled: true } });
    if (options.json) {
      console.log(JSON.stringify({ success: true }));
    } else if (!options.quiet) {
      console.log(chalk.green("✓"), "Proxy enabled.");
      if (!current?.url) {
        console.log(chalk.yellow("⚠"), "No server URL configured.");
        console.log(chalk.dim("  Run: psst proxy config --rest-url <url>"));
      }
      if (!current?.apiKey) {
        console.log(chalk.dim("  No API key set. Run: psst proxy config --api-key <key>"));
      }
    }
    return;
  }

  if (sub === "config") {
    const urlIndex = args.indexOf("--rest-url");
    const urlArg = (urlIndex !== -1 && args[urlIndex + 1] && !args[urlIndex + 1].startsWith("-"))
      ? args[urlIndex + 1] : undefined;
    const keyIndex = args.indexOf("--api-key");
    const apiKey = (keyIndex !== -1 && args[keyIndex + 1] && !args[keyIndex + 1].startsWith("-"))
      ? args[keyIndex + 1] : undefined;

    if (!urlArg && !apiKey) {
      console.error(chalk.red("✗"), "Nothing to update.");
      console.error(chalk.dim("  Usage: psst proxy config [--rest-url <url>] [--api-key <key>]"));
      process.exit(EXIT_USER_ERROR);
    }

    if (urlArg) {
      try { new URL(urlArg); } catch {
        console.error(chalk.red("✗"), `Invalid URL: "${urlArg}"`);
        process.exit(EXIT_USER_ERROR);
      }
    }

    const current = loadPsstConfig().proxy;
    updatePsstConfig({ proxy: { ...current, url: urlArg ?? current?.url ?? "", ...(apiKey ? { apiKey } : {}) } });

    if (options.json) {
      console.log(JSON.stringify({ success: true }));
    } else if (!options.quiet) {
      if (urlArg) console.log(chalk.green("✓"), `Server URL set → ${urlArg}`);
      if (apiKey) console.log(chalk.green("✓"), "API key updated.");
    }
    return;
  }

  if (sub === "disable") {
    const current = loadPsstConfig().proxy;
    updatePsstConfig({ proxy: current ? { ...current, enabled: false } : undefined });
    if (options.json) {
      console.log(JSON.stringify({ success: true }));
    } else if (!options.quiet) {
      console.log(chalk.green("✓"), "Proxy disabled. Using local vaults.");
    }
    return;
  }

  if (sub === "status" || !sub) {
    const config = loadPsstConfig();
    if (options.json) {
      console.log(JSON.stringify({ enabled: !!config.proxy, ...config }));
      return;
    }
    if (config.proxy?.url) {
      const on = config.proxy.enabled !== false;
      const dot = on ? chalk.green("●") : chalk.dim("●");
      const state = on ? "enabled" : "disabled";
      console.log(dot, `Proxy ${state} → ${config.proxy.url}`);
      console.log(chalk.dim(`  API key: ${config.proxy.apiKey ? "set" : "not set"}`));
    } else {
      console.log(chalk.dim("●"), "No proxy configured");
    }
    return;
  }

  console.error(chalk.red("✗"), `Unknown subcommand: ${sub}`);
  console.error(chalk.dim("  Usage: psst proxy enable|disable|config|status"));
  console.error(chalk.dim("    psst proxy config --rest-url <url> --api-key <key>"));
  process.exit(EXIT_USER_ERROR);
}
