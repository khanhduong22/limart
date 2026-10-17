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
  const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
  let lastError: any = null;
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
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

export function buildDeterministicFallback(userQuery: string, relevantContext: string): string {
  const lowerQuery = userQuery.toLowerCase();

  // 1. Store Address / Location
  if (
    lowerQuery.includes("địa chỉ") ||
    lowerQuery.includes("ở đâu") ||
    lowerQuery.includes("cửa hàng") ||
    lowerQuery.includes("shop ở") ||
    (lowerQuery.includes("shop") && (lowerQuery.includes("đâu") || lowerQuery.includes("địa chỉ") || lowerQuery.includes("qua")))
  ) {
    return `📍 **Thông tin địa chỉ Cửa hàng Họa cụ LimArt:**

🏠 **Địa chỉ:** Cửa hàng LimArt (Vui lòng chọn đúng chi nhánh bạn đang trực hoặc đính kèm vị trí Google Maps của shop).
⏰ **Giờ mở cửa:** 8h30 - 21h30 (Tất cả các ngày trong tuần, kể cả Thứ 7 & Chủ Nhật).
📞 **Hotline hỗ trợ:** Liên hệ Hotline cửa hàng hoặc Fanpage Họa cụ LimArt.

💬 **Mẫu tin nhắn chuẩn gửi khách (Nhân viên copy gửi ngay):**
---
"Dạ em chào anh/chị ạ! 🎨
Dạ cửa hàng LimArt mở cửa từ 8h30 đến 21h30 tất cả các ngày trong tuần ạ.
📍 Địa chỉ shop tại: [Điền địa chỉ cơ sở / Chi nhánh gần khách nhất]
Anh/chị có thể ghé trực tiếp để xem và trải nghiệm thử các mẫu họa cụ, giấy vẽ, cọ và màu vẽ nhé ạ! Nếu cần chỉ đường chi tiết hơn, anh/chị nhắn em hỗ trợ ngay nha! 🍊"
---`;
  }

  // 2. Broken / Damaged Goods & Complaint Handling
  if (
    lowerQuery.includes("vỡ") ||
    lowerQuery.includes("hỏng") ||
    lowerQuery.includes("bể") ||
    lowerQuery.includes("móp") ||
    lowerQuery.includes("rách") ||
    lowerQuery.includes("lỗi") ||
    lowerQuery.includes("khiếu nại") ||
    lowerQuery.includes("đổi trả") ||
    lowerQuery.includes("đền bù")
  ) {
    return `📦 **Quy trình xử lý sự cố hàng bị vỡ / hỏng khi nhận hàng:**

1️⃣ **Bước 1: Tiếp nhận và xoa dịu khách hàng ngay lập tức**
- Gửi lời xin lỗi chân thành vì sự cố vận chuyển ngoài ý muốn làm gián đoạn trải nghiệm của khách.
- Nhờ khách chụp ảnh chi tiết sản phẩm hỏng, mã vận đơn bên ngoài vỏ hộp và **Video mở kiện hàng (unboxing)** để shop làm việc đối soát với đơn vị vận chuyển.

2️⃣ **Bước 2: Đối chiếu hạn mức tự giải quyết khiếu nại**
- **Hỏng/vỡ nhẹ vẫn dùng được:** Thương lượng hỗ trợ hoàn tiền một phần (20% - 50% tuỳ mức độ) hoặc tặng mã voucher giảm giá cho đơn hàng tiếp theo.
- **Vỡ nát, hỏng hoàn toàn (màu đổ tràn, chai lọ vỡ, toan rách không dùng được):** Tiến hành gửi bù ngay 01 sản phẩm mới 100% (miễn phí ship hoàn toàn) hoặc hoàn tiền 100% giá trị sản phẩm.
- *Lưu ý:* Nếu giá trị đơn hàng vượt hạn mức nhân viên được tự duyệt theo quy chế, chụp màn hình gửi nhóm nội bộ để Quản lý duyệt ngay trong vòng 15 phút.

3️⃣ **Bước 3: Lưu hồ sơ khiếu nại**
- Ghi nhận thông tin đơn hàng lên hệ thống để bộ phận kho tiến hành khiếu nại bồi thường từ đơn vị vận chuyển.

💬 **Mẫu tin nhắn chuẩn gửi khách (Nhân viên copy gửi ngay):**
---
"Dạ em chào anh/chị ạ! 🎨
Dạ em thật sự xin lỗi anh/chị vì sự cố đơn hàng bị [vỡ/hỏng] trong quá trình vận chuyển, khiến trải nghiệm của mình chưa được trọn vẹn ạ. Anh/chị cho em xin thêm hình ảnh/video mở gói hàng và ảnh mã vận đơn bên ngoài hộp để shop xử lý đổi mới hoặc hoàn tiền ngay cho mình nhé ạ.
Shop cam kết bảo vệ 100% quyền lợi của anh/chị, anh/chị yên tâm nha! Em đợi phản hồi của mình ạ. 🍊"
---`;
  }

  // 3. Late check-in rules
  if (lowerQuery.includes("muộn") || lowerQuery.includes("trễ")) {
    return `📌 **Quy tắc phạt và xử lý đi muộn:**

1️⃣ **Thời gian ân hạn:**
- Hệ thống áp dụng thời gian ân hạn **1 phút** so với giờ ca làm việc đã đăng ký.

2️⃣ **Xử lý vi phạm:**
- Check-in muộn từ phút thứ 2 trở đi sẽ tự động tính vào Bảng vi phạm của tháng.
- Mức phạt được tính luỹ tiến theo số lần vi phạm trong tháng: trừ điểm chuyên cần nội bộ và quy đổi trừ giờ công theo quy chế.

3️⃣ **Thủ tục giải trình:**
- Trường hợp có lý do bất khả kháng (hỏng xe, mưa ngập, sự cố kỹ thuật...), nhân viên vào mục **📝 Xin giải trình** trong vòng 24 giờ để gửi Quản lý phê duyệt.`;
  }

  // 4. Bonuses & Packing reward
  if (
    lowerQuery.includes("thưởng") ||
    lowerQuery.includes("chuyên cần") ||
    lowerQuery.includes("200k")
  ) {
    return `🏆 **Chính sách thưởng nóng & Vinh danh nhân viên:**

1️⃣ **Top 1 Chăm chỉ (Số giờ làm cao nhất tháng):**
- Đạt tối thiểu **130 giờ công** trong tháng sẽ được thưởng nóng **+200.000 ₫** cộng vào bảng lương.

2️⃣ **Vua Đóng Hàng:**
- Tích luỹ trên **50 điểm** đóng gói đơn hàng trong tháng sẽ nhận thưởng nóng **+200.000 ₫**.

3️⃣ **Thưởng bưng hàng lên lầu:**
- Nhân viên tích luỹ từ **≥ 10 điểm** bưng vác hàng lên lầu được cộng thưởng nóng trực tiếp vào kỳ lương.`;
  }

  // 5. Lucky wheel
  if (lowerQuery.includes("quay") || lowerQuery.includes("vòng quay")) {
    return `🎰 **Quy chế Vòng Quay May Mắn LimArt:**

1️⃣ **Điều kiện tham gia:**
- Nhân viên phải hoàn thành Check-in hợp lệ trong ngày.
- Chưa thực hiện lượt quay nào trong ngày hôm đó.

2️⃣ **Cấp quyền quay:**
- Quản lý có thể cấp/mở quyền trong danh mục **Nhân sự** hoặc tab **Vòng quay**.
- Phần thưởng sẽ được ghi nhận và tổng hợp tự động vào bảng lương cuối tháng.`;
  }

  // 6. Generic response with structured document context or helpful guidance
  if (relevantContext) {
    return `🍊 **Capy AI - Hướng dẫn nội bộ LimArt:**

Về câu hỏi "${userQuery}", dưới đây là các thông tin và quy định được trích xuất từ tài liệu công ty:

${relevantContext.slice(0, 1500)}

💡 **Hành động đề xuất cho nhân viên:**
- Đối chiếu đúng trường hợp của bạn với các tiêu chí nêu trên.
- Nếu cần giải quyết ngoại lệ hoặc chưa rõ mức xử lý, vui lòng liên hệ ngay Quản lý ca trực để được hỗ trợ trực tiếp nhé! 🦫✨`;
  }

  return `🍊 **Capy AI - Hướng dẫn nội bộ LimArt:**

Về câu hỏi: "${userQuery}".

Hiện tại cẩm nang nội bộ chưa có kịch bản riêng cho tình huống này.
Dưới đây là nguyên tắc vận hành bạn cần lưu ý:
- Giữ thái độ phục vụ tận tâm, lịch sự và lắng nghe khách hàng.
- Tuyệt đối không tự ý cam kết các vấn đề tài chính hoặc bồi thường vượt hạn mức quy định.
- Hãy thông báo ngay cho Quản lý cửa hàng qua kênh chat nội bộ để được chỉ đạo cách xử lý chuẩn xác nhất nhé! 🦫✨`;
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
          const geminiApiKey = getCleanGeminiApiKey();

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
    const geminiApiKey = getCleanGeminiApiKey();

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

        // Only accept chunks with meaningful semantic proximity (distance <= 0.35)
        const closeChunks = (similarChunks || []).filter((chunk) => chunk.distance <= 0.35);

        if (closeChunks.length > 0) {
          relevantContext = closeChunks.reduce((acc, chunk, index) => {
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

    // Relevance scoring search across Document if RAG returned nothing
    if (!relevantContext) {
      const allDocs = await getOrSetCache("meta:documents:all", 600, () =>
        prisma.document.findMany({
          select: { id: true, title: true, path: true, content: true },
          orderBy: { createdAt: "desc" },
        })
      );

      const scoredDocs = scoreDocuments(userQuery, allDocs);
      const topDocs = scoredDocs.filter((d) => d.score >= MIN_RELEVANCE_SCORE).slice(0, 3);

      if (topDocs.length > 0) {
        relevantContext = topDocs
          .map(
            (doc, idx) =>
              `--- TÀI LIỆU ${idx + 1}: ${doc.title} (${doc.path}) [Độ tương quan: ${doc.score}đ] ---\n${doc.content.slice(0, 1500)}...\n\n`
          )
          .join("\n");
      }
    }

    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const systemInstruction = `Bạn là Capy AI - Trợ lý vận hành và chăm sóc khách hàng nội bộ của LimArt (Cửa hàng Họa cụ & Mỹ thuật).
Nhiệm vụ của bạn là giải đáp chính xác, đầy đủ, chi tiết từng bước cho nhân viên và quản lý về quy trình xử lý đơn hàng, chăm sóc khách hàng, quy chế công ty, chấm công, tính lương thưởng.

NGUYÊN TẮC BẮT BUỘC:
1. TRẢ LỜI ĐẦY ĐỦ, CHI TIẾT TỪNG BƯỚC:
   - Trình bày mạch lạc với các gạch đầu dòng rõ ràng.
   - Hướng dẫn cụ thể hành động nhân viên cần làm ngay lập tức (Bước 1, Bước 2, Bước 3...).
   - TUYỆT ĐỐI KHÔNG trả lời hời hợt, không tóm tắt cụt lủn và TUYỆT ĐỐI KHÔNG bảo người dùng tự tìm đọc trong kho tài liệu hay cẩm nang.
2. XỬ LÝ TÌNH HUỐNG KHÁCH HÀNG (Hàng vỡ/hỏng, hỏi địa chỉ shop, khiếu nại, đổi trả, bảo hành...):
   - Luôn cung cấp:
     * Các bước xử lý ngay tại quầy hoặc trên tin nhắn.
     * Mẫu tin nhắn chuẩn (kèm lời chào, lời xin lỗi nếu có sự cố, câu từ lịch sự, chuyên nghiệp) để nhân viên copy gửi khách ngay.
     * Hạn mức bồi thường / tự giải quyết (nếu có tài liệu liên quan quy định).
   - Với câu hỏi về địa chỉ shop: Cung cấp thông tin giờ mở cửa (8h30 - 21h30), nhắc nhân viên gửi đúng chi nhánh và kèm mẫu tin nhắn chỉ đường/chào đón khách.
3. SỬ DỤNG TÀI LIỆU NỘI BỘ THAM KHẢO:
   - Nếu tài liệu có thông tin liên quan, hãy áp dụng triệt để các số liệu, hạn mức, quy định trong tài liệu.
   - Nếu tài liệu ghi "Kho tài liệu nội bộ chưa có văn bản riêng cho nội dung này", hãy chủ động giải đáp bằng kinh nghiệm nghiệp vụ bán lẻ họa cụ / CSKH chuẩn mực, tận tâm và hợp lý, đồng thời nhắc nhân viên báo quản lý nếu vượt thẩm quyền.
4. PHONG CÁCH: Thân thiện, hỗ trợ nhiệt tình như chú chuột lang nước Capy (sử dụng emoji 🍊, 🦫).
5. Luôn trả lời bằng tiếng Việt.

TÀI LIỆU NỘI BỘ THAM KHẢO:
${relevantContext || "Kho tài liệu nội bộ chưa có văn bản riêng cho nội dung này."}`;

        const prompt = `Câu hỏi của người dùng: ${userQuery}`;
        const replyText = await generateWithGeminiFallback(genAI, systemInstruction, prompt);

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
    const fallbackAnswer = buildDeterministicFallback(userQuery, relevantContext);

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
