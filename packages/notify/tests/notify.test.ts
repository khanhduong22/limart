import { describe, expect, it } from 'bun:test';
import { createECDH, randomBytes } from 'node:crypto';
import {
  createNotificationScheduler,
  createWebPushNotifier,
  escapeHtml,
  escapeMarkdownV2,
  formatAppointmentNotificationHtml,
  formatMoneyVND,
  formatOrderNotificationHtml,
  formatStayBookingTelegramHtml,
  formatSystemAlertHtml,
  generateVAPIDKeys,
  HybridNotificationScheduler,
  sendTelegramMessage,
  sendWebPush,
  urlBase64ToUint8Array,
  type ZSetStoreAdapter,
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

describe('@checkin/notify — HybridNotificationScheduler (Timing Wheel + Valkey ZSET + Single Timer)', () => {
  it('groups jobs into O(1) quantized Timing Wheel buckets and maintains strictly ONE active timer', async () => {
    const baseNow = new Date('2026-10-16T00:00:00.000Z').getTime();
    let currentNow = baseNow;
    const dispatchedIds: string[] = [];

    const scheduler = createNotificationScheduler<{ label: string }>({
      bucketResolutionMs: 1000,
      nowFn: () => currentNow,
      onDispatch: (job) => {
        dispatchedIds.push(job.id);
      },
    });

    try {
      // Schedule 3 jobs: two at +30m (within same 1s bucket) and one at +15m
      const t15m = baseNow + 15 * 60_000;
      const t30m = baseNow + 30 * 60_000;

      scheduler.schedule({
        id: 'shift-1:30m',
        fireAtMs: t30m + 120,
        payload: { label: 'Shift 1 -30m' },
      });
      scheduler.schedule({
        id: 'shift-2:30m',
        fireAtMs: t30m + 850,
        payload: { label: 'Shift 2 -30m' },
      });

      let telemetry = scheduler.getTelemetry();
      expect(telemetry.mode).toBe('in-memory-wheel');
      expect(telemetry.activeTimers).toBe(1);
      expect(telemetry.totalPendingJobs).toBe(2);
      expect(telemetry.totalBuckets).toBe(1);
      expect(telemetry.nextWakeupMs).toBe(t30m);

      // Now schedule an earlier job at +15m -> single timer immediately re-arms to t15m
      scheduler.schedule({
        id: 'shift-1:15m',
        fireAtMs: t15m + 400,
        payload: { label: 'Shift 1 -15m' },
      });

      telemetry = scheduler.getTelemetry();
      expect(telemetry.activeTimers).toBe(1);
      expect(telemetry.totalPendingJobs).toBe(3);
      expect(telemetry.totalBuckets).toBe(2);
      expect(telemetry.nextWakeupMs).toBe(t15m);

      // Advance clock to t15m and flush due bucket
      currentNow = t15m;
      const flush1 = await scheduler.flushDue(currentNow);
      expect(flush1.dispatched.map((j) => j.id)).toEqual(['shift-1:15m']);

      // Single timer automatically re-armed to t30m!
      telemetry = scheduler.getTelemetry();
      expect(telemetry.activeTimers).toBe(1);
      expect(telemetry.totalPendingJobs).toBe(2);
      expect(telemetry.totalBuckets).toBe(1);
      expect(telemetry.nextWakeupMs).toBe(t30m);
      expect(telemetry.firedCount).toBe(1);

      // Advance clock to t30m and flush remaining bucket
      currentNow = t30m;
      const flush2 = await scheduler.flushDue(currentNow);
      expect(flush2.dispatched.map((j) => j.id)).toEqual(['shift-1:30m', 'shift-2:30m']);

      telemetry = scheduler.getTelemetry();
      expect(telemetry.activeTimers).toBe(0);
      expect(telemetry.totalPendingJobs).toBe(0);
      expect(telemetry.totalBuckets).toBe(0);
      expect(telemetry.nextWakeupMs).toBeNull();
      expect(telemetry.firedCount).toBe(3);
      expect(dispatchedIds).toEqual(['shift-1:15m', 'shift-1:30m', 'shift-2:30m']);
    } finally {
      scheduler.clear();
    }
  });

  it('supports O(1) job cancellation and re-arms the single timer to the next earliest bucket', () => {
    const baseNow = new Date('2026-10-16T00:00:00.000Z').getTime();
    const scheduler = new HybridNotificationScheduler({
      nowFn: () => baseNow,
      onDispatch: () => {},
    });

    try {
      const t10m = baseNow + 10 * 60_000;
      const t25m = baseNow + 25 * 60_000;

      scheduler.schedule({ id: 'job-early', fireAtMs: t10m, payload: {} });
      scheduler.schedule({ id: 'job-late', fireAtMs: t25m, payload: {} });
      expect(scheduler.getTelemetry().nextWakeupMs).toBe(t10m);

      // Cancel the earliest job -> timer must re-arm to t25m
      const removed = scheduler.cancel('job-early');
      expect(removed).toBe(true);
      expect(scheduler.cancel('non-existent')).toBe(false);

      const telemetry = scheduler.getTelemetry();
      expect(telemetry.totalPendingJobs).toBe(1);
      expect(telemetry.nextWakeupMs).toBe(t25m);
      expect(telemetry.activeTimers).toBe(1);
    } finally {
      scheduler.clear();
    }
  });

  it('deduplicates notifications across multiple workers using Valkey ZSET atomic ZREM claiming', async () => {
    const baseNow = new Date('2026-10-16T01:00:00.000Z').getTime();
    const fireAt = baseNow + 15 * 60_000;

    // Shared in-memory ZSET store simulating Valkey sorted set across 2 API replicas
    const zsetStore = new Map<string, Map<string, number>>();
    const sharedZSetAdapter: ZSetStoreAdapter = {
      async zadd(key, score, member) {
        let set = zsetStore.get(key);
        if (!set) {
          set = new Map();
          zsetStore.set(key, set);
        }
        set.set(member, score);
        return 1;
      },
      async zrangebyscore(key, _min, max) {
        const set = zsetStore.get(key);
        if (!set) return [];
        const maxNum = Number(max);
        const res: string[] = [];
        for (const [member, score] of set.entries()) {
          if (score <= maxNum) res.push(member);
        }
        return res;
      },
      async zrem(key, member) {
        const set = zsetStore.get(key);
        if (!set || !set.has(member)) return 0;
        set.delete(member);
        return 1;
      },
    };

    const workerADispatched: string[] = [];
    const workerBDispatched: string[] = [];

    const workerA = createNotificationScheduler({
      zsetAdapter: sharedZSetAdapter,
      zsetKey: 'limart:shift:notif:zset',
      nowFn: () => baseNow,
      onDispatch: (job) => {
        workerADispatched.push(job.id);
      },
    });

    const workerB = createNotificationScheduler({
      zsetAdapter: sharedZSetAdapter,
      zsetKey: 'limart:shift:notif:zset',
      nowFn: () => baseNow,
      onDispatch: (job) => {
        workerBDispatched.push(job.id);
      },
    });

    try {
      await workerA.scheduleBatch([
        { id: '2026-10-16:101:SHIFT_START_15M', fireAtMs: fireAt, payload: { shiftId: 101 } },
      ]);
      await workerB.scheduleBatch([
        { id: '2026-10-16:101:SHIFT_START_15M', fireAtMs: fireAt, payload: { shiftId: 101 } },
      ]);

      expect(workerA.getTelemetry().mode).toBe('hybrid-zset-wheel');

      // Both workers wake up at fireAt simultaneously (e.g. Blue-Green deployment overlap)
      const [resA, resB] = await Promise.all([
        workerA.flushDue(fireAt),
        workerB.flushDue(fireAt),
      ]);

      // Exactly ONE worker claims & dispatches; the other records a deduplicatedSkip
      expect(workerADispatched.length + workerBDispatched.length).toBe(1);
      expect(resA.skippedByZSet + resB.skippedByZSet).toBe(1);
      expect(
        workerA.getTelemetry().deduplicatedSkips + workerB.getTelemetry().deduplicatedSkips
      ).toBe(1);
    } finally {
      workerA.clear();
      workerB.clear();
    }
  });
});

