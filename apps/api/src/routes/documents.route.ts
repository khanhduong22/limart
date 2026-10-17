import { Hono } from "hono";
import { prisma } from "@checkin/db";
import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";

export const documentsRoute = new Hono<AppEnv>();

// Text chunker utility (matching v1)
function chunkText(text: string, maxTokens: number = 800): string[] {
  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // Rough estimate: 1 word ~ 1.3 tokens (~4 chars per token)
    const estimatedTokens = (currentChunk.length + paragraph.length) / 4;

    if (estimatedTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph + "\n\n";
    } else {
      currentChunk += paragraph + "\n\n";
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ----------------------------------------------------------------------------
// Capy AI Helpers: Key Normalization, Multi-Model Fallback & Relevance Scoring
// ----------------------------------------------------------------------------

export function getCleanGeminiApiKey(): string {
  const rawApiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
  return rawApiKey.replace(/^["']|["']$/g, "").trim();
}

export async function generateWithGeminiFallback(
  genAI: GoogleGenerativeAI,
  systemInstruction: string,
  prompt: string
): Promise<string> {
  const candidateModels = ["gemini-flash-lite-latest", "gemini-flash-latest"];
  let lastError: any = null;
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: { temperature: 1 },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (err: any) {
      console.warn(`[GEMINI_MODEL_FAILED] Model ${modelName} failed:`, err?.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error("All candidate Gemini models failed");
}

export const STOPWORDS = new Set([
  "nếu", "thì", "như", "nào", "khách", "hàng", "làm", "sao", "cho", "của",
  "các", "được", "trong", "khi", "và", "có", "là", "ở", "với", "để", "gì",
  "báo", "hỏi", "nhắn", "tôi", "em", "bạn"
]);

export function extractKeywordsAndPhrases(query: string) {
  const cleanQuery = query
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'<>@+]/g, " ")
    .trim();
  const words = cleanQuery.split(/\s+/).filter(Boolean);

  const keywords = words.filter((w) => !STOPWORDS.has(w) && w.length >= 2);

  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (!STOPWORDS.has(w1) || !STOPWORDS.has(w2)) {
      phrases.push(`${w1} ${w2}`);
    }

    if (i < words.length - 2) {
      const w3 = words[i + 2];
      if (!STOPWORDS.has(w1) || !STOPWORDS.has(w2) || !STOPWORDS.has(w3)) {
        phrases.push(`${w1} ${w2} ${w3}`);
      }
    }
  }

  return { cleanQuery, words, keywords, phrases };
}

export interface ScoredDocument {
  id: string;
  title: string;
  path: string;
  content: string;
  score: number;
}

export const MIN_RELEVANCE_SCORE = 20;

export function scoreDocuments(
  query: string,
  docs: Array<{ id: string; title: string; path: string; content: string }>
): ScoredDocument[] {
  const { keywords, phrases } = extractKeywordsAndPhrases(query);
  if (keywords.length === 0 && phrases.length === 0) {
    return [];
  }

  const scored: ScoredDocument[] = [];

  for (const doc of docs) {
    const titleLower = doc.title.toLowerCase();
    const contentLower = doc.content.toLowerCase();
    let score = 0;

    // 1. Phrase match (+50 points)
    for (const phrase of phrases) {
      if (titleLower.includes(phrase)) {
        score += 50;
      } else if (contentLower.includes(phrase)) {
        score += 50;
      }
    }

    // 2. Keyword match in title (+20 points)
    for (const kw of keywords) {
      if (titleLower.includes(kw)) {
        score += 20;
      }
    }

    // 3. Keyword match in content (+5 points)
    for (const kw of keywords) {
      if (contentLower.includes(kw)) {
        score += 5;
      }
    }

    if (score > 0) {
      scored.push({ ...doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export const STRICT_NOT_FOUND_MESSAGE =
  "🍊 Hiện tại thông tin về vấn đề này chưa có trong kho tài liệu nội bộ trên hệ thống. Bạn vui lòng liên hệ trực tiếp Quản lý cửa hàng hoặc nhờ Admin bổ sung văn bản quy định này vào kho tài liệu nhé! 🦫";

export function buildDeterministicFallback(userQuery: string, relevantContext: string): string {
  if (relevantContext && relevantContext.trim()) {
    return `🍊 **Capy AI - Hướng dẫn nội bộ LimArt:**\n\nVề câu hỏi "${userQuery}", dưới đây là các thông tin và quy định được trích xuất từ tài liệu nội bộ công ty:\n\n${relevantContext.trim()}\n\n💡 *Nếu cần giải quyết trường hợp ngoại lệ hoặc chưa rõ mức xử lý, vui lòng liên hệ trực tiếp Quản lý cửa hàng để được hỗ trợ nhé! 🦫*`;
  }

  return STRICT_NOT_FOUND_MESSAGE;
}

let isPgVectorChecked = false;

export async function ensurePgVector(): Promise<boolean> {
  if (isPgVectorChecked) return true;
  try {
    if (typeof prisma.$executeRawUnsafe === "function") {
      await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");
    }
    isPgVectorChecked = true;
    return true;
  } catch (err) {
    console.warn("[PGVECTOR_EXTENSION_WARN] Could not ensure pgvector extension:", err);
    return false;
  }
}

export async function syncDocumentChunks(documentId: string, content: string): Promise<number> {
  await ensurePgVector();

  // Delete existing chunks for this document
  if (prisma.documentChunk?.deleteMany) {
    await prisma.documentChunk.deleteMany({
      where: { documentId },
    });
  }

  if (!content || !content.trim()) {
    return 0;
  }

  const chunks = chunkText(content);
  const geminiApiKey = getCleanGeminiApiKey();

  if (geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

      const CHUNK_CONCURRENCY = 4;
      for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
        const chunkBatch = chunks.slice(i, i + CHUNK_CONCURRENCY);
        await Promise.all(
          chunkBatch.map(async (chunkContent) => {
            try {
              const result = await model.embedContent(chunkContent);
              const embedding = result.embedding?.values;
              if (Array.isArray(embedding) && embedding.length > 0) {
                const vectorString = `[${embedding.join(",")}]`;
                if (typeof prisma.$executeRawUnsafe === "function") {
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding", "createdAt") 
                     VALUES (gen_random_uuid()::text, $1, $2, $3::vector, NOW())`,
                    documentId,
                    chunkContent,
                    vectorString
                  );
                }
              } else {
                if (typeof prisma.$executeRawUnsafe === "function") {
                  await prisma.$executeRawUnsafe(
                    `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "createdAt") 
                     VALUES (gen_random_uuid()::text, $1, $2, NOW())`,
                    documentId,
                    chunkContent
                  );
                }
              }
            } catch (embedItemErr) {
              console.warn("[EMBEDDING_CHUNK_WARN] Failed embedding for chunk:", embedItemErr);
              if (typeof prisma.$executeRawUnsafe === "function") {
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "createdAt") 
                   VALUES (gen_random_uuid()::text, $1, $2, NOW())`,
                  documentId,
                  chunkContent
                );
              }
            }
          })
        );
      }
      return chunks.length;
    } catch (embErr) {
      console.warn("[EMBEDDING_INIT_WARN] Gemini embedding failed, falling back to text chunks:", embErr);
    }
  }

  // Fallback if no gemini key or embedding init failed
  for (const chunkContent of chunks) {
    if (typeof prisma.$executeRawUnsafe === "function") {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "createdAt") 
         VALUES (gen_random_uuid()::text, $1, $2, NOW())`,
        documentId,
        chunkContent
      );
    }
  }
  return chunks.length;
}

let isAutoBackfilled = false;

export async function ensurePgVectorAndSyncChunks(
  force: boolean = false,
  docs?: Array<{ id: string; content: string; title?: string; path?: string }>
): Promise<{
  success: boolean;
  totalDocs: number;
  syncedDocs: number;
  totalChunks: number;
}> {
  await ensurePgVector();

  const allDocs =
    docs ||
    (await getOrSetCache("meta:documents:all", 600, () =>
      prisma.document.findMany({
        select: { id: true, title: true, path: true, content: true },
        orderBy: { createdAt: "desc" },
      })
    ));

  if (allDocs.length === 0) {
    return { success: true, totalDocs: 0, syncedDocs: 0, totalChunks: 0 };
  }

  let docIdsToSync: string[] = [];

  if (force) {
    docIdsToSync = allDocs.map((d) => d.id);
  } else {
    try {
      const chunkStats = await prisma.$queryRaw<
        Array<{ documentId: string; total: bigint | number; embedded: bigint | number }>
      >`
        SELECT 
          "documentId", 
          COUNT(*)::int as total, 
          COUNT("embedding")::int as embedded 
        FROM "DocumentChunk" 
        GROUP BY "documentId"
      `;

      const statMap = new Map<string, { total: number; embedded: number }>();
      for (const stat of chunkStats || []) {
        statMap.set(stat.documentId, {
          total: Number(stat.total || 0),
          embedded: Number(stat.embedded || 0),
        });
      }

      for (const doc of allDocs) {
        const s = statMap.get(doc.id);
        if (!s || s.total === 0 || s.embedded === 0) {
          docIdsToSync.push(doc.id);
        }
      }
    } catch {
      docIdsToSync = allDocs.map((d) => d.id);
    }
  }

  let syncedDocs = 0;
  let totalChunks = 0;

  const DOC_BATCH_SIZE = 3;
  for (let i = 0; i < allDocs.length; i += DOC_BATCH_SIZE) {
    const docBatch = allDocs.slice(i, i + DOC_BATCH_SIZE);
    const results = await Promise.all(
      docBatch.map(async (doc) => {
        if (docIdsToSync.includes(doc.id)) {
          const count = await syncDocumentChunks(doc.id, doc.content);
          return { synced: 1, chunks: count };
        }
        return { synced: 0, chunks: 0 };
      })
    );
    for (const res of results) {
      syncedDocs += res.synced;
      totalChunks += res.chunks;
    }
  }

  isAutoBackfilled = true;
  return {
    success: true,
    totalDocs: allDocs.length,
    syncedDocs,
    totalChunks,
  };
}

// ----------------------------------------------------------------------------
// 1. GET /api/documents - Returns list of all documents
// ----------------------------------------------------------------------------
documentsRoute.get("/", async (c) => {
  try {
    const docs = await getOrSetCache("meta:documents:all", 600, () =>
      prisma.document.findMany({
        select: {
          id: true,
          title: true,
          path: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { title: "asc" },
      })
    );

    return c.json({
      success: true,
      data: docs,
      documents: docs,
      count: docs.length,
    });
  } catch (error: any) {
    console.error("[DOCUMENTS_GET_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi tải danh sách tài liệu" },
      500
    );
  }
});

// ----------------------------------------------------------------------------
// 2. GET & POST /api/documents/reindex - Vector stats & Reindex embeddings
// ----------------------------------------------------------------------------
documentsRoute.get("/reindex", async (c) => {
  try {
    await ensurePgVector();
    let totalChunks = 0;
    let embeddedChunks = 0;

    if (typeof prisma.$queryRaw === "function") {
      const stats = await prisma.$queryRaw<
        Array<{ total_chunks: bigint | number; embedded_chunks: bigint | number }>
      >`
        SELECT 
          COUNT(*)::int as total_chunks, 
          COUNT("embedding")::int as embedded_chunks 
        FROM "DocumentChunk"
      `.catch(() => []);

      if (stats && stats.length > 0) {
        totalChunks = Number(stats[0].total_chunks || 0);
        embeddedChunks = Number(stats[0].embedded_chunks || 0);
      }
    }

    const totalDocs = await prisma.document.count().catch(() => 0);

    return c.json({
      success: true,
      totalDocuments: totalDocs,
      totalChunks,
      embeddedChunks,
    });
  } catch (err: any) {
    console.error("[REINDEX_STATS_ERROR]", err);
    return c.json(
      { success: false, error: err?.message || "Lỗi tải thống kê vector" },
      500
    );
  }
});

documentsRoute.post("/reindex", async (c) => {
  try {
    const force = c.req.query("force") === "true";
    const result = await ensurePgVectorAndSyncChunks(force);
    return c.json({
      success: true,
      message: `Đã đồng bộ vector embedding cho ${result.syncedDocs}/${result.totalDocs} tài liệu (${result.totalChunks} chunks)`,
      data: result,
    });
  } catch (err: any) {
    console.error("[REINDEX_ERROR]", err);
    return c.json(
      { success: false, error: err?.message || "Lỗi reindex vector" },
      500
    );
  }
});

// ----------------------------------------------------------------------------
// 3. GET /api/documents/:id - Returns single document details
// ----------------------------------------------------------------------------
documentsRoute.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const doc = await getOrSetCache("meta:documents:" + id, 1800, async () => {
      return prisma.document.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          path: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    if (!doc) {
      return c.json(
        { success: false, error: "Không tìm thấy tài liệu" },
        404
      );
    }

    return c.json({
      success: true,
      data: doc,
    });
  } catch (error: any) {
    console.error("[DOCUMENTS_GET_ID_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi tải chi tiết tài liệu" },
      500
    );
  }
});

// ----------------------------------------------------------------------------
// 3. POST /api/documents - Upload new document (.txt, .docx, .md)
// ----------------------------------------------------------------------------
documentsRoute.post("/", authMiddleware, adminMiddleware, async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";
    let title = "";
    let content = "";
    let fileName = "";
    let customPath = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;
      title = (formData.get("title") as string)?.trim() || "";
      customPath = (formData.get("path") as string)?.trim() || "";

      if (!file && !formData.get("content")) {
        return c.json(
          { success: false, error: "Vui lòng chọn file hoặc nhập nội dung tài liệu" },
          400
        );
      }

      if (file && typeof file === "object" && file.name) {
        fileName = file.name;
        const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();

        if (fileExtension === ".txt" || fileExtension === ".md") {
          content = await file.text();
        } else if (fileExtension === ".docx") {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const geminiApiKey = getCleanGeminiApiKey();

          try {
            const result = await mammoth.convertToHtml({ buffer });
            const rawHtml = result.value;

            if (geminiApiKey) {
              try {
                const genAI = new GoogleGenerativeAI(geminiApiKey);
                const systemInstruction =
                  "Bạn là chuyên gia chuyển đổi tài liệu. Hãy chuyển đổi mã HTML sau đây thành định dạng Markdown chuẩn (GFM - GitHub Flavored Markdown), giữ nguyên các bảng biểu (Markdown tables), danh sách, và định dạng tiêu đề. Chỉ trả về chuỗi Markdown sạch, không có thẻ codeblock ```markdown bao quanh.";
                const prompt = `Chuyển HTML này sang Markdown:\n\n${rawHtml}`;
                let markdown = await generateWithGeminiFallback(genAI, systemInstruction, prompt);

                if (markdown.startsWith("```")) {
                  markdown = markdown.replace(/^```[a-zA-Z]*\n/, "");
                  markdown = markdown.replace(/\n```$/, "");
                }
                content = markdown.trim();
              } catch (geminiError) {
                console.error("Lỗi khi chuyển đổi HTML bằng Gemini:", geminiError);
                const rawResult = await mammoth.extractRawText({ buffer });
                content = rawResult.value;
              }
            } else {
              const rawResult = await mammoth.extractRawText({ buffer });
              content = rawResult.value;
            }
          } catch (mammothErr: any) {
            console.error("Lỗi xử lý file docx:", mammothErr);
            return c.json(
              { success: false, error: "Không thể đọc file .docx: " + mammothErr.message },
              400
            );
          }
        } else {
          return c.json(
            { success: false, error: "Chỉ hỗ trợ file .docx, .txt hoặc .md" },
            400
          );
        }
      } else {
        content = (formData.get("content") as string) || "";
      }
    } else {
      // JSON body
      const json = await c.req.json().catch(() => ({}));
      title = json.title?.trim() || "";
      content = json.content?.trim() || "";
      customPath = json.path?.trim() || "";
    }

    if (!title) {
      title = fileName ? fileName.replace(/\.[^/.]+$/, "") : "Tài liệu mới";
    }

    if (!content.trim()) {
      return c.json(
        { success: false, error: "Tài liệu không chứa nội dung văn bản hợp lệ" },
        400
      );
    }

    const relativePath =
      customPath ||
      (fileName
        ? `uploads/${Date.now()}-${fileName}`
        : `uploads/${Date.now()}-doc.md`);

    // Upsert Document in Database
    const document = await prisma.document.upsert({
      where: { path: relativePath },
      create: {
        path: relativePath,
        title,
        content,
      },
      update: {
        title,
        content,
      },
    });

    // Sync chunks with pgvector embeddings
    await syncDocumentChunks(document.id, content);

    await invalidateCachePattern("meta:documents:*").catch(() => {});

    return c.json({
      success: true,
      data: document,
      message: "Tải tài liệu lên thành công",
    });
  } catch (error: any) {
    console.error("[DOCUMENTS_UPLOAD_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi xử lý file tài liệu" },
      500
    );
  }
});

