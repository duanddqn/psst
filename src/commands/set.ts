import chalk from "chalk";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { readSecretValue, readStdin } from "../utils/input.js";
import type { OutputOptions } from "../utils/output.js";
import { getUnlockedVault } from "./common.js";

function parseArrayLiteral(inner: string): (string | number)[] {
  const items: (string | number)[] = [];
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === " " || inner[i] === ",") { i++; continue; }
    if (inner[i] === '"' || inner[i] === "'") {
      const q = inner[i++];
      let s = "";
      while (i < inner.length && inner[i] !== q) {
        if (inner[i] === "\\" && i + 1 < inner.length) { i++; }
        s += inner[i++];
      }
      i++;
      items.push(s);
    } else {
      let tok = "";
      while (i < inner.length && inner[i] !== ",") tok += inner[i++];
      tok = tok.trim();
      if (tok !== "") items.push(/^-?\d+(\.\d+)?$/.test(tok) ? Number(tok) : tok);
    }
  }
  return items;
}

function normalizeValue(v: string): string {
  const trimmed = v.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return JSON.stringify(parseArrayLiteral(trimmed.slice(1, -1)));
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { return JSON.stringify(JSON.parse(trimmed)); } catch { /* fall through */ }
  }
  return v;
}

interface SetOptions extends OutputOptions {
  stdin?: boolean;
  value?: string;
}

export async function set(
  name: string,
  options: SetOptions = {},
): Promise<void> {
  name = name.toUpperCase();

  // Validate secret name
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    if (options.json) {
      console.log(
        JSON.stringify({ success: false, error: "invalid_name", name }),
      );
    } else if (!options.quiet) {
      console.error(chalk.red("✗"), "Invalid name format");
      console.log(
        chalk.dim("  Must be letters, digits and underscores (e.g., STRIPE_KEY)"),
      );
    }
    process.exit(EXIT_USER_ERROR);
  }

  let value: string;

  if (options.value) {
    value = options.value;
  } else if (options.stdin) {
    value = (await readStdin()).trim();
  } else {
    value = await readSecretValue(`Enter value for ${chalk.bold(name)}: `);
  }

  if (!value) {
    if (options.json) {
      console.log(
        JSON.stringify({ success: false, error: "empty_value", name }),
      );
    } else if (!options.quiet) {
      console.error(chalk.red("✗"), "Empty value not allowed");
    }
    process.exit(EXIT_USER_ERROR);
  }

  value = normalizeValue(value);
  const vault = await getUnlockedVault(options);
  await vault.setSecret(name, value, options.tags);
  vault.close();

  if (options.json) {
    console.log(
      JSON.stringify({ success: true, name, tags: options.tags || [] }),
    );
  } else if (!options.quiet) {
    const tagMsg = options.tags?.length
      ? ` with tags: ${options.tags.join(", ")}`
      : "";
    console.log(chalk.green("✓"), `Secret ${chalk.bold(name)} saved${tagMsg}`);
  }
}
