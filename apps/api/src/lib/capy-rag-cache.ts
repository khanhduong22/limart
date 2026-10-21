import { createHash } from "crypto";
import { prisma } from "@checkin/db";
import { Meilisearch } from "meilisearch";
import { getRedisClient, invalidateCachePattern } from "./cache";
import { getCurrentTenantId } from "../middleware/tenant.middleware";

// ============================================================================
// 0. Meilisearch Safe Non-Blocking Client & Integration
// ============================================================================

let capyMeiliClient: Meilisearch | null = null;

export function getCapyMeiliClient(): Meilisearch | null {
  if (capyMeiliClient) return capyMeiliClient;
  try {
    const host = process.env.MEILISEARCH_HOST || "http://meilisearch:7700";
    const apiKey = process.env.MEILISEARCH_KEY || process.env.MEILISEARCH_API_KEY || "";
    capyMeiliClient = new Meilisearch({ host, apiKey, timeout: 2000 });
    return capyMeiliClient;
  } catch {
    return null;
  }
}

export async function syncDocumentsToMeilisearch(
  docs: Array<{ id: string; path: string; title: string; content: string; tenantId?: string }>
): Promise<boolean> {
  if (!docs || docs.length === 0) return true;
  try {
    const client = getCapyMeiliClient();
    if (!client) return false;
    const formattedDocs = docs.map((doc) => ({
      id: doc.id,
      path: doc.path,
      title: doc.title,
      content: doc.content,
      tenantId: doc.tenantId || "limart",
    }));
    const index = client.index("documents");
    await index.addDocuments(formattedDocs, { primaryKey: "id" });
    return true;
  } catch (err: any) {
    console.warn("[Meilisearch Sync Documents Warn]", err?.message || err);
    return false;
  }
}