// ----------------------------------------------------------------------------
// 4. DELETE /api/documents/:id - Delete document and associated chunks
// ----------------------------------------------------------------------------
documentsRoute.delete("/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param("id");

    const existing = await prisma.document.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json(
        { success: false, error: "Không tìm thấy tài liệu cần xóa" },
        404
      );
    }

    // Delete chunks first (or cascade)
    await prisma.documentChunk.deleteMany({
      where: { documentId: id },
    });

    // Delete document
    await prisma.document.delete({
      where: { id },
    });

    await invalidateCachePattern("meta:documents:*").catch(() => {});

    return c.json({
      success: true,
      message: `Đã xóa tài liệu "${existing.title}" thành công`,
    });
  } catch (error: any) {
    console.error("[DOCUMENTS_DELETE_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi xóa tài liệu" },
      500
    );
  }
});

// ----------------------------------------------------------------------------
// 5. PATCH & PUT /api/documents/:id - Update document title and content
// ----------------------------------------------------------------------------
documentsRoute.patch("/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { title, content } = body;

    const existing = await prisma.document.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json(
        { success: false, error: "Không tìm thấy tài liệu cần cập nhật" },
        404
      );
    }

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (content !== undefined) data.content = content.trim();

    const updated = await prisma.document.update({
      where: { id },
      data,
    });

    if (content !== undefined) {
      await syncDocumentChunks(id, updated.content);
    }

    await invalidateCachePattern("meta:documents:*").catch(() => {});

    return c.json({
      success: true,
      data: updated,
      message: "Cập nhật tài liệu thành công",
    });
  } catch (error: any) {
    console.error("[DOCUMENTS_UPDATE_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi cập nhật tài liệu" },
      500
    );
  }
});

