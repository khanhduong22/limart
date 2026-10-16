import { Context } from "hono";
import { prisma } from "@checkin/db";
import { isIPMatch } from "@checkin/shared";
import { getOrSetCache } from "./cache";

export function getClientIP(c: Context): string {
  const cfConnectingIp = c.req.header("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  const realIp = c.req.header("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return "127.0.0.1";
}

export async function getAllowedIPs() {
  const list = await getOrSetCache("config:allowed-ips", 600, async () => {
    return await prisma.allowedIP.findMany();
  });

  const safeList = Array.isArray(list) ? list : [];
  const isDemo = process.env.DEMO_SANDBOX_MODE === "true";
  const hasWildcard = safeList.some(
    (r: { prefix: string }) => r.prefix === "0.0.0.0/0" || r.prefix === "*"
  );

  if (isDemo || hasWildcard) {
    const result = [...safeList];
    if (!result.some((r: { prefix: string }) => r.prefix === "0.0.0.0/0")) {
      result.push({
        id: 999991,
        prefix: "0.0.0.0/0",
        label: "Demo Public Mode (Mọi mạng WiFi/4G)",
        createdAt: new Date(),
      });
    }
    if (!result.some((r: { prefix: string }) => r.prefix === "::/0")) {
      result.push({
        id: 999992,
        prefix: "::/0",
        label: "Demo Public Mode (Mọi mạng WiFi/4G)",
        createdAt: new Date(),
      });
    }
    return result;
  }

  return safeList;
}

export async function getIPStatus(c: Context): Promise<{
  ip: string;
  isAllowed: boolean;
  allowed: boolean;
  locationName: string;
}> {
  const clientIP = getClientIP(c);
  const allowedIps = await getAllowedIPs();
  const prefixes = allowedIps.map((r: { prefix: string }) => r.prefix);

  const isDemo = process.env.DEMO_SANDBOX_MODE === "true";
  const hasWildcard = prefixes.some(
    (p: string) => p === "0.0.0.0/0" || p === "*" || p === "::/0"
  );
  const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const isAllowed =
    isDemo || hasWildcard || (isDev && prefixes.length === 0)
      ? true
      : isIPMatch(clientIP, prefixes);

  const matched = isAllowed
    ? allowedIps.find((ip: { prefix: string }) =>
        ip.prefix !== "0.0.0.0/0" &&
        ip.prefix !== "::/0" &&
        ip.prefix !== "*" &&
        isIPMatch(clientIP, [ip.prefix])
      ) ||
      allowedIps.find(
        (ip: { prefix: string }) => ip.prefix === "0.0.0.0/0" || ip.prefix === "*"
      )
    : null;

  return {
    ip: clientIP,
    isAllowed,
    allowed: isAllowed,
    locationName: isAllowed
      ? matched?.label || (isDemo ? "Demo Public Mode (Mọi mạng WiFi/4G)" : "Văn phòng")
      : "Ngoài vùng phủ sóng",
  };
}
