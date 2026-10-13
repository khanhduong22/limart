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
  return await getOrSetCache("config:allowed-ips", 600, async () => {
    return await prisma.allowedIP.findMany();
  });
}

export async function getIPStatus(c: Context): Promise<{
  ip: string;
  isAllowed: boolean;
  locationName: string;
}> {
  const clientIP = getClientIP(c);
  const allowedIps = await getAllowedIPs();
  const prefixes = allowedIps.map((r: { prefix: string }) => r.prefix);

  const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const isAllowed = isDev && prefixes.length === 0 ? true : isIPMatch(clientIP, prefixes);

  const matched = isAllowed
    ? allowedIps.find((ip: { prefix: string }) => isIPMatch(clientIP, [ip.prefix]))
    : null;

  return {
    ip: clientIP,
    isAllowed,
    locationName: isAllowed ? (matched?.label || "Văn phòng") : "Ngoài vùng phủ sóng",
  };
}