documentsRoute.put("/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { title, content } = body;

    const existing = await prisma.document.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json(
        { success: false, error: "Không tìm thấy tài liệu cần cập nhật" },
        404
      );
    }

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (content !== undefined) data.content = content.trim();

    const updated = await prisma.document.update({
      where: { id },
      data,
    });

    if (content !== undefined) {
      await syncDocumentChunks(id, updated.content);
    }

    await invalidateCachePattern("meta:documents:*").catch(() => {});

    return c.json({
      success: true,
      data: updated,
      message: "Cập nhật tài liệu thành công",
    });
  } catch (error: any) {
    console.error("[DOCUMENTS_UPDATE_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi cập nhật tài liệu" },
      500
    );
  }
});

// ----------------------------------------------------------------------------
// 6. POST /api/documents/chat (or /api/chat) - Capy AI grounded chat
// ----------------------------------------------------------------------------
export function cleanAiOutputForHumans(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // 1. Convert LaTeX math symbols to natural unicode symbols
  cleaned = cleaned
    .replace(/\\ge\b|\\geq\b/g, "≥")
    .replace(/\\le\b|\\leq\b/g, "≤")
    .replace(/\\times\b/g, "×")
    .replace(/\\div\b/g, "÷")
    .replace(/\\pm\b/g, "±")
    .replace(/\\approx\b/g, "≈")
    .replace(/\\neq\b/g, "≠");

  // 2. Remove LaTeX math delimiters: $\ge 4$ -> ≥ 4, $$...$$ or $...$
  cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, "$1");
  cleaned = cleaned.replace(/\$([^$\n]+)\$/g, "$1");

  // 3. Remove leftover backslashes before math characters
  cleaned = cleaned.replace(/\\([><=+\-*\/])/g, "$1");

  return cleaned.trim();
}

