/**
 * restapi-backend.ts — REST API storage backend for psst.
 *
 * Delegates all secret operations to a remote HTTP service.
 * No client-side encryption — the server owns encryption at rest.
 * Auth via X-Api-Key header (omitted when apiKey is not configured).
 */

import type {
  SecretHistoryRecord,
  SecretMetaRecord,
  VaultBackend,
} from "./backend.js";

export interface RestApiBackendConfig {
  url: string;
  apiKey?: string;
  vault?: string;
}

interface SecretPayload {
  value: string;
  tags?: string[];
}

interface SecretResponse {
  name: string;
  value: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface SecretMetaResponse {
  name: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface HistoryEntryResponse {
  version: number;
  tags: string[];
  archived_at: string;
}

interface RollbackPayload {
  version: number;
}

export class RestApiBackend implements VaultBackend {
  readonly type = "restapi" as const;

  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  private readonly secretsBase: string;

  constructor(config: RestApiBackendConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.headers = { "Content-Type": "application/json" };
    if (config.apiKey) {
      this.headers["X-Api-Key"] = config.apiKey;
    }
    this.secretsBase = config.vault
      ? `/vaults/${encodeURIComponent(config.vault)}/secrets`
      : "/secrets";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T | null }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204 || res.status === 404) {
      return { status: res.status, data: null };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`REST API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  async unlock(): Promise<boolean> {
    return true;
  }

  async exists(name: string): Promise<boolean> {
    const { status } = await this.request<SecretResponse>(
      "GET",
      `${this.secretsBase}/${encodeURIComponent(name)}`,
    );
    return status !== 404;
  }

  async setSecret(name: string, value: string, tags?: string[]): Promise<void> {
    await this.request<void>("PUT", `${this.secretsBase}/${encodeURIComponent(name)}`, {
      value,
      tags: tags ?? [],
    } satisfies SecretPayload);
  }

  async getSecret(name: string): Promise<string | null> {
    const { data } = await this.request<SecretResponse>(
      "GET",
      `${this.secretsBase}/${encodeURIComponent(name)}`,
    );
    return data?.value ?? null;
  }

  async getSecrets(names: string[]): Promise<Map<string, string>> {
    const results = await Promise.all(
      names.map(async (name) => {
        const value = await this.getSecret(name);
        return [name, value] as const;
      }),
    );
    const map = new Map<string, string>();
    for (const [name, value] of results) {
      if (value !== null) map.set(name, value);
    }
    return map;
  }

  async listSecrets(filterTags?: string[]): Promise<SecretMetaRecord[]> {
    const params =
      filterTags && filterTags.length > 0
        ? `?tags=${filterTags.map(encodeURIComponent).join(",")}`
        : "";
    const { data } = await this.request<SecretMetaResponse[]>(
      "GET",
      `${this.secretsBase}${params}`,
    );
    return (data ?? []).map((s) => ({
      name: s.name,
      tags: s.tags,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));
  }

  async removeSecret(name: string): Promise<boolean> {
    const { status } = await this.request<void>(
      "DELETE",
      `${this.secretsBase}/${encodeURIComponent(name)}`,
    );
    return status !== 404;
  }

  async getTags(name: string): Promise<string[]> {
    const { data } = await this.request<SecretResponse>(
      "GET",
      `${this.secretsBase}/${encodeURIComponent(name)}`,
    );
    return data?.tags ?? [];
  }

  async setTags(name: string, tags: string[]): Promise<boolean> {
    const { status } = await this.request<void>(
      "POST",
      `${this.secretsBase}/${encodeURIComponent(name)}/tags`,
      { tags },
    );
    return status !== 404;
  }

  async addTags(name: string, newTags: string[]): Promise<boolean> {
    const current = await this.getTags(name);
    const merged = [...new Set([...current, ...newTags])];
    return this.setTags(name, merged);
  }

  async removeTags(name: string, tagsToRemove: string[]): Promise<boolean> {
    const current = await this.getTags(name);
    const remove = new Set(tagsToRemove);
    return this.setTags(
      name,
      current.filter((t) => !remove.has(t)),
    );
  }

  async getHistory(name: string): Promise<SecretHistoryRecord[]> {
    const { data } = await this.request<HistoryEntryResponse[]>(
      "GET",
      `${this.secretsBase}/${encodeURIComponent(name)}/history`,
    );
    return (data ?? []).map((h) => ({
      version: h.version,
      tags: h.tags,
      archived_at: h.archived_at,
    }));
  }

  async getHistoryVersion(
    name: string,
    version: number,
  ): Promise<string | null> {
    const { data } = await this.request<{ value: string }>(
      "GET",
      `${this.secretsBase}/${encodeURIComponent(name)}/history/${version}`,
    );
    return data?.value ?? null;
  }

  async rollback(name: string, targetVersion: number): Promise<boolean> {
    const { status } = await this.request<void>(
      "POST",
      `${this.secretsBase}/${encodeURIComponent(name)}/rollback`,
      { version: targetVersion } satisfies RollbackPayload,
    );
    return status !== 404;
  }

  async clearHistory(name: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `${this.secretsBase}/${encodeURIComponent(name)}/history`,
    );
  }

  async listVaults(): Promise<Array<{ name: string; created_at: string }>> {
    const { data } = await this.request<Array<{ name: string; created_at: string }>>(
      "GET",
      "/vaults",
    );
    return data ?? [];
  }

  async createVault(vault: string): Promise<void> {
    await this.request<void>("POST", `/vaults/${encodeURIComponent(vault)}`);
  }

  async deleteVault(vault: string): Promise<void> {
    await this.request<void>("DELETE", `/vaults/${encodeURIComponent(vault)}`);
  }

  close(): void {}
}

export function initializeRestApiVault(
  config: RestApiBackendConfig | undefined,
): { success: boolean; error?: string } {
  if (!config?.url) {
    return {
      success: false,
      error: "REST API URL not configured. Pass --rest-url <url> to psst init.",
    };
  }
  try {
    new URL(config.url);
  } catch {
    return { success: false, error: `Invalid REST API URL: "${config.url}"` };
  }
  return { success: true };
}
