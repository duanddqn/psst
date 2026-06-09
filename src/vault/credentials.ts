/**
 * credentials.ts — Cross-platform persistent credentials store for psst.
 *
 * Reads and writes ~/.psst/credentials, a simple key=value file that
 * survives restarts on all platforms without touching shell profiles,
 * registry, or OS keychains. File is created with 600 permissions on
 * Unix so only the owning user can read it.
 *
 * Load order for PSST_PASSWORD:
 *   1. PSST_PASSWORD env var  (explicit override / CI)
 *   2. ~/.psst/credentials    (written by psst init, auto-loaded)
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getenvNative } from "./native-env.js";

const CREDENTIALS_DIR = join(homedir(), ".psst");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials");

interface Credentials {
  PSST_PASSWORD?: string;
}

function load(): Credentials {
  if (!existsSync(CREDENTIALS_FILE)) return {};
  try {
    const result: Credentials = {};
    for (const line of readFileSync(CREDENTIALS_FILE, "utf-8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key === "PSST_PASSWORD") result.PSST_PASSWORD = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveCredentials(data: Credentials): void {
  mkdirSync(CREDENTIALS_DIR, { recursive: true });
  const lines = (Object.entries(data) as [string, string | undefined][])
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  writeFileSync(CREDENTIALS_FILE, lines.join("\n") + "\n", "utf-8");
  if (process.platform !== "win32") {
    chmodSync(CREDENTIALS_FILE, 0o600);
  }
}

/** SHA-256 hash a plain-text password before persisting it. */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/**
 * Returns PSST_PASSWORD from env var first, then credentials file.
 * Returns null if neither is set.
 */
export function getPsstPassword(): string | null {
  return (
    process.env.PSST_PASSWORD ??
    getenvNative("PSST_PASSWORD") ??
    load().PSST_PASSWORD ??
    null
  );
}