export const handleCapyChat = async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const messages = body.messages || [];

    let userQuery = "";
    if (body.query) {
      userQuery = body.query;
    } else if (Array.isArray(messages) && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      userQuery = typeof lastMsg === "string" ? lastMsg : lastMsg.content;
    }

    if (!userQuery || !userQuery.trim()) {
      return c.json(
        { success: false, error: "Vui lòng nhập câu hỏi cho Capy AI" },
        400
      );
    }

    const geminiApiKey = getCleanGeminiApiKey();

    type SimilarChunk = {
      documentId?: string;
      content: string;
      path: string;
      title: string;
      distance: number;
    };

    let closeChunks: SimilarChunk[] = [];
    const matchedDocIds = new Set<string>();

    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const embeddingModel = genAI.getGenerativeModel({
          model: "gemini-embedding-001",
        });
        const embeddingResult = await embeddingModel.embedContent(userQuery);
        const queryVector = `[${embeddingResult.embedding.values.join(",")}]`;

        const similarChunks = await prisma.$queryRaw<SimilarChunk[]>`
          SELECT
            c."documentId",
            c.content,
            d.path,
            d.title,
            c.embedding <=> ${queryVector}::vector AS distance
          FROM "DocumentChunk" c
          JOIN "Document" d ON c."documentId" = d.id
          WHERE c.embedding IS NOT NULL
          ORDER BY distance ASC
          LIMIT 8
        `;

        // Only accept chunks with distance <= 0.65 (avoiding 0.35 drop of valid Vietnamese chunks)
        closeChunks = (similarChunks || []).filter((chunk) => chunk.distance <= 0.65);
        for (const chunk of closeChunks) {
          if (chunk.documentId) matchedDocIds.add(chunk.documentId);
        }
      } catch (ragErr) {
        console.warn("[RAG_SEARCH_FALLBACK]", ragErr);
      }
    }

    // Hybrid keyword search across all documents
    const allDocs = await getOrSetCache("meta:documents:all", 600, () =>
      prisma.document.findMany({
        select: { id: true, title: true, path: true, content: true },
        orderBy: { createdAt: "desc" },
      })
    );

    // Auto-trigger background backfill if not yet checked
    if (!isAutoBackfilled) {
      isAutoBackfilled = true;
      ensurePgVectorAndSyncChunks(false, allDocs).catch((err) => {
        console.warn("[AUTO_BACKFILL_BG_ERR]", err);
      });
    }

    const scoredDocs = scoreDocuments(userQuery, allDocs);
    const topScoredDocs = scoredDocs
      .filter((d) => d.score >= MIN_RELEVANCE_SCORE)
      .slice(0, 3);

    const contextParts: string[] = [];

    if (closeChunks.length > 0) {
      closeChunks.forEach((chunk, index) => {
        contextParts.push(
          `--- ĐOẠN TRÍCH ${index + 1}: ${chunk.title} (${chunk.path}) [Khoảng cách vector: ${chunk.distance.toFixed(3)}] ---\n${chunk.content}`
        );
      });
    }

    for (const doc of topScoredDocs) {
      if (!matchedDocIds.has(doc.id)) {
        contextParts.push(
          `--- TÀI LIỆU KHỚP TỪ KHOÁ: ${doc.title} (${doc.path}) [Điểm tương quan: ${doc.score}đ] ---\n${doc.content}`
        );
        matchedDocIds.add(doc.id);
      }
    }

    const relevantContext = contextParts.join("\n\n").trim();

    // 100% STRICT RAG: If no relevant context found from DB, return strict not found message immediately!
    if (!relevantContext) {
      return c.json({
        success: true,
        reply: STRICT_NOT_FOUND_MESSAGE,
        content: STRICT_NOT_FOUND_MESSAGE,
      });
    }

    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const systemInstruction = `Bạn là Capy AI - Trợ lý vận hành và hỗ trợ nội bộ của LimArt (Cửa hàng Họa cụ & Mỹ thuật).
Nhiệm vụ của bạn là giải đáp chính xác, đầy đủ, chi tiết từng bước cho nhân viên và quản lý dựa trên các quy định và tài liệu nội bộ của công ty.

QUY TẮC BẮT BUỘC (100% STRICT RAG):
1. NGUỒN THÔNG TIN DUY NHẤT:
   - Bạn CHỈ ĐƯỢC PHÉP trả lời dựa trên nội dung trong mục "TÀI LIỆU NỘI BỘ THAM KHẢO" bên dưới.
   - CẤM TUYỆT ĐỐI tự sáng tạo, suy diễn, phỏng đoán, bịa thêm quy định, chính sách, số liệu, địa chỉ hoặc bất kỳ thông tin nào không nằm trong TÀI LIỆU NỘI BỘ THAM KHẢO.
2. TRÌNH BÀY RÕ RÀNG, DỄ ĐỌC TRÊN ĐIỆN THOẠI DI ĐỘNG:
   - Trình bày câu trả lời rõ ràng, thoáng đãng, chia thành các mục ngắn gọn có icon hoặc số thứ tự đầu dòng (ví dụ: 1️⃣, 2️⃣, 📌, 💬, •).
   - TUYỆT ĐỐI KHÔNG dùng công thức toán học LaTeX ($...$, \\ge, \\times, \\le) — hãy viết bằng tiếng Việt tự nhiên hoặc ký hiệu phổ thông (≥, ≤, ×, ÷).
   - Tránh dùng bảng Markdown phức tạp (|---|---|) gây tràn màn hình điện thoại, hãy chuyển sang dạng danh sách các gạch đầu dòng phân cấp rõ ràng, dễ nhìn.
   - Khi thông tin CÓ trong tài liệu tham khảo: Trình bày đầy đủ, chi tiết từng bước, giữ nguyên định mức, quy định, mốc thời gian, số tiền và mẫu câu chuẩn có trong tài liệu.
   - Tuyệt đối không tóm tắt cụt lủn và TUYỆT ĐỐI KHÔNG ghi câu dạng "xem chi tiết ở tab Kho tài liệu" hay "tra cứu cẩm nang".
3. KHI KHÔNG CÓ THÔNG TIN TRONG TÀI LIỆU:
   - Nếu câu hỏi của người dùng hoàn toàn KHÔNG CÓ thông tin hoặc không thể trả lời dựa trên TÀI LIỆU NỘI BỘ THAM KHẢO, bạn BẮT BUỘC trả lời chính xác câu sau:
     "${STRICT_NOT_FOUND_MESSAGE}"
4. PHONG CÁCH: Thân thiện, tận tâm như chú chuột lang nước Capy (sử dụng emoji 🍊, 🦫).
5. Luôn trả lời bằng tiếng Việt.

TÀI LIỆU NỘI BỘ THAM KHẢO:
${relevantContext}`;

        const prompt = `Câu hỏi của người dùng: ${userQuery}`;
        const rawReply = await generateWithGeminiFallback(genAI, systemInstruction, prompt);
        const replyText = cleanAiOutputForHumans(rawReply);

        return c.json({
          success: true,
          reply: replyText,
          content: replyText,
        });
      } catch (geminiGenErr: any) {
        console.error("[GEMINI_GEN_ERROR]", geminiGenErr);
      }
    }

    // Deterministic fallback answer when Gemini is not configured or all models fail
    const fallbackRaw = buildDeterministicFallback(userQuery, relevantContext);
    const fallbackAnswer = cleanAiOutputForHumans(fallbackRaw);

    return c.json({
      success: true,
      reply: fallbackAnswer,
      content: fallbackAnswer,
    });
  } catch (error: any) {
    console.error("[CHAT_ERROR]", error);
    return c.json(
      { success: false, error: error.message || "Lỗi xử lý chat" },
      500
    );
  }
};

documentsRoute.post("/chat", handleCapyChat);


