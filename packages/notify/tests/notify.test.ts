import { describe, expect, it } from 'bun:test';
import { createECDH, randomBytes } from 'node:crypto';
import {
  createWebPushNotifier,
  escapeHtml,
  escapeMarkdownV2,
  formatAppointmentNotificationHtml,
  formatMoneyVND,
  formatOrderNotificationHtml,
  formatStayBookingTelegramHtml,
  formatSystemAlertHtml,
  generateVAPIDKeys,
  sendTelegramMessage,
  sendWebPush,
  urlBase64ToUint8Array,
} from '../src';

function createTestSubscriptionKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const p256dh = ecdh
    .getPublicKey()
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const auth = randomBytes(16)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { p256dh, auth };
}

describe('@checkin/notify — Web Push (RFC 8292 VAPID & RFC 8291 aes128gcm)', () => {
  it('generateVAPIDKeys() generates valid P-256 uncompressed public (65B) and private (32B) keys', () => {
    const keys = generateVAPIDKeys();
    expect(typeof keys.publicKey).toBe('string');
    expect(typeof keys.privateKey).toBe('string');

    const pubBytes = urlBase64ToUint8Array(keys.publicKey);
    const privBytes = urlBase64ToUint8Array(keys.privateKey);

    expect(pubBytes.byteLength).toBe(65);
    expect(pubBytes[0]).toBe(0x04);
    expect(privBytes.byteLength).toBe(32);
  });

  it('urlBase64ToUint8Array() converts URL-safe base64 strings accurately', () => {
    const original = Buffer.from([0x04, 0xff, 0x00, 0xfe, 0x3e, 0x3f]);
    const b64url = original
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const decoded = urlBase64ToUint8Array(b64url);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('sendWebPush() validates subscription and VAPID credentials', async () => {
    const vapid = {
      subject: 'mailto:admin@limart.vn',
      ...generateVAPIDKeys(),
    };

    const invalidSubResult = await sendWebPush(
      { endpoint: '', keys: { p256dh: '', auth: '' } },
      { title: 'Shift Reminder', body: 'Your shift starts in 15m' },
      vapid
    );
    expect(invalidSubResult.success).toBe(false);
    expect(invalidSubResult.isExpired).toBe(false);
    expect(invalidSubResult.error).toContain('Invalid push subscription');

    const keys = createTestSubscriptionKeys();
    const invalidVapidResult = await sendWebPush(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/test-123', keys },
      { title: 'Shift Reminder', body: 'Your shift starts in 15m' },
      { subject: '', publicKey: '', privateKey: '' }
    );
    expect(invalidVapidResult.success).toBe(false);
    expect(invalidVapidResult.isExpired).toBe(false);
    expect(invalidVapidResult.error).toContain('VAPID credentials missing');
  });

  it('sendWebPush() encrypts payload with aes128gcm, signs VAPID ES256 JWT, and detects HTTP 201 / 410 Gone', async () => {
    const vapid = {
      subject: 'mailto:admin@limart.vn',
      ...generateVAPIDKeys(),
    };
    const keys = createTestSubscriptionKeys();
    const subscription = {
      endpoint: 'https://push.example.com/send/sub-abc',
      keys,
    };

    const originalFetch = globalThis.fetch;
    try {
      let capturedHeaders: Record<string, string> = {};
      let capturedBodyLength = 0;

      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        const body = init?.body as Uint8Array;
        capturedBodyLength = body ? body.byteLength : 0;
        return new Response('', { status: 201 });
      }) as typeof fetch;

      const notifier = createWebPushNotifier(vapid);
      const okResult = await notifier.send(
        subscription,
        { title: 'Ca làm sắp bắt đầu', body: 'Còn 15 phút nữa tới ca sáng', url: '/schedule' },
        { urgency: 'high', TTL: 3600 }
      );

      expect(okResult).toEqual({
        success: true,
        statusCode: 201,
        isExpired: false,
      });
      expect(capturedHeaders.Authorization).toStartWith('vapid t=');
      expect(capturedHeaders.Authorization).toContain(`, k=${vapid.publicKey}`);
      expect(capturedHeaders['Content-Encoding']).toBe('aes128gcm');
      expect(capturedHeaders.Urgency).toBe('high');
      expect(capturedHeaders.TTL).toBe('3600');
      expect(capturedBodyLength).toBeGreaterThan(86);

      // Simulate 410 Gone expired subscription
      globalThis.fetch = (async () =>
        new Response('Subscription expired', { status: 410 })) as typeof fetch;

      const expiredResult = await notifier.send(subscription, {
        title: 'Test',
        body: 'Expired sub',
      });
      expect(expiredResult.success).toBe(false);
      expect(expiredResult.statusCode).toBe(410);
      expect(expiredResult.isExpired).toBe(true);

      // Simulate 404 Not Found expired subscription
      globalThis.fetch = (async () =>
        new Response('Not found', { status: 404 })) as typeof fetch;

      const notFoundResult = await notifier.send(subscription, 'raw payload');
      expect(notFoundResult.success).toBe(false);
      expect(notFoundResult.statusCode).toBe(404);
      expect(notFoundResult.isExpired).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('@checkin/notify — Formatters & Telegram Validation', () => {
  it('formats VND currency and escapes HTML / MarkdownV2', () => {
    expect(formatMoneyVND(150000)).toContain('150.000');
    expect(escapeHtml('<b>"A & B"</b>')).toBe('&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;');
    expect(escapeMarkdownV2('Hello_World!')).toBe('Hello\\_World\\!');
  });

  it('formats Order, Appointment, StayBooking, and SystemAlert HTML messages', () => {
    const orderHtml = formatOrderNotificationHtml({
      orderId: 'ORD-01',
      customerName: 'Nguyen Van A',
      phone: '0901234567',
      items: [{ name: 'Cà phê sữa', quantity: 2, price: 35000 }],
      totalAmount: 70000,
      paymentMethod: 'VIETQR',
      paymentStatus: 'PAID',
    });
    expect(orderHtml).toContain('ORD-01');
    expect(orderHtml).toContain('Cà phê sữa');

    const appointmentHtml = formatAppointmentNotificationHtml({
      appointmentId: 'APT-02',
      customerName: 'Tran Thi B',
      phone: '0909999888',
      serviceName: 'Chăm sóc da',
      appointmentTime: new Date('2026-10-16T09:00:00Z'),
      totalAmount: 500000,
    });
    expect(appointmentHtml).toContain('APT-02');
    expect(appointmentHtml).toContain('Chăm sóc da');

    const stayHtml = formatStayBookingTelegramHtml({
      bookingId: 'BK-1',
      bookingCode: 'PINE99',
      customerName: 'Le C',
      phone: '0912345678',
      roomName: 'Forest Suite',
      checkInDate: '2026-10-20',
      checkOutDate: '2026-10-22',
      nights: 2,
      guests: { adults: 2, children: 1 },
      totalAmount: 3000000,
      depositAmount: 1500000,
      smartLockPin: '123456#',
    });
    expect(stayHtml).toContain('PINE99');
    expect(stayHtml).toContain('123456#');

    const alertHtml = formatSystemAlertHtml({
      service: 'limart-api',
      title: 'High Latency',
      message: 'P95 exceeded threshold',
      level: 'WARN',
    });
    expect(alertHtml).toContain('LIMART-API');
    expect(alertHtml).toContain('High Latency');
  });

  it('validates missing Telegram botToken and chatId', async () => {
    const noToken = await sendTelegramMessage({ chatId: '123', text: 'Hi' });
    expect(noToken.success).toBe(false);

    const noChat = await sendTelegramMessage({ botToken: 'tok', chatId: '', text: 'Hi' });
    expect(noChat.success).toBe(false);
  });
});
