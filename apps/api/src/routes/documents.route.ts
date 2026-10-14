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
// 2. GET /api/documents/:id - Returns single document details
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
          const geminiApiKey =
            process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

          try {
            const result = await mammoth.convertToHtml({ buffer });
            const rawHtml = result.value;

            if (geminiApiKey) {
              try {
                const genAI = new GoogleGenerativeAI(geminiApiKey);
                const structureModel = genAI.getGenerativeModel({
                  model: "gemini-2.5-flash",
                  systemInstruction:
                    "Bạn là chuyên gia chuyển đổi tài liệu. Hãy chuyển đổi mã HTML sau đây thành định dạng Markdown chuẩn (GFM - GitHub Flavored Markdown), giữ nguyên các bảng biểu (Markdown tables), danh sách, và định dạng tiêu đề. Chỉ trả về chuỗi Markdown sạch, không có thẻ codeblock ```markdown bao quanh.",
                });
                const prompt = `Chuyển HTML này sang Markdown:\n\n${rawHtml}`;
                const responseResult = await structureModel.generateContent(prompt);
                let markdown = responseResult.response.text().trim();

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

    // Clean up existing chunks
    await prisma.documentChunk.deleteMany({
      where: { documentId: document.id },
    });

    // Chunk text
    const chunks = chunkText(content);
    const geminiApiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

        for (const chunkContent of chunks) {
          try {
            const result = await model.embedContent(chunkContent);
            const embedding = result.embedding.values;
            const vectorString = `[${embedding.join(",")}]`;

            await prisma.$executeRawUnsafe(
              `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding", "createdAt") 
               VALUES (gen_random_uuid()::text, $1, $2, $3::vector, NOW())`,
              document.id,
              chunkContent,
              vectorString
            );
          } catch {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "createdAt") 
               VALUES (gen_random_uuid()::text, $1, $2, NOW())`,
              document.id,
              chunkContent
            );
          }
        }
      } catch (embErr) {
        console.error("Lỗi embedding Gemini:", embErr);
        for (const chunkContent of chunks) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "createdAt") 
             VALUES (gen_random_uuid()::text, $1, $2, NOW())`,
            document.id,
            chunkContent
          );
        }
      }
    } else {
      for (const chunkContent of chunks) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "createdAt") 
           VALUES (gen_random_uuid()::text, $1, $2, NOW())`,
          document.id,
          chunkContent
        );
      }
    }

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
documentsRoute.post("/chat", async (c) => {
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

    const geminiApiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    let relevantContext = "";
    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const embeddingModel = genAI.getGenerativeModel({
          model: "gemini-embedding-001",
        });
        const embeddingResult = await embeddingModel.embedContent(userQuery);
        const queryVector = `[${embeddingResult.embedding.values.join(",")}]`;

        type SimilarChunk = {
          content: string;
          path: string;
          title: string;
          distance: number;
        };

        const similarChunks = await prisma.$queryRaw<SimilarChunk[]>`
          SELECT
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

        if (similarChunks && similarChunks.length > 0) {
          relevantContext = similarChunks.reduce((acc, chunk, index) => {
            return (
              acc +
              `--- TÀI LIỆU ${index + 1}: ${chunk.title} (${chunk.path}) ---\n${chunk.content}\n\n`
            );
          }, "Thông tin trích xuất từ cẩm nang tài liệu Checkin App / LimArt:\n\n");
        }
      } catch (ragErr) {
        console.warn("[RAG_SEARCH_FALLBACK]", ragErr);
      }
    }

    // Fallback to keyword matching across Document if RAG returned nothing
    if (!relevantContext) {
      const keywords = userQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 2);

      const allDocs = await getOrSetCache("meta:documents:all", 600, () =>
        prisma.document.findMany({ orderBy: { createdAt: "desc" } })
      );

      const matchedDocs = allDocs
        .filter((doc) => {
          const text = (doc.title + " " + doc.content).toLowerCase();
          return keywords.some((k: string) => text.includes(k));
        })
        .slice(0, 3);

      if (matchedDocs.length > 0) {
        relevantContext = matchedDocs
          .map(
            (doc, idx) =>
              `--- TÀI LIỆU ${idx + 1}: ${doc.title} (${doc.path}) ---\n${doc.content.slice(0, 1500)}...\n\n`
          )
          .join("\n");
      }
    }

    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: `Bạn là Capy AI - Trợ lý vận hành và hướng dẫn nội bộ cho công ty LimArt (Checkin App).
Nhiệm vụ của bạn là giải đáp chính xác, thân thiện, súc tích cho nhân viên và quản lý về quy chế công ty, tính lương thưởng, chấm công, nghỉ phép dựa trên tài liệu nội bộ.

NGUYÊN TẮC:
1. Trả lời trực tiếp, rõ ràng, gạch đầu dòng các ý quan trọng.
2. Dựa vào thông tin tài liệu được cung cấp dưới đây. Nếu không có thông tin, hãy thành thật trả lời là quy định này chưa có trong kho tài liệu hiện tại, đừng bịa đặt.
3. Luôn giữ phong cách thân thiện, nhiệt tình của chú chuột lang nước Capy (có emoji 🍊, 🦫).
4. Luôn trả lời bằng tiếng Việt.

TÀI LIỆU NỘI BỘ THAM KHẢO:
${relevantContext || "Hiện chưa tìm thấy tài liệu phù hợp trực tiếp với từ khóa."}
`,
        });

        const prompt = `Câu hỏi của người dùng: ${userQuery}`;
        const result = await model.generateContent(prompt);
        const replyText = result.response.text();

        return c.json({
          success: true,
          reply: replyText,
          content: replyText,
        });
      } catch (geminiGenErr: any) {
        console.error("[GEMINI_GEN_ERROR]", geminiGenErr);
      }
    }

    // Deterministic fallback answer
    let fallbackAnswer = "";
    if (userQuery.includes("muộn") || userQuery.includes("trễ")) {
      fallbackAnswer =
        "📌 **Quy tắc phạt đi muộn:**\n- Có thời gian ân hạn 1 phút so với giờ ca làm việc.\n- Muộn từ phút thứ 2 trở đi sẽ tính vào Bảng vi phạm.\n- Phạt luỹ tiến theo số lần vi phạm trong tháng: trừ điểm chuyên cần và quy đổi giờ công.";
    } else if (
      userQuery.includes("thưởng") ||
      userQuery.includes("chuyên cần") ||
      userQuery.includes("200k")
    ) {
      fallbackAnswer =
        "🏆 **Điều kiện nhận thưởng:**\n- **Top 1 Chăm chỉ (Giờ làm):** Đạt tối thiểu 130 giờ công trong tháng nhận thưởng ngay +200.000 ₫.\n- **Vua Đóng Hàng:** Đạt điểm tích luỹ >50đ nhận +200.000 ₫.\n- **Bưng hàng:** Bưng hàng lên lầu ≥10đ có thưởng nóng cộng vào bảng lương.";
    } else if (userQuery.includes("quay") || userQuery.includes("vòng quay")) {
      fallbackAnswer =
        "🎰 **Vòng Quay May Mắn:**\n- Quản lý có thể cấp quyền trong danh mục Nhân sự hoặc tab Vòng quay.\n- Nhân viên phải check-in thành công trong ngày và chưa quay hôm nay.";
    } else {
      fallbackAnswer = `Capy AI đã ghi nhận câu hỏi của bạn về "${userQuery}".\n\n${
        relevantContext
          ? "Dựa vào kho tài liệu:\n" +
            relevantContext.slice(0, 300) +
            "...\n\nBạn có thể xem chi tiết ở tab 'Kho tài liệu & Quy chế' bên cạnh nhé! 🍊"
          : "Bạn có thể tra cứu nhanh cẩm nang quy chế ở tab 'Kho tài liệu & Quy chế' bên cạnh nhé! 🍊"
      }`;
    }

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
});
