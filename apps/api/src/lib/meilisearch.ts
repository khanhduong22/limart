import { Meilisearch } from "meilisearch";

let meiliClient: Meilisearch | null = null;

export const DOCUMENTS_INDEX = "documents";

export function getMeiliClient(): Meilisearch | null {
  if (meiliClient) return meiliClient;

  const host = process.env.MEILISEARCH_HOST || "http://meilisearch:7700";
  const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || "";

  try {
    meiliClient = new Meilisearch({
      host,
      apiKey,
      timeout: 2000,
    });
    return meiliClient;
  } catch (err) {
    console.warn("[Meilisearch Client Init Error]", err);
    return null;
  }
}

export async function checkMeiliHealth(): Promise<"connected" | "disconnected"> {
  const client = getMeiliClient();
  if (!client) return "disconnected";
  try {
    const health = await client.health();
    return health.status === "available" ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

export interface MeiliDocumentItem {
  id: string;
  path: string;
  title: string;
  content: string;
  tenantId?: string;
}

/**
 * Safely indexes documents into Meilisearch `documents` index.
 * Non-blocking, catches any connection or index errors gracefully so local dev or tests without Meilisearch never fail.
 */
export async function syncDocumentsToMeilisearch(
  docs: MeiliDocumentItem[]
): Promise<boolean> {
  if (!docs || docs.length === 0) return true;

  try {
    const client = getMeiliClient();
    if (!client) return false;

    const formattedDocs = docs.map((doc) => ({
      id: doc.id,
      path: doc.path,
      title: doc.title,
      content: doc.content,
      tenantId: doc.tenantId || "limart",
    }));

    const index = client.index(DOCUMENTS_INDEX);
    await index.addDocuments(formattedDocs, { primaryKey: "id" });
    return true;
  } catch (err: any) {
    console.warn("[Meilisearch Sync Documents Warn]", err?.message || err);
    return false;
  }
}

/**
 * Queries Meilisearch `documents` index with typo-tolerance for Vietnamese queries.
 * Returns matching `{ id, path, title, content }[]`. Returns `[]` gracefully on any error.
 */
export async function searchDocumentsInMeilisearch(
  query: string,
  tenantId = "limart",
  limit = 4
): Promise<Array<{ id: string; path: string; title: string; content: string }>> {
  if (!query || !query.trim()) return [];

  try {
    const client = getMeiliClient();
    if (!client) return [];

    const index = client.index(DOCUMENTS_INDEX);
    const searchRes = await index.search(query.trim(), {
      limit,
      filter: tenantId ? `tenantId = "${tenantId}"` : undefined,
    });

    if (!searchRes || !Array.isArray(searchRes.hits)) {
      return [];
    }

    return searchRes.hits.map((hit: any) => ({
      id: String(hit.id),
      path: String(hit.path || ""),
      title: String(hit.title || ""),
      content: String(hit.content || ""),
    }));
  } catch (err: any) {
    console.warn("[Meilisearch Search Documents Warn]", err?.message || err);
    return [];
  }
}

