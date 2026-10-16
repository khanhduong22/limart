import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  VapidConfig,
  VapidKeys,
  WebPushOptions,
  WebPushPayload,
  WebPushSendResult,
  WebPushSubscription,
} from './types';

export class WebPushError extends Error {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  endpoint: string;

  constructor(
    message: string,
    statusCode: number,
    headers: Record<string, string>,
    body: string,
    endpoint: string
  ) {
    super(message);
    this.name = 'WebPushError';
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
    this.endpoint = endpoint;
  }
}

function toBase64Url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(base64Url: string): Buffer {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Converts a URL-safe base64 string (e.g. VAPID public key) into a Uint8Array
 * suitable for `PushManager.subscribe({ applicationServerKey })` or crypto buffers.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const buf = fromBase64Url(base64String);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Generates a URL-safe, base64-encoded VAPID public (65-byte uncompressed P-256 point)
 * and private (32-byte P-256 scalar) key pair using built-in node:crypto.
 */
export function generateVAPIDKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' }) as { x: string; y: string; d: string };
  const pubBuffer = Buffer.concat([
    Buffer.from([0x04]),
    fromBase64Url(jwk.x),
    fromBase64Url(jwk.y),
  ]);
  return {
    publicKey: toBase64Url(pubBuffer),
    privateKey: jwk.d,
  };
}

/**
 * Creates an RFC 8292 VAPID ES256 JWT token signed with the P-256 private key.
 */
function createVapidJwt(audience: string, vapid: VapidConfig): string {
  const pub = fromBase64Url(vapid.publicKey);
  const priv = fromBase64Url(vapid.privateKey);

  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('Invalid VAPID publicKey: must be 65-byte uncompressed P-256 point');
  }
  if (priv.length !== 32) {
    throw new Error('Invalid VAPID privateKey: must be 32-byte P-256 scalar');
  }

  const keyObject = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(pub.subarray(1, 33)),
      y: toBase64Url(pub.subarray(33, 65)),
      d: toBase64Url(priv),
    },
    format: 'jwk',
  });

  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours
  const payload = toBase64Url(
    Buffer.from(JSON.stringify({ aud: audience, exp, sub: vapid.subject }), 'utf8')
  );
  const unsignedToken = `${header}.${payload}`;

  const signer = createSign('SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign({ key: keyObject, dsaEncoding: 'ieee-p1363' });

  return `${unsignedToken}.${toBase64Url(signature)}`;
}

/**
 * Encrypts a Web Push payload according to RFC 8291 (Web Push Message Encryption)
 * and RFC 8188 (aes128gcm Encrypted Content-Encoding).
 */
function encryptWebPushPayload(
  payloadString: string,
  p256dhBase64Url: string,
  authBase64Url: string
): Buffer {
  const uaPublic = fromBase64Url(p256dhBase64Url);
  const authSecret = fromBase64Url(authBase64Url);

  const localEcdh = createECDH('prime256v1');
  localEcdh.generateKeys();
  const asPublic = localEcdh.getPublicKey(); // 65-byte uncompressed ephemeral server public key
  const sharedSecret = localEcdh.computeSecret(uaPublic);

  const salt = randomBytes(16);

  // RFC 8291 Section 3.4: Derive 32-byte IKM via HKDF-SHA256
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));

  // RFC 8188 Section 2.2 & 2.3: Derive 16-byte CEK and 12-byte Nonce
  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'ascii');
  const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'ascii');
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, cekInfo, 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, nonceInfo, 12));

  // RFC 8188 Section 2: Append 0x02 record delimiter and encrypt with AES-128-GCM
  const plaintext = Buffer.from(payloadString, 'utf8');
  const paddedPlaintext = Buffer.concat([plaintext, Buffer.from([0x02])]);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(paddedPlaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // RFC 8188 Section 2.1: 86-byte aes128gcm content-coding header
  // salt (16B) || rs (4B uint32BE = 4096) || idlen (1B = 65) || keyid (65B = asPublic)
  const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, ciphertext]);
}

/**
 * Sends a Web Push notification to a target subscription using VAPID (RFC 8292 + RFC 8291).
 *
 * Safely catches push service errors (like 410 Gone / 404 Not Found)
 * and returns `isExpired: true` so the caller can clean up the inactive subscription from the database.
 */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: WebPushPayload | string,
  vapid: VapidConfig,
  options?: WebPushOptions
): Promise<WebPushSendResult> {
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return {
      success: false,
      isExpired: false,
      error: 'Invalid push subscription: endpoint and keys (p256dh, auth) are required',
    };
  }

  if (!vapid || !vapid.subject || !vapid.publicKey || !vapid.privateKey) {
    return {
      success: false,
      isExpired: false,
      error: 'VAPID credentials missing: subject, publicKey, and privateKey are required',
    };
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    const parsedUrl = new URL(subscription.endpoint);
    const audience = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const jwt = createVapidJwt(audience, vapid);
    const encryptedBody = encryptWebPushPayload(
      payloadString,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    const headers: Record<string, string> = {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      TTL: String(options?.TTL ?? 2419200),
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(encryptedBody.byteLength),
      ...(options?.headers ?? {}),
    };

    if (options?.urgency) {
      headers.Urgency = options.urgency;
    }
    if (options?.topic) {
      headers.Topic = options.topic;
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeout ?? 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(subscription.endpoint, {
        method: 'POST',
        headers,
        body: new Uint8Array(encryptedBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status >= 200 && res.status < 300) {
      return {
        success: true,
        statusCode: res.status,
        isExpired: false,
      };
    }

    const isExpired = res.status === 410 || res.status === 404;
    const responseText = await res.text().catch(() => '');

    return {
      success: false,
      statusCode: res.status,
      isExpired,
      error: responseText || `Web Push failed with HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number; status?: number; message?: string };
    const statusCode = errorObj.statusCode ?? errorObj.status;
    const isExpired = statusCode === 410 || statusCode === 404;
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      success: false,
      statusCode: typeof statusCode === 'number' ? statusCode : undefined,
      isExpired,
      error: errorMessage,
    };
  }
}

/**
 * High-level Web Push Notifier Client pre-configured with VAPID credentials
 */
export class WebPushNotifier {
  private vapid: VapidConfig;

  constructor(vapid: VapidConfig) {
    this.vapid = vapid;
  }

  /**
   * Send notification to a push subscriber
   */
  async send(
    subscription: WebPushSubscription,
    payload: WebPushPayload | string,
    options?: WebPushOptions
  ): Promise<WebPushSendResult> {
    return sendWebPush(subscription, payload, this.vapid, options);
  }
}

/**
 * Factory function to create a pre-configured WebPushNotifier
 */
export function createWebPushNotifier(vapid: VapidConfig): WebPushNotifier {
  return new WebPushNotifier(vapid);
}
