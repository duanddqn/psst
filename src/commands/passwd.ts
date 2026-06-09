import chalk from "chalk";
import { EXIT_AUTH_FAILED, EXIT_ERROR, EXIT_NO_VAULT, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { readKeystorePassword } from "../utils/input.js";
import type { OutputOptions } from "../utils/output.js";
import { getPsstPassword, hashPassword, saveCredentials } from "../vault/credentials.js";
import { getKeyFromSqlite, storeKeyInSqlite } from "../vault/sqlite-keystore.js";
import { Vault } from "../vault/vault.js";

/**
 * psst passwd — change the sqlite keystore password without losing secrets.
 *
 * Unlocks the keystore with the current password, then re-encrypts the vault
 * key with a new password and updates ~/.psst/credentials.
 */
export async function passwd(options: OutputOptions = {}): Promise<void> {
  const vaultPath = Vault.findVaultPath({ global: options.global, env: options.env });

  if (!vaultPath) {
    const scope = options.global ? "global" : "local";
    const envMsg = options.env ? ` for environment "${options.env}"` : "";
    console.error(chalk.red("✗"), `No ${scope} vault found${envMsg}`);
    process.exit(EXIT_NO_VAULT);
  }

  const vault = new Vault(vaultPath);

  if (vault.backendType !== "sqlite" || !vault["sqlite"]) {
    console.error(chalk.red("✗"), "psst passwd only supports the sqlite key backend");
    process.exit(EXIT_USER_ERROR);
  }

  const oldPassword = getPsstPassword() ?? await readKeystorePassword("Current vault password: ");
  if (!oldPassword) {
    console.error(chalk.red("✗"), "Current password is required");
    process.exit(EXIT_AUTH_FAILED);
  }

  const keyResult = await getKeyFromSqlite(vaultPath, oldPassword);
  if (!keyResult.success || !keyResult.key) {
    console.error(chalk.red("✗"), "Wrong password — could not unlock vault");
    process.exit(EXIT_AUTH_FAILED);
  }

  const newPw1 = await readKeystorePassword("New vault password: ");
  if (!newPw1) {
    console.error(chalk.red("✗"), "New password is required");
    process.exit(EXIT_USER_ERROR);
  }

  const newPw2 = await readKeystorePassword("Confirm new password: ");
  if (newPw1 !== newPw2) {
    console.error(chalk.red("✗"), "Passwords do not match");
    process.exit(EXIT_USER_ERROR);
  }

  const newHash = hashPassword(newPw1);

  const storeResult = await storeKeyInSqlite(vaultPath, keyResult.key, newHash);
  if (!storeResult.success) {
    console.error(chalk.red("✗"), `Failed to re-encrypt keystore: ${storeResult.error}`);
    process.exit(EXIT_ERROR);
  }

  saveCredentials({ PSST_PASSWORD: newHash });

  if (!options.quiet && !options.json) {
    console.log(chalk.green("✓"), "Password changed and credentials updated");
  }
}
