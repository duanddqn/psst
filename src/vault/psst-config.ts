import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PSST_DIR = join(homedir(), ".psst");
const PSST_CONFIG_PATH = join(PSST_DIR, "psst.json");

export interface ProxySettings {
  url: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface PsstConfig {
  proxy?: ProxySettings;
}

export function loadPsstConfig(): PsstConfig {
  if (!existsSync(PSST_CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(PSST_CONFIG_PATH, "utf-8")) as PsstConfig;
  } catch {
    return {};
  }
}

export function savePsstConfig(config: PsstConfig): void {
  mkdirSync(PSST_DIR, { recursive: true });
  writeFileSync(PSST_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function updatePsstConfig(patch: Partial<PsstConfig>): void {
  const current = loadPsstConfig();
  savePsstConfig({
    ...current,
    ...patch,
    ...(patch.proxy ? { proxy: { ...current.proxy, ...patch.proxy } } : {}),
  });
}
