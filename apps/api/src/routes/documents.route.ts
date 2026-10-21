import { Hono } from "hono";
import { prisma } from "@checkin/db";
import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authMiddleware, adminMiddleware, AppEnv } from "../middleware/auth.middleware";
import { getOrSetCache, invalidateCachePattern } from "../lib/cache";
import { getCurrentTenantId } from "../middleware/tenant.middleware";
import {
  normalizeCapyQuery,
  removeVietnameseAccents,
  lookupTier1ExactOrGrep,
  lookupTier2SemanticCache,
  saveToCapyRagCache,
  invalidateCapyRagCache,
  ensurePgvectorHalfvecIndexes,
  hybridSearchDocumentChunksRRF,
  computeRrfScore,
  syncDocumentsToMeilisearch,
  searchDocumentsInMeilisearch,
} from "../lib/capy-rag-cache";

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
  const unaccentedPhrases = phrases.map((p) => removeVietnameseAccents(p.toLowerCase()));
  const unaccentedKeywords = keywords.map((k) => removeVietnameseAccents(k.toLowerCase()));

  for (const doc of docs) {
    const titleLower = doc.title.toLowerCase();
    const contentLower = doc.content.toLowerCase();
    const titleUnacc = removeVietnameseAccents(titleLower);
    const contentUnacc = removeVietnameseAccents(contentLower);
    let score = 0;

    // 1. Phrase match (+50 points)
    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      const unacc = unaccentedPhrases[i];
      if (titleLower.includes(phrase) || (unacc && titleUnacc.includes(unacc))) {
        score += 50;
      } else if (contentLower.includes(phrase) || (unacc && contentUnacc.includes(unacc))) {
        score += 50;
      }
    }

    // 2. Keyword match in title (+20 points)
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const unacc = unaccentedKeywords[i];
      if (titleLower.includes(kw) || (unacc && titleUnacc.includes(unacc))) {
        score += 20;
      }
    }

    // 3. Keyword match in content (+5 points)
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const unacc = unaccentedKeywords[i];
      if (contentLower.includes(kw) || (unacc && contentUnacc.includes(unacc))) {
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

export const CORE_OPERATIONAL_KNOWLEDGE = `
[CẨM NANG & QUY CHẾ VẬN HÀNH CỐT LÕI LIMART]

1. CHÍNH SÁCH THƯỞNG NÓNG & CHUYÊN CẦN:
- Top 1 Chăm chỉ (Số giờ làm cao nhất tháng): Đạt tối thiểu 130 giờ công trong tháng sẽ được thưởng nóng +200.000 ₫ cộng vào bảng lương.
- Vua Đóng Hàng: Tích luỹ trên 50 điểm đóng gói đơn hàng trong tháng sẽ nhận thưởng nóng +200.000 ₫.
- Thưởng bưng hàng lên lầu: Nhân viên tích luỹ từ ≥ 10 điểm bưng vác hàng lên lầu được cộng thưởng nóng trực tiếp vào kỳ lương.

2. QUY TẮC PHẠT & XỬ LÝ ĐI MUỘN:
- Thời gian ân hạn: Hệ thống áp dụng thời gian ân hạn 1 phút so với giờ ca làm việc đã đăng ký.
- Xử lý vi phạm: Check-in muộn từ phút thứ 2 trở đi sẽ tự động tính vào Bảng vi phạm của tháng. Mức phạt được tính luỹ tiến theo số lần vi phạm trong tháng: trừ điểm chuyên cần nội bộ và quy đổi trừ giờ công theo quy chế.
- Thủ tục giải trình: Trường hợp có lý do bất khả kháng (hỏng xe, mưa ngập, sự cố kỹ thuật...), nhân viên vào mục "📝 Xin giải trình" trong vòng 24 giờ để gửi Quản lý phê duyệt.

3. QUY CHẾ VÒNG QUAY MAY MẮN:
- Điều kiện tham gia: Nhân viên phải hoàn thành Check-in hợp lệ trong ngày và chưa thực hiện lượt quay nào trong ngày hôm đó.
- Cấp quyền quay: Quản lý có thể cấp/mở quyền trong danh mục Nhân sự (switch Vòng quay) hoặc tab Vòng quay > Cấp quyền quay. Phần thưởng sẽ được ghi nhận và tổng hợp tự động vào bảng lương cuối tháng.

4. QUY TRÌNH XỬ LÝ SỰ CỐ HÀNG VỠ / HỎNG (3 BƯỚC):
- Bước 1: Tiếp nhận và xoa dịu khách hàng ngay lập tức. Gửi lời xin lỗi chân thành vì sự cố vận chuyển ngoài ý muốn. Nhờ khách chụp ảnh chi tiết sản phẩm hỏng, mã vận đơn bên ngoài vỏ hộp và Video mở kiện hàng (unboxing) để shop làm việc đối soát với đơn vị vận chuyển.
- Bước 2: Đối chiếu hạn mức tự giải quyết khiếu nại:
  + Hỏng/vỡ nhẹ vẫn dùng được: Thương lượng hỗ trợ hoàn tiền một phần (20% - 50% tuỳ mức độ) hoặc tặng mã voucher giảm giá cho đơn hàng tiếp theo.
  + Vỡ nát, hỏng hoàn toàn (màu đổ tràn, chai lọ vỡ, toan rách không dùng được): Tiến hành gửi bù ngay 01 sản phẩm mới 100% (miễn phí ship hoàn toàn) hoặc hoàn tiền 100% giá trị sản phẩm.
  + Lưu ý: Nếu giá trị đơn hàng vượt hạn mức nhân viên được tự duyệt theo quy chế, chụp màn hình gửi nhóm nội bộ để Quản lý duyệt ngay trong vòng 15 phút.
- Bước 3: Lưu hồ sơ khiếu nại. Ghi nhận thông tin đơn hàng lên hệ thống để bộ phận kho tiến hành khiếu nại bồi thường từ đơn vị vận chuyển.
- Mẫu tin nhắn chuẩn gửi khách:
"Dạ em chào anh/chị ạ! 🎨 Dạ em thật sự xin lỗi anh/chị vì sự cố đơn hàng bị [vỡ/hỏng] trong quá trình vận chuyển, khiến trải nghiệm của mình chưa được trọn vẹn ạ. Anh/chị cho em xin thêm hình ảnh/video mở gói hàng và ảnh mã vận đơn bên ngoài hộp để shop xử lý đổi mới hoặc hoàn tiền ngay cho mình nhé ạ. Shop cam kết bảo vệ 100% quyền lợi của anh/chị, anh/chị yên tâm nha! Em đợi phản hồi của mình ạ. 🍊"

5. THÔNG TIN CỬA HÀNG & KÊNH HỖ TRỢ:
- Giờ mở cửa: 8h30 - 21h30 (Tất cả các ngày trong tuần, kể cả Thứ 7 & Chủ Nhật).
- Địa chỉ: Cửa hàng Họa cụ LimArt (Vui lòng chọn đúng chi nhánh bạn đang trực hoặc đính kèm vị trí Google Maps của shop).
- Kênh hỗ trợ: Hotline cửa hàng hoặc Fanpage Họa cụ LimArt.
- Mẫu tin nhắn chuẩn gửi khách hỏi địa chỉ:
"Dạ em chào anh/chị ạ! 🎨 Dạ cửa hàng LimArt mở cửa từ 8h30 đến 21h30 tất cả các ngày trong tuần ạ. 📍 Địa chỉ shop tại: [Điền địa chỉ cơ sở / Chi nhánh gần khách nhất]. Anh/chị có thể ghé trực tiếp để xem và trải nghiệm thử các mẫu họa cụ, giấy vẽ, cọ và màu vẽ nhé ạ! Nếu cần chỉ đường chi tiết hơn, anh/chị nhắn em hỗ trợ ngay nha! 🍊"

6. QUY TRÌNH DUYỆT WFH & ĐÓNG GÓI HÀNG:
- Làm việc tại nhà (WFH): Nhân viên gửi yêu cầu WFH trên ứng dụng → Quản lý duyệt. Khi được duyệt: nếu ngày đó không có check-in thực tế, hệ thống tự động ghi nhận 8 giờ công và hiển thị 'Làm việc từ xa (WFH)' mà không cần Check-in qua IP Wi-Fi văn phòng.
- Đóng gói hàng: Nhân viên nhận nhiệm vụ tại mục Sàn việc / WFH Tasks, chụp ảnh/báo cáo kết quả đóng đơn để Quản lý duyệt điểm tích luỹ (>50 điểm nhận thưởng Vua Đóng Hàng +200.000 ₫).

7. QUY TRÌNH XIN GIẢI TRÌNH CHẤM CÔNG:
- Khi cần giải trình đi muộn, về sớm, quên chấm công hoặc xin nghỉ phép:
- Nhân viên vào mục "📝 Xin giải trình" (hoặc truy cập /requests), chọn ngày cần giải trình, điền lý do rõ ràng và nhấn "Gửi yêu cầu".
- Quản lý sẽ xem xét và phê duyệt trong vòng 24 giờ.

8. CÁCH ĐĂNG KÝ LỊCH LÀM VIỆC & SANG NHƯỢNG CA:
- Nhân viên vào mục "📅 Lịch trực" (hoặc truy cập /schedule), chọn tuần và các ca trống để đăng ký:
  + Ca Sáng: 8h30 - 12h
  + Ca Chiều: 13h30 - 17h30
  + Cả ngày: 8h30 - 17h30
- Sang nhượng ca làm ("Kèo thơm 🎁"): Khi bận đột xuất, nhân viên có thể sang nhượng ca làm cho đồng nghiệp nhận lại trên hệ thống.
`.trim();

export function getKeywordFallbackContext(userQuery: string): string {
  const lower = userQuery.toLowerCase();
  const snippets: string[] = [];

  // 1. Thưởng nóng, chuyên cần, 200k, đóng hàng, bưng hàng
  if (
    lower.includes("thưởng") ||
    lower.includes("chuyên cần") ||
    lower.includes("200k") ||
    lower.includes("đóng hàng") ||
    lower.includes("bưng hàng") ||
    lower.includes("chăm chỉ")
  ) {
    snippets.push(`--- QUY CHẾ THƯỞNG NÓNG & CHUYÊN CẦN LIMART ---
1. Top 1 Chăm chỉ (Số giờ làm cao nhất tháng): Đạt tối thiểu 130 giờ công trong tháng sẽ được thưởng nóng +200.000 ₫ cộng vào bảng lương.
2. Vua Đóng Hàng: Tích luỹ trên 50 điểm đóng gói đơn hàng trong tháng sẽ nhận thưởng nóng +200.000 ₫.
3. Thưởng bưng hàng lên lầu: Nhân viên tích luỹ từ ≥ 10 điểm bưng vác hàng lên lầu được cộng thưởng nóng trực tiếp vào kỳ lương.`);
  }

  // 2. Đi muộn, trễ, phạt muộn
  if (
    lower.includes("muộn") ||
    lower.includes("trễ") ||
    lower.includes("đi trễ") ||
    lower.includes("phạt muộn")
  ) {
    snippets.push(`--- QUY TẮC PHẠT & XỬ LÝ ĐI MUỘN LIMART ---
1. Thời gian ân hạn: Hệ thống áp dụng thời gian ân hạn 1 phút so với giờ ca làm việc đã đăng ký.
2. Xử lý vi phạm: Check-in muộn từ phút thứ 2 trở đi sẽ tự động tính vào Bảng vi phạm của tháng. Mức phạt được tính luỹ tiến theo số lần vi phạm trong tháng: trừ điểm chuyên cần nội bộ và quy đổi trừ giờ công theo quy chế.
3. Thủ tục giải trình: Trường hợp có lý do bất khả kháng (hỏng xe, mưa ngập, sự cố kỹ thuật...), nhân viên vào mục "📝 Xin giải trình" trong vòng 24 giờ để gửi Quản lý phê duyệt.`);
  }

  // 3. Vòng quay may mắn
  if (
    lower.includes("quay") ||
    lower.includes("vòng quay") ||
    lower.includes("may mắn")
  ) {
    snippets.push(`--- QUY CHẾ VÒNG QUAY MAY MẮN LIMART ---
1. Điều kiện tham gia: Nhân viên phải hoàn thành Check-in hợp lệ trong ngày và chưa thực hiện lượt quay nào trong ngày hôm đó.
2. Cấp quyền quay: Quản lý có thể cấp/mở quyền trong danh mục Nhân sự (switch Vòng quay) hoặc tab Vòng quay > Cấp quyền quay. Phần thưởng sẽ được ghi nhận và tổng hợp tự động vào bảng lương cuối tháng.`);
  }

  // 4. Hàng vỡ, hỏng, khiếu nại, đổi trả, đền bù
  if (
    lower.includes("vỡ") ||
    lower.includes("hỏng") ||
    lower.includes("bể") ||
    lower.includes("móp") ||
    lower.includes("rách") ||
    lower.includes("lỗi") ||
    lower.includes("khiếu nại") ||
    lower.includes("đổi trả") ||
    lower.includes("đền bù")
  ) {
    snippets.push(`--- QUY TRÌNH XỬ LÝ SỰ CỐ HÀNG VỠ / HỎNG (3 BƯỚC) ---
1. Bước 1: Tiếp nhận và xoa dịu khách hàng ngay lập tức. Gửi lời xin lỗi chân thành vì sự cố vận chuyển ngoài ý muốn. Nhờ khách chụp ảnh chi tiết sản phẩm hỏng, mã vận đơn bên ngoài vỏ hộp và Video mở kiện hàng (unboxing) để shop làm việc đối soát với đơn vị vận chuyển.
2. Bước 2: Đối chiếu hạn mức tự giải quyết khiếu nại:
   - Hỏng/vỡ nhẹ vẫn dùng được: Thương lượng hỗ trợ hoàn tiền một phần (20% - 50% tuỳ mức độ) hoặc tặng mã voucher giảm giá cho đơn hàng tiếp theo.
   - Vỡ nát, hỏng hoàn toàn (màu đổ tràn, chai lọ vỡ, toan rách không dùng được): Tiến hành gửi bù ngay 01 sản phẩm mới 100% (miễn phí ship hoàn toàn) hoặc hoàn tiền 100% giá trị sản phẩm.
   - Lưu ý: Nếu giá trị đơn hàng vượt hạn mức nhân viên được tự duyệt theo quy chế, chụp màn hình gửi nhóm nội bộ để Quản lý duyệt ngay trong vòng 15 phút.
3. Bước 3: Lưu hồ sơ khiếu nại. Ghi nhận thông tin đơn hàng lên hệ thống để bộ phận kho tiến hành khiếu nại bồi thường từ đơn vị vận chuyển.
4. Mẫu tin nhắn chuẩn gửi khách:
   "Dạ em chào anh/chị ạ! 🎨 Dạ em thật sự xin lỗi anh/chị vì sự cố đơn hàng bị [vỡ/hỏng] trong quá trình vận chuyển, khiến trải nghiệm của mình chưa được trọn vẹn ạ. Anh/chị cho em xin thêm hình ảnh/video mở gói hàng và ảnh mã vận đơn bên ngoài hộp để shop xử lý đổi mới hoặc hoàn tiền ngay cho mình nhé ạ. Shop cam kết bảo vệ 100% quyền lợi của anh/chị, anh/chị yên tâm nha! Em đợi phản hồi của mình ạ. 🍊"`);
  }

  // 5. Thông tin địa chỉ & giờ mở cửa
  if (
    lower.includes("địa chỉ") ||
    lower.includes("ở đâu") ||
    lower.includes("cửa hàng") ||
    lower.includes("shop ở") ||
    (lower.includes("shop") && (lower.includes("đâu") || lower.includes("địa chỉ") || lower.includes("qua")))
  ) {
    snippets.push(`--- THÔNG TIN CỬA HÀNG & KÊNH HỖ TRỢ LIMART ---
1. Giờ mở cửa: 8h30 - 21h30 (Tất cả các ngày trong tuần, kể cả Thứ 7 & Chủ Nhật).
2. Địa chỉ: Cửa hàng Họa cụ LimArt (Vui lòng chọn đúng chi nhánh bạn đang trực hoặc đính kèm vị trí Google Maps của shop).
3. Hotline / Fanpage: Kênh hỗ trợ chính thức của Họa cụ LimArt.
4. Mẫu tin nhắn chuẩn gửi khách:
   "Dạ em chào anh/chị ạ! 🎨 Dạ cửa hàng LimArt mở cửa từ 8h30 đến 21h30 tất cả các ngày trong tuần ạ. 📍 Địa chỉ shop tại: [Điền địa chỉ cơ sở / Chi nhánh gần khách nhất]. Anh/chị có thể ghé trực tiếp để xem và trải nghiệm thử các mẫu họa cụ, giấy vẽ, cọ và màu vẽ nhé ạ! Nếu cần chỉ đường chi tiết hơn, anh/chị nhắn em hỗ trợ ngay nha! 🍊"`);
  }

  // 6. WFH & Đóng gói hàng
  if (
    lower.includes("wfh") ||
    lower.includes("làm việc tại nhà") ||
    lower.includes("đóng gói")
  ) {
    snippets.push(`--- QUY TRÌNH DUYỆT WFH & ĐÓNG GÓI HÀNG LIMART ---
1. Làm việc tại nhà (WFH): Nhân viên gửi yêu cầu WFH trên ứng dụng → Quản lý duyệt. Khi được duyệt: nếu ngày đó không có check-in thực tế, hệ thống tự động ghi nhận 8 giờ công và hiển thị 'Làm việc từ xa (WFH)' mà không cần Check-in qua IP Wi-Fi văn phòng.
2. Đóng gói hàng: Nhân viên nhận nhiệm vụ tại mục Sàn việc / WFH Tasks, chụp ảnh/báo cáo kết quả đóng đơn để Quản lý duyệt điểm tích luỹ (>50 điểm nhận thưởng Vua Đóng Hàng +200.000 ₫).`);
  }

  // 7. Quy trình xin giải trình
  if (
    lower.includes("giải trình") ||
    lower.includes("quên check-in") ||
    lower.includes("quên checkin") ||
    lower.includes("quên chấm công") ||
    lower.includes("duyệt chấm công")
  ) {
    snippets.push(`--- QUY TRÌNH XIN GIẢI TRÌNH LIMART ---
1. Thao tác: Vào mục "📝 Xin giải trình" (hoặc truy cập /requests), chọn ngày cần giải trình (đi muộn, về sớm, quên chấm công, hoặc xin nghỉ), điền lý do rõ ràng và nhấn "Gửi yêu cầu".
2. Thời hạn phê duyệt: Quản lý sẽ xem xét và phê duyệt trong vòng 24 giờ.`);
  }

  // 8. Đăng ký lịch làm việc
  if (
    lower.includes("lịch làm việc") ||
    lower.includes("đăng ký lịch") ||
    lower.includes("lịch trực") ||
    lower.includes("chọn ca") ||
    lower.includes("sang nhượng ca") ||
    lower.includes("kèo thơm")
  ) {
    snippets.push(`--- CÁCH ĐĂNG KÝ LỊCH LÀM VIỆC & SANG NHƯỢNG CA LIMART ---
1. Đăng ký ca làm: Vào mục "📅 Lịch trực" (hoặc truy cập /schedule), chọn tuần và các ca trống (Ca Sáng: 8h30 - 12h, Ca Chiều: 13h30 - 17h30, hoặc Cả ngày).
2. Sang nhượng ca làm: Nhân viên có thể sang nhượng ca ("Kèo thơm 🎁") cho đồng nghiệp khi có việc bận.`);
  }

  return snippets.join("\n\n");
}

export function buildDeterministicFallback(userQuery: string, relevantContext: string): string {
  if (relevantContext && relevantContext.trim()) {
    return `🍊 **Capy AI - Hướng dẫn nội bộ LimArt:**\n\nVề câu hỏi "${userQuery}", dưới đây là các thông tin và quy định được trích xuất từ tài liệu nội bộ công ty:\n\n${relevantContext.trim()}\n\n💡 *Nếu cần giải quyết trường hợp ngoại lệ hoặc chưa rõ mức xử lý, vui lòng liên hệ trực tiếp Quản lý cửa hàng để được hỗ trợ nhé! 🦫*`;
  }

  const fallback = getKeywordFallbackContext(userQuery);
  if (fallback) {
    return fallback;
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
  await ensurePgvectorHalfvecIndexes().catch(() => {});

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

  // Non-blocking sync to Meilisearch
  if (typeof syncDocumentsToMeilisearch === "function") {
    syncDocumentsToMeilisearch(allDocs as any).catch(() => {});
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
    await invalidateCapyRagCache().catch(() => {});
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
    await invalidateCapyRagCache().catch(() => {});
    if (typeof syncDocumentsToMeilisearch === "function") {
      syncDocumentsToMeilisearch([
        {
          id: document.id,
          path: document.path,
          title: document.title,
          content: document.content,
        },
      ]).catch(() => {});
    }

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
    await invalidateCapyRagCache().catch(() => {});

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
      await syncDocumentChunks(id!, updated.content || "");
    }

    await invalidateCachePattern("meta:documents:*").catch(() => {});
    await invalidateCapyRagCache().catch(() => {});
    if (typeof syncDocumentsToMeilisearch === "function") {
      syncDocumentsToMeilisearch([
        {
          id: updated.id,
          path: updated.path,
          title: updated.title,
          content: updated.content,
        },
      ]).catch(() => {});
    }

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
      await syncDocumentChunks(id!, updated.content || "");
    }

    await invalidateCachePattern("meta:documents:*").catch(() => {});
    await invalidateCapyRagCache().catch(() => {});
    if (typeof syncDocumentsToMeilisearch === "function") {
      syncDocumentsToMeilisearch([
        {
          id: updated.id,
          path: updated.path,
          title: updated.title,
          content: updated.content,
        },
      ]).catch(() => {});
    }

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

    const currentTenantId = getCurrentTenantId() || "limart";
    const geminiApiKey = getCleanGeminiApiKey();

    // 1. Load allDocs via Cache
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

    // 2. TIER 1: Grep / Lexical Instant Match & Valkey Exact Cache (1-5ms, 0 API Calls)
    const tier1 = await lookupTier1ExactOrGrep(userQuery, allDocs, {
      tenantId: currentTenantId,
    });

    if (tier1.hit && tier1.reply) {
      return c.json({
        success: true,
        data: {
          reply: tier1.reply,
          sources: tier1.sources || [],
          tier: tier1.tier,
          cached: true,
        },
        tier: tier1.tier,
        cached: true,
        reply: tier1.reply,
        content: tier1.reply,
      });
    }

    // 3. TIER 2: Semantic Embedding Response Cache (~80ms, 0 LLM Calls)
    // Compute embedding ONCE if geminiApiKey is configured
    let queryVectorValues: number[] | null = null;
    let genAI: GoogleGenerativeAI | null = null;

    if (geminiApiKey) {
      try {
        genAI = new GoogleGenerativeAI(geminiApiKey);
        const embeddingModel = genAI.getGenerativeModel({
          model: "gemini-embedding-001",
        });
        const embeddingResult = await embeddingModel.embedContent(userQuery);
        const values = embeddingResult.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          queryVectorValues = values;
        }
      } catch (embErr) {
        console.warn("[EMBEDDING_QUERY_WARN]", embErr);
      }
    }

    if (queryVectorValues && queryVectorValues.length > 0) {
      const tier2 = await lookupTier2SemanticCache(queryVectorValues, currentTenantId);
      if (tier2.hit && tier2.reply) {
        // Warm Tier 1 Exact Cache for userQuery so repeating exact string later is 1-5ms!
        saveToCapyRagCache({
          userQuery,
          answer: tier2.reply,
          sources: tier2.sources || [],
          embedding: queryVectorValues,
          tenantId: currentTenantId,
        }).catch(() => {});

        const similarity = Number((1 - (tier2.distance ?? 0)).toFixed(4));
        return c.json({
          success: true,
          data: {
            reply: tier2.reply,
            sources: tier2.sources || [],
            tier: "TIER_2_SEMANTIC_CACHE",
            similarity,
            cached: true,
          },
          tier: "TIER_2_SEMANTIC_CACHE",
          similarity,
          cached: true,
          reply: tier2.reply,
          content: tier2.reply,
        });
      }
    }

    // 4. Hybrid Context Retrieval:
    // (pgvector DocumentChunk via pure-SQL RRF + Meilisearch documents + Grep scoreDocuments + Fallback)
    const matchedDocIds = new Set<string>();
    const matchedPaths = new Set<string>();
    const contextParts: string[] = [];

    // 4a. Pure-SQL Hybrid RRF (halfvec + tsvector)
    try {
      const rrfChunks = await hybridSearchDocumentChunksRRF(
        queryVectorValues,
        userQuery,
        8
      );
      for (let i = 0; i < rrfChunks.length; i++) {
        const chunk = rrfChunks[i];
        if (chunk.documentId) matchedDocIds.add(chunk.documentId);
        if (chunk.path) matchedPaths.add(chunk.path);
        const distStr = chunk.distance !== undefined ? chunk.distance.toFixed(3) : "N/A";
        const rrfStr = chunk.rrfScore !== undefined ? chunk.rrfScore.toFixed(4) : "N/A";
        contextParts.push(
          `--- ĐOẠN TRÍCH ${i + 1}: ${chunk.title} (${chunk.path}) [Khoảng cách vector: ${distStr}, RRF: ${rrfStr}] ---\n${chunk.content}`
        );
      }
    } catch (rrfErr) {
      console.warn("[HYBRID_RRF_WARN]", rrfErr);
    }

    // 4b. Meilisearch Typo-Tolerant Vietnamese Search
    try {
      if (typeof searchDocumentsInMeilisearch === "function") {
        const meiliHits = await searchDocumentsInMeilisearch(userQuery, currentTenantId, 4);
        for (const hit of meiliHits || []) {
          if (!matchedDocIds.has(hit.id)) {
            matchedDocIds.add(hit.id);
            if (hit.path) matchedPaths.add(hit.path);
            contextParts.push(
              `--- TÀI LIỆU MEILISEARCH: ${hit.title} (${hit.path}) ---\n${hit.content}`
            );
          }
        }
      }
    } catch (meiliErr) {
      console.warn("[MEILISEARCH_RAG_WARN]", meiliErr);
    }

    // 4c. Grep / Lexical ScoreDocuments
    const scoredDocs = scoreDocuments(userQuery, allDocs);
    const topScoredDocs = scoredDocs
      .filter((d) => d.score >= MIN_RELEVANCE_SCORE)
      .slice(0, 3);

    for (const doc of topScoredDocs) {
      if (!matchedDocIds.has(doc.id)) {
        matchedDocIds.add(doc.id);
        if (doc.path) matchedPaths.add(doc.path);
        contextParts.push(
          `--- TÀI LIỆU KHỚP TỪ KHOÁ: ${doc.title} (${doc.path}) [Điểm tương quan: ${doc.score}đ] ---\n${doc.content}`
        );
      }
    }

    // 4d. Fallback context if no DB docs matched
    if (contextParts.length === 0) {
      const keywordFallback = getKeywordFallbackContext(userQuery);
      if (keywordFallback) {
        contextParts.push(`--- CẨM NANG VẬN HÀNH & QUY CHẾ CỐT LÕI ---\n${keywordFallback}`);
      }
    }

    const relevantContext = contextParts.join("\n\n").trim();

    // 100% STRICT RAG: If no relevant context found, return strict not found message immediately!
    if (!relevantContext) {
      return c.json({
        success: true,
        reply: STRICT_NOT_FOUND_MESSAGE,
        content: STRICT_NOT_FOUND_MESSAGE,
        data: {
          reply: STRICT_NOT_FOUND_MESSAGE,
          sources: [],
          tier: "TIER_3_GEMINI_LLM",
          cached: false,
        },
        tier: "TIER_3_GEMINI_LLM",
        cached: false,
      });
    }

    // 5. TIER 3: Gemini LLM Generation + Write-Back to Tier 1 & Tier 2
    if (geminiApiKey) {
      try {
        if (!genAI) {
          genAI = new GoogleGenerativeAI(geminiApiKey);
        }
        const systemInstruction = `Bạn là Capy AI - Trợ lý vận hành và hỗ trợ nội bộ của LimArt (Cửa hàng Họa cụ & Mỹ thuật).
Nhiệm vụ của bạn là giải đáp chính xác, đầy đủ, chi tiết từng bước cho nhân viên và quản lý dựa trên các quy định và tài liệu nội bộ của công ty.

CẨM NANG & QUY CHẾ VẬN HÀNH CƠ SỞ (BASELINE KNOWLEDGE):
${CORE_OPERATIONAL_KNOWLEDGE}

NGUYÊN TẮC BẮT BUỘC:
1. NẮM VỮNG VÀ TRÍCH DẪN CHÍNH XÁC QUY ĐỊNH CHÍNH THỨC:
   - Các quy định và quy chế trong CẨM NANG & QUY CHẾ VẬN HÀNH CƠ SỞ trên là quy định chính thức của LimArt.
   - Khi người dùng hỏi về thưởng chuyên cần, đi muộn, vòng quay, sự cố hàng hóa..., bạn PHẢI trích dẫn chính xác các điều kiện, số giờ, số điểm, số tiền thưởng và các bước hành động cụ thể, TUYỆT ĐỐI KHÔNG từ chối hoặc nói chưa có tài liệu.
2. NGUỒN THÔNG TIN DUY NHẤT:
   - Bạn CHỈ ĐƯỢC PHÉP trả lời dựa trên nội dung trong mục "TÀI LIỆU NỘI BỘ THAM KHẢO" và "CẨM NANG & QUY CHẾ VẬN HÀNH CƠ SỞ" ở trên.
   - CẤM TUYỆT ĐỐI tự sáng tạo, suy diễn, phỏng đoán, bịa thêm quy định, chính sách, số liệu, địa chỉ hoặc bất kỳ thông tin nào không nằm trong TÀI LIỆU NỘI BỘ THAM KHẢO.
3. TRÌNH BÀY RÕ RÀNG, DỄ ĐỌC TRÊN ĐIỆN THOẠI DI ĐỘNG:
   - Trình bày câu trả lời rõ ràng, thoáng đãng, chia thành các mục ngắn gọn có icon hoặc số thứ tự đầu dòng (ví dụ: 1️⃣, 2️⃣, 📌, 💬, •).
   - TUYỆT ĐỐI KHÔNG dùng công thức toán học LaTeX ($...$, \\ge, \\times, \\le) — hãy viết bằng tiếng Việt tự nhiên hoặc ký hiệu phổ thông (≥, ≤, ×, ÷).
   - Tránh dùng bảng Markdown phức tạp (|---|---|) gây tràn màn hình điện thoại, hãy chuyển sang dạng danh sách các gạch đầu dòng phân cấp rõ ràng, dễ nhìn.
   - Khi thông tin CÓ trong tài liệu tham khảo: Trình bày đầy đủ, chi tiết từng bước, giữ nguyên định mức, quy định, mốc thời gian, số tiền và mẫu câu chuẩn có trong tài liệu.
   - Tuyệt đối không tóm tắt cụt lủn và TUYỆT ĐỐI KHÔNG ghi câu dạng "xem chi tiết ở tab Kho tài liệu" hay "tra cứu cẩm nang".
4. KHI KHÔNG CÓ THÔNG TIN TRONG TÀI LIỆU:
   - Nếu câu hỏi của người dùng hoàn toàn KHÔNG CÓ thông tin hoặc không thể trả lời dựa trên TÀI LIỆU NỘI BỘ THAM KHẢO, bạn BẮT BUỘC trả lời chính xác câu sau:
     "${STRICT_NOT_FOUND_MESSAGE}"
5. PHONG CÁCH: Thân thiện, tận tâm như chú chuột lang nước Capy (sử dụng emoji 🍊, 🦫).
6. Luôn trả lời bằng tiếng Việt.

TÀI LIỆU NỘI BỘ THAM KHẢO:
${relevantContext}`;

        const prompt = `Câu hỏi của người dùng: ${userQuery}`;
        const rawReply = await generateWithGeminiFallback(genAI, systemInstruction, prompt);
        const replyText = cleanAiOutputForHumans(rawReply);

        // Write-Back to Tier 1 & Tier 2 Cache
        await saveToCapyRagCache({
          userQuery,
          answer: replyText,
          sources: Array.from(matchedPaths),
          embedding: queryVectorValues || undefined,
          tenantId: currentTenantId,
        });

        return c.json({
          success: true,
          data: {
            reply: replyText,
            sources: Array.from(matchedPaths),
            tier: "TIER_3_GEMINI_LLM",
            cached: false,
          },
          tier: "TIER_3_GEMINI_LLM",
          cached: false,
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
      data: {
        reply: fallbackAnswer,
        sources: Array.from(matchedPaths),
        tier: "TIER_3_GEMINI_LLM",
        cached: false,
      },
      tier: "TIER_3_GEMINI_LLM",
      cached: false,
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