export async function searchDocumentsInMeilisearch(
  query: string,
  tenantId = "limart",
  limit = 4
): Promise<Array<{ id: string; path: string; title: string; content: string }>> {
  if (!query || !query.trim()) return [];
  try {
    const client = getCapyMeiliClient();
    if (!client) return [];
    const index = client.index("documents");
    const searchRes = await index.search(query.trim(), {
      limit,
      filter: tenantId ? `tenantId = "${tenantId}"` : undefined,
    });
    if (!searchRes || !Array.isArray(searchRes.hits)) return [];
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

// ============================================================================
// 1. Text Normalization & Accent Removal Helpers
// ============================================================================

/**
 * Trims, lowercases, normalizes Unicode NFC, strips punctuation, and collapses multiple spaces.
 */
export function normalizeCapyQuery(query: string): string {
  if (!query) return "";
  return query
    .normalize("NFC")
    .toLowerCase()
    .replace(/[?!.,;:"'()[\]{}`~@#$%^&*+=<>\\/|_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips Vietnamese diacritics / accents for typo-tolerant unaccented matching.
 * e.g. "Đi trễ phạt bao nhiêu" -> "Di tre phat bao nhieu"
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Generates an exact cache key for Tier 1 Valkey / In-Memory exact match.
 */
export function buildExactCacheKey(normalizedQuery: string): string {
  const hash = createHash("sha256").update(normalizedQuery).digest("hex").slice(0, 32);
  return `capy:qa:exact:${hash}`;
}

// ============================================================================
// 2. Vector Math & RRF (Reciprocal Rank Fusion) Helpers
// ============================================================================

/**
 * Pure TypeScript Cosine Similarity calculation between two dense vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Pure TypeScript Cosine Distance (1 - Cosine Similarity), clamped at >= 0.
 */
export function cosineDistance(vecA: number[], vecB: number[]): number {
  const sim = cosineSimilarity(vecA, vecB);
  return Math.max(0, 1 - sim);
}

/**
 * Computes Reciprocal Rank Fusion score:
 * RRF(d) = 1/(k + rank_vector) + 1/(k + rank_keyword)
 */
export function computeRrfScore(
  rankVector?: number | null,
  rankKeyword?: number | null,
  k = 60
): number {
  const vScore = rankVector && rankVector > 0 ? 1 / (k + rankVector) : 0;
  const kScore = rankKeyword && rankKeyword > 0 ? 1 / (k + rankKeyword) : 0;
  return Number((vScore + kScore).toFixed(6));
}

// ============================================================================
// 3. In-Memory LRU & Ring-Buffer Caches (Fallback & Unit Test Support)
// ============================================================================

export interface ExactCacheValue {
  answer: string;
  sources: string[];
  timestamp: number;
}

export interface SemanticCacheEntry {
  question: string;
  answer: string;
  sources: string[];
  embedding: number[];
  timestamp: number;
}

// In-Memory exact cache: Map<`${tenantId}:${cacheKey}`, ExactCacheValue>
const inMemoryExactCache = new Map<string, ExactCacheValue>();
const MAX_EXACT_ENTRIES_PER_TENANT = 500;

// In-Memory semantic vector buffer: Map<tenantId, SemanticCacheEntry[]>
const inMemorySemanticCache = new Map<string, SemanticCacheEntry[]>();
const MAX_SEMANTIC_ENTRIES_PER_TENANT = 200;

export function getInMemoryExactCacheSize(): number {
  return inMemoryExactCache.size;
}

export function getInMemorySemanticCacheSize(tenantId = "limart"): number {
  return inMemorySemanticCache.get(tenantId)?.length ?? 0;
}

// ============================================================================
// 4. Canonical Single-Intent Operational FAQs (Tier 1 Grep Matches)
// ============================================================================

export interface CanonicalFaq {
  intent: string;
  keywords: string[];
  reply: string;
  sources: string[];
}

export const CANONICAL_FAQS: CanonicalFaq[] = [
  {
    intent: "late_penalty",
    keywords: [
      "di muon phat sao",
      "di tre bi phat bao nhieu",
      "di tre tru bao nhieu tien",
      "di tre phat the nao",
      "phat di muon",
      "phat di tre",
      "di tre phat sao",
      "quy tac phat di tre",
    ],
    reply: `🍊 **Quy tắc phạt & xử lý đi muộn LimArt:**
• Thời gian ân hạn: Hệ thống áp dụng thời gian ân hạn 1 phút so với giờ ca làm việc đã đăng ký.
• Xử lý vi phạm: Check-in muộn từ phút thứ 2 trở đi sẽ tự động tính vào Bảng vi phạm của tháng. Mức phạt được tính luỹ tiến theo số lần vi phạm trong tháng: trừ điểm chuyên cần nội bộ và quy đổi trừ giờ công theo quy chế.
• Thủ tục giải trình: Trường hợp có lý do bất khả kháng (hỏng xe, mưa ngập, sự cố kỹ thuật...), nhân viên vào mục "📝 Xin giải trình" (hoặc truy cập /requests) trong vòng 24 giờ để gửi Quản lý phê duyệt. 🦫`,
    sources: ["canonical:sop:late_penalty"],
  },
  {
    intent: "hot_bonus_200k",
    keywords: [
      "thuong nong 200k",
      "thuong nong tinh sao",
      "khi nao duoc thuong nong",
      "quy che thuong nong",
      "dieu kien thuong nong",
    ],
    reply: `🍊 **Chính sách thưởng nóng 200.000 ₫ & chuyên cần LimArt:**
• Top 1 Chăm chỉ (Số giờ làm cao nhất tháng): Đạt tối thiểu 130 giờ công trong tháng sẽ được thưởng nóng +200.000 ₫ cộng vào bảng lương.
• Vua Đóng Hàng: Tích luỹ trên 50 điểm đóng gói đơn hàng trong tháng sẽ nhận thưởng nóng +200.000 ₫.
• Thưởng bưng hàng lên lầu: Nhân viên tích luỹ từ ≥ 10 điểm bưng vác hàng lên lầu được cộng thưởng nóng trực tiếp vào kỳ lương. 🦫`,
    sources: ["canonical:sop:hot_bonus"],
  },
  {
    intent: "lucky_wheel",
    keywords: [
      "vong quay may man",
      "dieu kien quay thuong",
      "khi nao duoc quay vong quay",
      "cach cap quyen quay vong quay may man",
      "quay vong quay o dau",
    ],
    reply: `🍊 **Quy chế Vòng Quay May Mắn LimArt:**
• Điều kiện tham gia: Nhân viên phải hoàn thành Check-in hợp lệ trong ngày và chưa thực hiện lượt quay nào trong ngày hôm đó.
• Cấp quyền quay: Quản lý có thể cấp/mở quyền trong danh mục Nhân sự (switch Vòng quay) hoặc tab Vòng quay > Cấp quyền quay. Phần thưởng sẽ được ghi nhận và tổng hợp tự động vào bảng lương cuối tháng. 🦫`,
    sources: ["canonical:sop:lucky_wheel"],
  },
  {
    intent: "damaged_goods",
    keywords: [
      "hang vo hong xu ly sao",
      "be hang lam sao",
      "khach lam vo hang",
      "hang vo xu ly sao",
      "xu ly hang vo",
      "vo hang boi thuong sao",
    ],
    reply: `🍊 **Quy trình xử lý sự cố hàng vỡ / hỏng (3 bước) LimArt:**
1️⃣ Bước 1: Tiếp nhận và xoa dịu khách hàng ngay lập tức. Gửi lời xin lỗi chân thành vì sự cố vận chuyển ngoài ý muốn. Nhờ khách chụp ảnh chi tiết sản phẩm hỏng, mã vận đơn bên ngoài vỏ hộp và Video mở kiện hàng (unboxing) để shop làm việc đối soát với đơn vị vận chuyển.
2️⃣ Bước 2: Đối chiếu hạn mức tự giải quyết khiếu nại:
   • Hỏng/vỡ nhẹ vẫn dùng được: Thương lượng hỗ trợ hoàn tiền một phần (20% - 50% tuỳ mức độ) hoặc tặng mã voucher giảm giá cho đơn hàng tiếp theo.
   • Vỡ nát, hỏng hoàn toàn: Tiến hành gửi bù ngay 01 sản phẩm mới 100% (miễn phí ship hoàn toàn) hoặc hoàn tiền 100% giá trị sản phẩm.
   • Lưu ý: Nếu giá trị đơn hàng vượt hạn mức nhân viên được tự duyệt theo quy chế, chụp màn hình gửi nhóm nội bộ để Quản lý duyệt ngay trong vòng 15 phút.
3️⃣ Bước 3: Lưu hồ sơ khiếu nại lên hệ thống để bộ phận kho khiếu nại bồi thường từ đơn vị vận chuyển. 🦫`,
    sources: ["canonical:sop:damaged_goods"],
  },
  {
    intent: "shop_address_wifi",
    keywords: [
      "dia chi shop o dau",
      "mat khau wifi quan",
      "ip cham cong",
      "dia chi cua hang",
      "shop o dau",
      "gio mo cua quan",
      "mat khau wifi",
    ],
    reply: `🍊 **Thông tin cửa hàng & kênh hỗ trợ LimArt:**
• Giờ mở cửa: 8h30 - 21h30 (Tất cả các ngày trong tuần, kể cả Thứ 7 & Chủ Nhật).
• Địa chỉ: Cửa hàng Họa cụ LimArt (Vui lòng chọn đúng chi nhánh bạn đang trực hoặc đính kèm vị trí Google Maps của shop).
• Kênh hỗ trợ: Hotline cửa hàng hoặc Fanpage Họa cụ LimArt.
• Mẫu tin nhắn chuẩn gửi khách: "Dạ em chào anh/chị ạ! 🎨 Dạ cửa hàng LimArt mở cửa từ 8h30 đến 21h30 tất cả các ngày trong tuần ạ. 📍 Địa chỉ shop tại: [Điền chi nhánh gần khách nhất]. Anh/chị có thể ghé trực tiếp để trải nghiệm thử các mẫu họa cụ, giấy vẽ, cọ và màu vẽ nhé ạ! 🍊" 🦫`,
    sources: ["canonical:sop:shop_address"],
  },
  {
    intent: "wfh_packaging",
    keywords: [
      "don gia dong goi wfh",
      "lam viec tai nha tinh luong sao",
      "bao cao wfh",
      "quy che wfh",
      "dong goi wfh",
    ],
    reply: `🍊 **Quy trình duyệt WFH & đóng gói hàng LimArt:**
• Làm việc tại nhà (WFH): Nhân viên gửi yêu cầu WFH trên ứng dụng → Quản lý duyệt. Khi được duyệt: nếu ngày đó không có check-in thực tế, hệ thống tự động ghi nhận 8 giờ công và hiển thị 'Làm việc từ xa (WFH)' mà không cần Check-in qua IP Wi-Fi văn phòng.
• Đóng gói hàng: Nhân viên nhận nhiệm vụ tại mục Sàn việc / WFH Tasks, chụp ảnh/báo cáo kết quả đóng đơn để Quản lý duyệt điểm tích luỹ (>50 điểm nhận thưởng Vua Đóng Hàng +200.000 ₫). 🦫`,
    sources: ["canonical:sop:wfh"],
  },
  {
    intent: "explanation_request",
    keywords: [
      "quy trinh xin giai trinh",
      "quen check out lam sao",
      "gui don giai trinh o dau",
      "quen checkin lam sao",
      "quen cham cong giai trinh sao",
    ],
    reply: `🍊 **Quy trình xin giải trình LimArt:**
• Thao tác: Vào mục "📝 Xin giải trình" (hoặc truy cập /requests), chọn ngày cần giải trình (đi muộn, về sớm, quên chấm công, hoặc xin nghỉ), điền lý do rõ ràng và nhấn "Gửi yêu cầu".
• Thời hạn phê duyệt: Quản lý sẽ xem xét và phê duyệt trong vòng 24 giờ. 🦫`,
    sources: ["canonical:sop:explanation_request"],
  },
  {
    intent: "shift_registration",
    keywords: [
      "cach dang ky lich lam viec",
      "dang ky ca truc o dau",
      "xin doi ca lam sao",
      "sang nhuong ca",
      "keo thom",
      "dang ky ca lam",
    ],
    reply: `🍊 **Cách đăng ký lịch làm việc & sang nhượng ca LimArt:**
• Đăng ký ca làm: Vào mục "📅 Lịch trực" (hoặc truy cập /schedule), chọn tuần và các ca trống (Ca Sáng: 8h30 - 12h, Ca Chiều: 13h30 - 17h30, hoặc Cả ngày).
• Sang nhượng ca làm: Nhân viên có thể sang nhượng ca ("Kèo thơm 🎁") cho đồng nghiệp trên hệ thống khi có việc bận đột xuất. 🦫`,
    sources: ["canonical:sop:shift_registration"],
  },
];

/**
 * Checks if the user query directly matches any of the canonical SOP single intents.
 * Evaluates both accented and unaccented Vietnamese.
 */
export function checkHighConfidenceGrepFaq(userQuery: string): CanonicalFaq | null {
  const normQuery = normalizeCapyQuery(userQuery);
  const unaccentedQuery = removeVietnameseAccents(normQuery);

  for (const faq of CANONICAL_FAQS) {
    for (const kw of faq.keywords) {
      const normKw = normalizeCapyQuery(kw);
      const unaccentedKw = removeVietnameseAccents(normKw);

      // Exact match or contains full intent phrase
      if (
        normQuery === normKw ||
        unaccentedQuery === unaccentedKw ||
        normQuery.includes(normKw) ||
        unaccentedQuery.includes(unaccentedKw)
      ) {
        return faq;
      }
    }
  }

  return null;
}

// ============================================================================
// 5. Tier 1: Grep / Lexical Match & Valkey Exact Cache (1-5ms, 0 API Calls)
// ============================================================================

export interface Tier1LookupResult {
  hit: boolean;
  tier?: "TIER_1_EXACT_CACHE" | "TIER_1_GREP";
  reply?: string;
  sources?: string[];
}

export async function lookupTier1ExactOrGrep(
  userQuery: string,
  allDocs?: Array<{ path: string; title: string; content: string }>,
  options?: { tenantId?: string; bypassGrep?: boolean }
): Promise<Tier1LookupResult> {
  const tenantId = options?.tenantId || getCurrentTenantId() || "limart";
  const normalized = normalizeCapyQuery(userQuery);
  if (!normalized) return { hit: false };

  // 1. Check Valkey / In-Memory Exact Cache
  const exactKey = buildExactCacheKey(normalized);
  const memoryKey = `${tenantId}:${exactKey}`;

  // Check Redis first if available
  try {
    const redis = getRedisClient();
    if (redis) {
      const raw = await redis.get(`tenant:${tenantId}:${exactKey}`);
      if (raw) {
        const cached = JSON.parse(raw);
        return {
          hit: true,
          tier: "TIER_1_EXACT_CACHE",
          reply: cached.answer,
          sources: cached.sources || [],
        };
      }
    }
  } catch {
    // Redis unavailable, proceed to in-memory check
  }

  // Check In-Memory fallback
  const memHit = inMemoryExactCache.get(memoryKey);
  if (memHit) {
    return {
      hit: true,
      tier: "TIER_1_EXACT_CACHE",
      reply: memHit.answer,
      sources: memHit.sources,
    };
  }

  // If bypassGrep requested, stop here
  if (options?.bypassGrep) {
    return { hit: false };
  }

  // Check if custom documents exist in DB that specifically cover this query.
  // If custom documents in DB match the query keywords, do not short-circuit with canonical FAQ!
  if (allDocs && allDocs.length > 0) {
    const unaccented = removeVietnameseAccents(normalized);
    const queryTokens = unaccented.split(" ").filter((w) => w.length >= 3);
    const hasCustomDbMatch = allDocs.some((d) => {
      const docText = removeVietnameseAccents(
        `${d.title} ${d.path} ${d.content.slice(0, 300)}`.toLowerCase()
      );
      return queryTokens.filter((token) => docText.includes(token)).length >= 2;
    });

    if (hasCustomDbMatch) {
      return { hit: false };
    }
  }

  // 2. High-Confidence Grep / Canonical SOP Intent Match
  const canonicalMatch = checkHighConfidenceGrepFaq(userQuery);
  if (canonicalMatch) {
    return {
      hit: true,
      tier: "TIER_1_GREP",
      reply: canonicalMatch.reply,
      sources: canonicalMatch.sources,
    };
  }

  return { hit: false };
}

// ============================================================================
// 6. Tier 2: pgvector Semantic Embedding Response Cache (~80ms, 0 LLM Calls)
// ============================================================================

export interface Tier2LookupResult {
  hit: boolean;
  tier?: "TIER_2_SEMANTIC_CACHE";
  reply?: string;
  sources?: string[];
  distance?: number;
}

export async function lookupTier2SemanticCache(
  queryVector: number[],
  tenantId = "limart",
  maxDistance = 0.12
): Promise<Tier2LookupResult> {
  if (!queryVector || queryVector.length === 0) {
    return { hit: false };
  }

  // 1. Check In-Memory per-tenant semantic vector ring buffer first (blazing fast, works in mock/test)
  const tenantEntries = inMemorySemanticCache.get(tenantId) || [];
  let bestMemMatch: { entry: SemanticCacheEntry; distance: number } | null = null;

  for (const entry of tenantEntries) {
    const dist = cosineDistance(queryVector, entry.embedding);
    if (dist <= maxDistance && (!bestMemMatch || dist < bestMemMatch.distance)) {
      bestMemMatch = { entry, distance: dist };
    }
  }

  if (bestMemMatch) {
    return {
      hit: true,
      tier: "TIER_2_SEMANTIC_CACHE",
      reply: bestMemMatch.entry.answer,
      sources: bestMemMatch.entry.sources,
      distance: bestMemMatch.distance,
    };
  }

  // 2. Query PostgreSQL pgvector table "SemanticQaCache"
  try {
    const vectorLiteral = `[${queryVector.join(",")}]`;
    let matches: Array<{
      id: string;
      question: string;
      answer: string;
      sources: any;
      distance: number;
    }> = [];

    // Try PostgreSQL 18.6 + pgvector 0.8.7 halfvec AVX-512 SIMD first
    try {
      matches = await prisma.$queryRaw<Array<{
        id: string;
        question: string;
        answer: string;
        sources: any;
        distance: number;
      }>>`
        SELECT id, question, answer, sources,
               (embedding::halfvec <=> ${vectorLiteral}::halfvec)::float8 AS distance
        FROM "SemanticQaCache"
        WHERE "tenantId" = ${tenantId}
          AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 1
      `;
    } catch {
      // Fallback to standard vector operator
      matches = await prisma.$queryRaw<Array<{
        id: string;
        question: string;
        answer: string;
        sources: any;
        distance: number;
      }>>`
        SELECT id, question, answer, sources,
               (embedding <=> ${vectorLiteral}::vector)::float8 AS distance
        FROM "SemanticQaCache"
        WHERE "tenantId" = ${tenantId}
          AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 1
      `.catch(() => []);
    }

    if (matches && matches.length > 0 && matches[0].distance <= maxDistance) {
      const match = matches[0];

      // Asynchronously increment hit count
      if (typeof prisma.$executeRawUnsafe === "function") {
        prisma.$executeRawUnsafe(
          `UPDATE "SemanticQaCache" SET "hitCount" = "hitCount" + 1, "updatedAt" = NOW() WHERE id = $1`,
          match.id
        ).catch(() => {});
      }

      let parsedSources: string[] = [];
      if (Array.isArray(match.sources)) {
        parsedSources = match.sources;
      } else if (typeof match.sources === "string") {
        try {
          parsedSources = JSON.parse(match.sources);
        } catch {
          parsedSources = [];
        }
      }

      return {
        hit: true,
        tier: "TIER_2_SEMANTIC_CACHE",
        reply: match.answer,
        sources: parsedSources,
        distance: Number(match.distance),
      };
    }
  } catch (err: any) {
    // Non-blocking catch if pgvector table is not available in mock/test environment
    console.warn("[Tier2 Semantic Cache Warning]", err?.message || err);
  }

  return { hit: false };
}

// ============================================================================
// 7. Tier 3: Write-Back & Cache Invalidation
// ============================================================================

export interface SaveRagCacheParams {
  userQuery: string;
  answer: string;
  sources: string[];
  embedding?: number[];
  tenantId?: string;
}

export async function saveToCapyRagCache(params: SaveRagCacheParams): Promise<void> {
  const { userQuery, answer, sources, embedding } = params;
  const tenantId = params.tenantId || getCurrentTenantId() || "limart";
  const normalized = normalizeCapyQuery(userQuery);
  if (!normalized || !answer) return;

  const exactKey = buildExactCacheKey(normalized);
  const memoryKey = `${tenantId}:${exactKey}`;

  // 1. Save to Tier 1 In-Memory Exact Cache
  if (inMemoryExactCache.size >= MAX_EXACT_ENTRIES_PER_TENANT * 2) {
    // Evict oldest 20%
    const keysToDelete = Array.from(inMemoryExactCache.keys()).slice(0, 50);
    for (const k of keysToDelete) inMemoryExactCache.delete(k);
  }
  inMemoryExactCache.set(memoryKey, {
    answer,
    sources,
    timestamp: Date.now(),
  });

  // Save to Valkey with 24h TTL
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.set(
        `tenant:${tenantId}:${exactKey}`,
        JSON.stringify({ answer, sources, timestamp: Date.now() }),
        "EX",
        86400
      );
    }
  } catch {
    // Safe non-blocking
  }

  // 2. Save to Tier 2 Semantic Cache (if embedding is provided)
  if (embedding && Array.isArray(embedding) && embedding.length > 0) {
    // In-memory ring buffer
    const entries = inMemorySemanticCache.get(tenantId) || [];
    if (entries.length >= MAX_SEMANTIC_ENTRIES_PER_TENANT) {
      entries.shift(); // Evict oldest
    }
    entries.push({
      question: userQuery,
      answer,
      sources,
      embedding,
      timestamp: Date.now(),
    });
    inMemorySemanticCache.set(tenantId, entries);

    // Save to PostgreSQL "SemanticQaCache"
    try {
      if (typeof prisma.$executeRawUnsafe === "function") {
        const vectorLiteral = `[${embedding.join(",")}]`;
        const sourcesJson = JSON.stringify(sources);
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SemanticQaCache" (
             "id", "tenantId", "normalizedQuery", "question", "answer", "sources", "embedding", "hitCount", "createdAt", "updatedAt"
           ) VALUES (
             gen_random_uuid()::text, $1, $2, $3, $4, $5::jsonb, $6::vector, 1, NOW(), NOW()
           )`,
          tenantId,
          normalized,
          userQuery,
          answer,
          sourcesJson,
          vectorLiteral
        );
      }
    } catch (err: any) {
      // In case table or vector type is not present
      console.warn("[Save SemanticQaCache DB Warn]", err?.message || err);
    }
  }
}

export async function invalidateCapyRagCache(tenantId?: string): Promise<void> {
  const currentTenant = tenantId || getCurrentTenantId() || "limart";

  // 1. Invalidate In-Memory caches
  if (tenantId) {
    inMemorySemanticCache.delete(tenantId);
    for (const key of Array.from(inMemoryExactCache.keys())) {
      if (key.startsWith(`${tenantId}:`)) {
        inMemoryExactCache.delete(key);
      }
    }
  } else {
    inMemorySemanticCache.clear();
    inMemoryExactCache.clear();
  }

  // 2. Invalidate Valkey exact cache keys
  try {
    await invalidateCachePattern("capy:qa:*");
  } catch {
    // Safe non-blocking
  }

  // 3. Clear PostgreSQL SemanticQaCache
  try {
    if (typeof prisma.$executeRawUnsafe === "function") {
      if (tenantId) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "SemanticQaCache" WHERE "tenantId" = $1`,
          tenantId
        );
      } else {
        await prisma.$executeRawUnsafe(`DELETE FROM "SemanticQaCache"`);
      }
    }
  } catch (err: any) {
    console.warn("[Invalidate SemanticQaCache DB Warn]", err?.message || err);
  }
}

// ============================================================================
// 8. pgvector 0.8.7 (PostgreSQL 18.6) Superpowers: halfvec HNSW & Pure-SQL RRF
// ============================================================================

/**
 * Ensures pgvector halfvec HNSW and tsvector GIN indexes exist on DocumentChunk and SemanticQaCache.
 * Non-blocking, safe to call during startup or document reindex.
 */
export async function ensurePgvectorHalfvecIndexes(): Promise<boolean> {
  try {
    if (typeof prisma.$executeRawUnsafe !== "function") return true;

    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");

    // Ensure SemanticQaCache table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SemanticQaCache" (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL DEFAULT 'limart',
        "normalizedQuery" TEXT NOT NULL,
        "question" TEXT NOT NULL,
        "answer" TEXT NOT NULL,
        "sources" JSONB,
        "embedding" vector,
        "hitCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // HNSW index on DocumentChunk using halfvec_cosine_ops
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_document_chunk_halfvec 
        ON "DocumentChunk" USING hnsw ((embedding::halfvec) halfvec_cosine_ops);
      `);
    } catch {
      // Fallback to standard vector index if halfvec unsupported
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_document_chunk_vector 
        ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
      `).catch(() => {});
    }

    // GIN full-text index on DocumentChunk content
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_document_chunk_content_gin 
        ON "DocumentChunk" USING gin (to_tsvector('simple', content));
      `);
    } catch {
      // Safe non-blocking
    }

    // HNSW index on SemanticQaCache using halfvec_cosine_ops
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_semantic_qa_cache_halfvec 
        ON "SemanticQaCache" USING hnsw ((embedding::halfvec) halfvec_cosine_ops);
      `);
    } catch {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_semantic_qa_cache_vector 
        ON "SemanticQaCache" USING hnsw (embedding vector_cosine_ops);
      `).catch(() => {});
    }

    return true;
  } catch (err: any) {
    console.warn("[Ensure Pgvector Halfvec Indexes Warn]", err?.message || err);
    return false;
  }
}

export interface HybridSearchResultChunk {
  documentId?: string;
  content: string;
  path: string;
  title: string;
  distance: number;
  rrfScore?: number;
  rankVector?: number | null;
  rankKeyword?: number | null;
}

/**
 * Pure-SQL Hybrid RRF (Reciprocal Rank Fusion):
 * Combines halfvec Vector Cosine Rank + PostgreSQL tsvector Keyword Rank with k = 60.
 */
export async function hybridSearchDocumentChunksRRF(
  queryVector: number[] | null,
  userQuery: string,
  limit = 8
): Promise<HybridSearchResultChunk[]> {
  const cleanQuery = normalizeCapyQuery(userQuery);
  const cleanTsQuery = cleanQuery.replace(/['"]/g, " ").trim();

  // If no query vector provided, perform keyword-only search
  if (!queryVector || queryVector.length === 0) {
    try {
      const kwChunks = await prisma.$queryRaw<Array<{
        documentId: string;
        content: string;
        path: string;
        title: string;
      }>>`
        SELECT
          c."documentId",
          c.content,
          d.path,
          d.title
        FROM "DocumentChunk" c
        JOIN "Document" d ON c."documentId" = d.id
        WHERE to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(c.content, ''))
              @@ plainto_tsquery('simple', ${cleanTsQuery})
        LIMIT ${limit}
      `;

      return (kwChunks || []).map((c, i) => ({
        ...c,
        distance: 0.5,
        rrfScore: computeRrfScore(null, i + 1, 60),
        rankVector: null,
        rankKeyword: i + 1,
      }));
    } catch {
      return [];
    }
  }

  const queryVectorLiteral = `[${queryVector.join(",")}]`;

  // Execute Pure-SQL CTE RRF
  try {
    const fusedResults = await prisma.$queryRaw<Array<{
      documentId?: string;
      content: string;
      path: string;
      title: string;
      distance: number;
      rrfScore: number;
      rankVector?: number | null;
      rankKeyword?: number | null;
    }>>`
      WITH vector_matches AS (
        SELECT
          c.id,
          c."documentId",
          c.content,
          d.path,
          d.title,
          (c.embedding::halfvec <=> ${queryVectorLiteral}::halfvec)::float8 AS distance,
          ROW_NUMBER() OVER (ORDER BY (c.embedding::halfvec <=> ${queryVectorLiteral}::halfvec) ASC) AS rank_vec
        FROM "DocumentChunk" c
        JOIN "Document" d ON c."documentId" = d.id
        WHERE c.embedding IS NOT NULL
        ORDER BY (c.embedding::halfvec <=> ${queryVectorLiteral}::halfvec) ASC
        LIMIT 20
      ),
      keyword_matches AS (
        SELECT
          c.id,
          c."documentId",
          c.content,
          d.path,
          d.title,
          ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(
              to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(c.content, '')),
              plainto_tsquery('simple', ${cleanTsQuery})
            ) DESC
          ) AS rank_kw
        FROM "DocumentChunk" c
        JOIN "Document" d ON c."documentId" = d.id
        WHERE to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(c.content, ''))
              @@ plainto_tsquery('simple', ${cleanTsQuery})
        LIMIT 20
      ),
      rrf_fused AS (
        SELECT
          COALESCE(v.id, k.id) AS id,
          COALESCE(v."documentId", k."documentId") AS "documentId",
          COALESCE(v.content, k.content) AS content,
          COALESCE(v.path, k.path) AS path,
          COALESCE(v.title, k.title) AS title,
          COALESCE(v.distance, 0.5) AS distance,
          (COALESCE(1.0 / (60 + v.rank_vec), 0.0) + COALESCE(1.0 / (60 + k.rank_kw), 0.0))::float8 AS "rrfScore",
          v.rank_vec AS "rankVector",
          k.rank_kw AS "rankKeyword"
        FROM vector_matches v
        FULL OUTER JOIN keyword_matches k ON v.id = k.id
      )
      SELECT "documentId", content, path, title, distance, "rrfScore", "rankVector", "rankKeyword"
      FROM rrf_fused
      WHERE distance <= 0.65 OR "rankKeyword" IS NOT NULL
      ORDER BY "rrfScore" DESC, distance ASC
      LIMIT ${limit}
    `;

    if (fusedResults && Array.isArray(fusedResults) && fusedResults.length > 0) {
      return fusedResults.map((chunk, index) => ({
        ...chunk,
        distance: chunk.distance !== undefined ? Number(chunk.distance) : 0.5,
        rrfScore:
          chunk.rrfScore !== undefined && chunk.rrfScore !== null
            ? Number(chunk.rrfScore)
            : computeRrfScore(chunk.rankVector ?? index + 1, chunk.rankKeyword, 60),
      }));
    }
  } catch (rrfErr) {
    // If CTE or tsvector fails (e.g. mock test environment), fall back to standard vector search
  }

  // Fallback: standard vector distance query (compatible with Prisma mocks)
  try {
    const rawChunks = await prisma.$queryRaw<Array<{
      documentId?: string;
      content: string;
      path: string;
      title: string;
      distance: number;
    }>>`
      SELECT
        c."documentId",
        c.content,
        d.path,
        d.title,
        (c.embedding <=> ${queryVectorLiteral}::vector)::float8 AS distance
      FROM "DocumentChunk" c
      JOIN "Document" d ON c."documentId" = d.id
      WHERE c.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    return (rawChunks || [])
      .filter((chunk) => chunk.distance === undefined || chunk.distance <= 0.65)
      .map((chunk, index) => ({
        ...chunk,
        distance: chunk.distance !== undefined ? Number(chunk.distance) : 0.4,
        rrfScore: computeRrfScore(index + 1, null, 60),
        rankVector: index + 1,
        rankKeyword: null,
      }));
  } catch {
    return [];
  }
}
