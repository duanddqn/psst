import chalk from "chalk";
import type { OutputOptions } from "../utils/output.js";
import { Vault } from "../vault/vault.js";
import { RestApiBackend } from "../vault/restapi-backend.js";

export async function listEnvs(options: OutputOptions = {}): Promise<void> {
  if (options.restUrl) {
    const backend = new RestApiBackend({ url: options.restUrl.url, apiKey: options.restUrl.apiKey });
    const vaults = await backend.listVaults();

    if (options.json) {
      console.log(JSON.stringify({ success: true, vaults }));
      return;
    }

    if (options.quiet) {
      for (const v of vaults) console.log(v.name);
      return;
    }

    if (vaults.length === 0) {
      console.log();
      console.log(chalk.dim("No vaults found on proxy server."));
      console.log();
      console.log("Create one with", chalk.cyan("psst --proxy <url> init --vault <name>"));
      console.log();
      return;
    }

    console.log();
    console.log(chalk.bold("Proxy Vaults"));
    console.log();
    for (const v of vaults) {
      console.log(chalk.green("●"), v.name);
    }
    console.log();
    return;
  }

  const globalEnvs = Vault.listEnvironments(true);
  const localEnvs = Vault.listEnvironments(false);

  if (options.json) {
    console.log(
      JSON.stringify({
        success: true,
        global: globalEnvs,
        local: localEnvs,
      }),
    );
    return;
  }

  if (options.quiet) {
    const allEnvs = [...new Set([...globalEnvs, ...localEnvs])];
    for (const env of allEnvs) {
      console.log(env);
    }
    return;
  }

  if (globalEnvs.length === 0 && localEnvs.length === 0) {
    console.log();
    console.log(chalk.dim("No environments found."));
    console.log();
    console.log(
      "Create one with",
      chalk.cyan("psst init"),
      "(local) or",
      chalk.cyan("psst init --global"),
      "(global)",
    );
    console.log();
    return;
  }

  if (globalEnvs.length > 0) {
    console.log();
    console.log(chalk.bold("Global Environments"));
    console.log();
    for (const env of globalEnvs) {
      console.log(chalk.green("●"), env);
    }
  }

  if (localEnvs.length > 0) {
    console.log();
    console.log(chalk.bold("Local Environments"));
    console.log();
    for (const env of localEnvs) {
      console.log(chalk.green("●"), env);
    }
  }

  console.log();
}
