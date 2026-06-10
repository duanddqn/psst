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
    const urlIndex = args.indexOf("--rest-url");
    const urlArg = urlIndex !== -1 ? args[urlIndex + 1] : undefined;
    const url = (urlArg && !urlArg.startsWith("-")) ? urlArg : loadPsstConfig().proxy?.url;
    if (!url) {
      console.error(chalk.red("✗"), "--rest-url is required");
      console.error(chalk.dim("  Usage: psst proxy enable --rest-url <url> [--api-key <key>]"));
      process.exit(EXIT_USER_ERROR);
    }
    try { new URL(url); } catch {
      console.error(chalk.red("✗"), `Invalid URL: "${url}"`);
      process.exit(EXIT_USER_ERROR);
    }
    const keyIndex = args.indexOf("--api-key");
    const apiKey = (keyIndex !== -1 && args[keyIndex + 1] && !args[keyIndex + 1].startsWith("-"))
      ? args[keyIndex + 1]
      : options.restUrl?.apiKey;

    updatePsstConfig({ proxy: { url, ...(apiKey ? { apiKey } : {}), enabled: true } });

    if (options.json) {
      console.log(JSON.stringify({ success: true, url, hasApiKey: !!apiKey }));
    } else if (!options.quiet) {
      console.log(chalk.green("✓"), `Proxy enabled → ${url}`);
      console.log(chalk.dim("  All psst commands now route through the server."));
      console.log(chalk.dim("  Run: psst proxy disable  to turn off."));
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
  console.error(chalk.dim("  Usage: psst proxy enable|disable|status"));
  process.exit(EXIT_USER_ERROR);
}
