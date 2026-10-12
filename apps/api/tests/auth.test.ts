import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique, mockFindMany, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      update: mockUpdate,
    },
    sessionAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-123" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

import { app } from "../src/app";
import { signAccessToken, verifyAccessToken, TOKEN_EXPIRY_SECONDS } from "../src/lib/auth";
import { decode } from "hono/jwt";
import { _resetRateLimits } from "../src/middleware/rate-limiter";

describe("Auth System (30-Day Cookie & Google OAuth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimits();
  });

  describe("Token Utility (signAccessToken & verifyAccessToken)", () => {
    it("signs access token with 30-day expiration (2592000s)", async () => {
      const token = await signAccessToken({
        sub: "u-30day",
        email: "test@limart.vn",
        role: "USER",
        name: "Test Staff",
      });

      expect(typeof token).toBe("string");
      const decoded: any = decode(token);
      expect(decoded.payload.sub).toBe("u-30day");
      expect(decoded.payload.exp - decoded.payload.iat).toBe(TOKEN_EXPIRY_SECONDS);
      expect(TOKEN_EXPIRY_SECONDS).toBe(30 * 24 * 60 * 60);

      const verified = await verifyAccessToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.email).toBe("test@limart.vn");
      expect(verified?.role).toBe("USER");
    });

    it("fails verification when token is tampered", async () => {
      const token = await signAccessToken({
        sub: "u-tamper",
        email: "tamper@limart.vn",
        role: "USER",
      });
      const tampered = token + "bad";
      const verified = await verifyAccessToken(tampered);
      expect(verified).toBeNull();
    });
  });

  describe("GET /api/me (Auth Middleware)", () => {
    it("returns 401 when authentication credentials (cookie and header) are missing", async () => {
      const res = await app.request("/api/me");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Missing authentication credentials");
    });

    it("returns 200 and profile when valid access_token cookie is provided", async () => {
      const token = await signAccessToken({
        sub: "u-valid",
        email: "staff@limart.vn",
        role: "USER",
      });

      mockFindUnique.mockResolvedValue({
        id: "u-valid",
        name: "Valid Staff",
        email: "staff@limart.vn",
        role: "USER",
        isActive: true,
      });

      const res = await app.request("/api/me", {
        headers: {
          Cookie: `access_token=${token}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.name).toBe("Valid Staff");
      expect(data.token).toBe(token);
    });

    it("returns 200 and profile when valid Authorization: Bearer <token> is provided without cookie", async () => {
      const token = await signAccessToken({
        sub: "u-bearer",
        email: "staff-bearer@limart.vn",
        role: "USER",
      });

      mockFindUnique.mockResolvedValue({
        id: "u-bearer",
        name: "Bearer Staff",
        email: "staff-bearer@limart.vn",
        role: "USER",
        isActive: true,
      });

      const res = await app.request("/api/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.name).toBe("Bearer Staff");
      expect(data.token).toBe(token);
    });

    it("returns 401 when access_token cookie is invalid or corrupted", async () => {
      const res = await app.request("/api/me", {
        headers: {
          Cookie: "access_token=malformed_or_expired_cookie",
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Session expired or invalid");
    });
  });

  describe("Google OAuth Endpoints", () => {
    beforeEach(() => {
      process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    });

    function createFakeIdToken(email: string) {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64");
      const payload = Buffer.from(
        JSON.stringify({ email, sub: "google-sub-123", iss: "https://accounts.google.com" })
      ).toString("base64");
      return `${header}.${payload}.fakesig`;
    }

    describe("GET /api/auth/google", () => {
      it("redirects (302) to Google OAuth authorization URL with correct parameters", async () => {
        const res = await app.request("/api/auth/google", {
          headers: {
            "x-forwarded-proto": "https",
            "x-forwarded-host": "limart.khanhdp.com",
          },
        });

        expect(res.status).toBe(302);
        const location = res.headers.get("location");
        expect(location).toBeDefined();
        expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
        expect(location).toContain("client_id=");
        expect(location).toContain("redirect_uri=https%3A%2F%2Flimart.khanhdp.com%2Fapi%2Fauth%2Fcallback%2Fgoogle");
        expect(location).toContain("response_type=code");
        expect(location).toContain("scope=openid%20email%20profile");
      });

      it("sanitizes surrounding quotes and spaces from GOOGLE_CLIENT_ID", async () => {
        process.env.GOOGLE_CLIENT_ID = ' "quoted-client-id.apps.googleusercontent.com" ';
        const res = await app.request("/api/auth/google");
        expect(res.status).toBe(302);
        const location = res.headers.get("location");
        expect(location).toContain("client_id=quoted-client-id.apps.googleusercontent.com");
      });
    });

    describe("GET /api/auth/callback/google", () => {
      it("redirects to /login?error=cancelled if error parameter is present", async () => {
        const res = await app.request("/api/auth/callback/google?error=access_denied");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=cancelled");
      });

      it("redirects to /login?error=cancelled if code is missing", async () => {
        const res = await app.request("/api/auth/callback/google");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=cancelled");
      });

      it("redirects to /login?error=exchange_failed if token exchange fails", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
        );

        const res = await app.request("/api/auth/callback/google?code=invalid_auth_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=exchange_failed");
      });

      it("redirects to /login?error=not_registered when email is not found in database", async () => {
        const fakeToken = createFakeIdToken("unknown_staff@gmail.com");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue(null);

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        const location = res.headers.get("location");
        expect(location).toContain("/login?error=not_registered");
        expect(location).toContain("email=unknown_staff%40gmail.com");
      });

      it("redirects to /login?error=inactive when user is inactive", async () => {
        const fakeToken = createFakeIdToken("inactive_staff@gmail.com");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue({
          id: "u-inactive",
          email: "inactive_staff@gmail.com",
          isActive: false,
          role: "USER",
        });

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=inactive");
      });

      it("successfully logs in staff user: sets 30-day HttpOnly cookie and redirects to /", async () => {
        const fakeToken = createFakeIdToken("trang@limart.vn");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue({
          id: "u-trang",
          email: "trang@limart.vn",
          name: "Thu Trang",
          role: "USER",
          isActive: true,
        });

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toMatch(/^\/\?token=/);
        const setCookie = res.headers.get("set-cookie");
        expect(setCookie).toContain("access_token");
        expect(setCookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
      });

      it("redirects admin user to /admin upon successful login", async () => {
        const fakeToken = createFakeIdToken("admin@limart.vn");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue({
          id: "u-admin",
          email: "admin@limart.vn",
          name: "Manager Admin",
          role: "ADMIN",
          isActive: true,
        });

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toMatch(/^\/admin\?token=/);
      });

      it("redirects PARTNER user to /tasks upon successful login", async () => {
        const fakeToken = createFakeIdToken("partner@limart.vn");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue({
          id: "u-partner",
          email: "partner@limart.vn",
          name: "Partner User",
          role: "PARTNER",
          isActive: true,
        });

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toMatch(/^\/tasks\?token=/);
      });

      it("auto-assigns cuccung123456789@gmail.com to PARTNER and redirects to /tasks", async () => {
        const fakeToken = createFakeIdToken("cuccung123456789@gmail.com");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue({
          id: "u-thu",
          email: "cuccung123456789@gmail.com",
          name: "Thu Nguyen",
          role: "USER",
          isActive: true,
        });
        mockUpdate.mockResolvedValue({
          id: "u-thu",
          email: "cuccung123456789@gmail.com",
          name: "Thu Nguyen",
          role: "PARTNER",
          isActive: true,
        });

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toMatch(/^\/tasks\?token=/);
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "u-thu" },
            data: { role: "PARTNER" },
          })
        );
      });

      it("auto-promotes khanhdev4@gmail.com to ADMIN and redirects to /admin", async () => {
        const fakeToken = createFakeIdToken("khanhdev4@gmail.com");
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fakeToken }), { status: 200 })
        );
        mockFindUnique.mockResolvedValue({
          id: "u-khanh",
          email: "khanhdev4@gmail.com",
          name: "Khanh Dev",
          role: "USER",
          isActive: true,
        });
        mockUpdate.mockResolvedValue({
          id: "u-khanh",
          email: "khanhdev4@gmail.com",
          name: "Khanh Dev",
          role: "ADMIN",
          isActive: true,
        });

        const res = await app.request("/api/auth/callback/google?code=valid_code");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toMatch(/^\/admin\?token=/);
        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "u-khanh" },
            data: { role: "ADMIN" },
          })
        );
      });
    });
  });
});
