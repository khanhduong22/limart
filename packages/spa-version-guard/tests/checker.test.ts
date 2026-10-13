import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkAppVersion,
  getClientAppVersion,
  isCooldownActive,
  setReloadTimestamp,
  clearReloadTimestamp,
  clearAppCachesAndServiceWorkers,
  applyAppUpdate,
  viteVersionPlugin,
} from '../src';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Setup environment polyfills for headless/native Bun runtime
if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    visibilityState: 'visible',
  };
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = {};
}

describe('Version Guard - Checker & Anti-Loop Logic', () => {
  const originalFetch = globalThis.fetch;
  const mockClientVersion = '2026.10.10.v1.0.0';
  let mockSessionStorage: MockStorage;
  let mockLocalStorage: MockStorage;

  beforeEach(() => {
    mockSessionStorage = new MockStorage();
    mockLocalStorage = new MockStorage();

    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });

    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockSessionStorage.clear();
    mockLocalStorage.clear();
  });

  describe('getClientAppVersion', () => {
    it('returns provided fallback when no global build ID is defined', () => {
      const version = getClientAppVersion('custom-fallback-1.0');
      expect(version).toBe('custom-fallback-1.0');
    });

    it('returns global __APP_BUILD_ID__ if defined', () => {
      (globalThis as unknown as { __APP_BUILD_ID__?: string }).__APP_BUILD_ID__ = 'build-12345';
      expect(getClientAppVersion()).toBe('build-12345');
      delete (globalThis as unknown as { __APP_BUILD_ID__?: string }).__APP_BUILD_ID__;
    });
  });

  describe('Anti-Loop Cooldown Guard', () => {
    it('isCooldownActive returns false when no reload has occurred', () => {
      expect(isCooldownActive()).toBe(false);
    });

    it('isCooldownActive returns true immediately after setReloadTimestamp', () => {
      setReloadTimestamp();
      expect(isCooldownActive()).toBe(true);
    });

    it('isCooldownActive returns false when timestamp is older than cooldown window', () => {
      const oldTime = Date.now() - 301000; // 5 mins + 1 sec
      sessionStorage.setItem('checkin_spa_version_last_reload_ts', String(oldTime));
      expect(isCooldownActive('checkin_spa_version_', 300000)).toBe(false);
    });

    it('clearReloadTimestamp resets cooldown state', () => {
      setReloadTimestamp();
      expect(isCooldownActive()).toBe(true);
      clearReloadTimestamp();
      expect(isCooldownActive()).toBe(false);
    });

    it('checkAppVersion skips fetch if cooldown is active', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      setReloadTimestamp();

      const result = await checkAppVersion({ currentVersion: mockClientVersion });
      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('cooldown');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Special Skip Guards (Auth & Mock user)', () => {
    it('skips version check when actively logging in', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      sessionStorage.setItem('is_logging_in', 'true');

      const result = await checkAppVersion({ currentVersion: mockClientVersion });
      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('logging_in');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips version check in mock user test environment', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      localStorage.setItem('winter_arc_mock_user', 'true');

      const result = await checkAppVersion({ currentVersion: mockClientVersion });
      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('mock_user');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Visibility Guard', () => {
    it('skips check when document is hidden', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });

      const result = await checkAppVersion({
        currentVersion: mockClientVersion,
        checkOnVisibility: true,
      });

      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('not_visible');
      expect(fetchSpy).not.toHaveBeenCalled();

      // Reset
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
    });

    it('proceeds when document is hidden if checkOnVisibility is false', async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: mockClientVersion }),
      });

      const result = await checkAppVersion({
        currentVersion: mockClientVersion,
        checkOnVisibility: false,
      });

      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('same_version');

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
    });
  });

  describe('Version Comparison & Update Detection', () => {
    it('detects a newer version on the server', async () => {
      const serverVersion = '2026.10.10.v1.0.1';
      const releaseInfo = {
        version: '1.0.1',
        releaseDate: '10/10/2026',
        title: 'Bản Cập Nhật Mới',
        changes: [
          {
            icon: 'rocket',
            badge: 'MỚI',
            title: 'Tăng tốc tải trang',
            description: 'Giảm 40% dung lượng bundle',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: serverVersion,
          release: releaseInfo,
        }),
      });

      const result = await checkAppVersion({
        currentVersion: mockClientVersion,
      });

      expect(result.hasUpdate).toBe(true);
      expect(result.clientVersion).toBe(mockClientVersion);
      expect(result.serverVersion).toBe(serverVersion);
      expect(result.release?.title).toBe('Bản Cập Nhật Mới');
      expect(result.release?.changes).toHaveLength(1);
    });

    it('reports no update when client and server versions match', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: mockClientVersion,
        }),
      });

      const result = await checkAppVersion({
        currentVersion: mockClientVersion,
      });

      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('same_version');
      expect(result.serverVersion).toBe(mockClientVersion);
    });

    it('gracefully handles server 404 / 500 error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await checkAppVersion({
        currentVersion: mockClientVersion,
      });

      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('fetch_error');
    });

    it('gracefully handles network abort / exception', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const result = await checkAppVersion({
        currentVersion: mockClientVersion,
      });

      expect(result.hasUpdate).toBe(false);
      expect(result.skippedReason).toBe('fetch_error');
    });
  });

  describe('Cache Cleaning & Update Application', () => {
    it('clearAppCachesAndServiceWorkers executes without throwing', async () => {
      const mockCachesDelete = vi.fn().mockResolvedValue(true);
      const mockCachesKeys = vi.fn().mockResolvedValue(['cache-v1', 'cache-v2']);

      Object.defineProperty(globalThis, 'caches', {
        value: {
          keys: mockCachesKeys,
          delete: mockCachesDelete,
        },
        configurable: true,
      });

      const mockSwUpdate = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          getRegistrations: vi.fn().mockResolvedValue([{ update: mockSwUpdate }]),
        },
        configurable: true,
      });

      await expect(clearAppCachesAndServiceWorkers()).resolves.toBeUndefined();
      expect(mockCachesKeys).toHaveBeenCalled();
      expect(mockCachesDelete).toHaveBeenCalledWith('cache-v1');
      expect(mockCachesDelete).toHaveBeenCalledWith('cache-v2');
      expect(mockSwUpdate).toHaveBeenCalled();
    });

    it('applyAppUpdate activates cooldown timestamp', async () => {
      expect(isCooldownActive()).toBe(false);

      const customCleanup = vi.fn().mockResolvedValue(undefined);
      await applyAppUpdate({
        reloadDelayMs: 10000, // Large delay so window.location.reload is not reached during test
        customCleanup,
      });

      expect(isCooldownActive()).toBe(true);
      expect(customCleanup).toHaveBeenCalled();
    });
  });

  describe('Vite Version Plugin', () => {
    it('injects __APP_BUILD_ID__ into Vite config', () => {
      const plugin = viteVersionPlugin({
        version: '1.2.3',
        buildId: 'test-build-1.2.3',
      });

      const mockUserConfig: { define?: Record<string, string> } = {};
      // @ts-expect-error test call
      const returnedConfig = plugin.config?.(mockUserConfig, { command: 'build', mode: 'production' });

      expect(returnedConfig?.define?.__APP_BUILD_ID__).toBe(JSON.stringify('test-build-1.2.3'));
    });

    it('emits version.json asset during generateBundle', () => {
      const plugin = viteVersionPlugin({
        version: '1.2.3',
        buildId: 'test-build-1.2.3',
        title: 'Sprint 5 Release',
      });

      const emitFileMock = vi.fn();
      const mockContext = {
        emitFile: emitFileMock,
      };

      // @ts-expect-error test call
      plugin.generateBundle?.call(mockContext, {}, {}, false);

      expect(emitFileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'asset',
          fileName: 'version.json',
        })
      );

      const sourceString = emitFileMock.mock.calls[0][0].source;
      const parsed = JSON.parse(sourceString);
      expect(parsed.version).toBe('test-build-1.2.3');
      expect(parsed.release.title).toBe('Sprint 5 Release');
    });
  });
});
