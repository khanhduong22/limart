import type { CalendarEvent } from './types';

export const KNOWN_STAFF_COLORS: Record<string, { bg: string; text: string }> = {
  'uyên': { bg: '#ef4444', text: '#ffffff' }, // Đỏ tươi
  'ngân': { bg: '#e9d5ff', text: '#6b21a8' }, // Tím Lavender nhạt
  'hương': { bg: '#0ea5e9', text: '#ffffff' }, // Xanh dương đậm
  'quỳnh anh': { bg: '#a5f3fc', text: '#0e7490' }, // Xanh ngọc băng / Ice Cyan
  'trang': { bg: '#a7f3d0', text: '#065f46' }, // Xanh bạc hà / Mint
  'phượng': { bg: '#f97316', text: '#ffffff' }, // Cam đậm
  'phương anh': { bg: '#f9a8d4', text: '#831843' }, // Hồng sen / Rose Pink
  'vy': { bg: '#fde047', text: '#713f12' }, // Vàng chanh / Warm Gold
  'hân': { bg: '#f0abfc', text: '#701a75' }, // Tím hoa cà
  'hiền': { bg: '#bef264', text: '#365314' }, // Xanh lá mạ
  'na': { bg: '#fed7aa', text: '#7c2d12' }, // Cam đào ấm
};

export const DISTINCT_NEW_STAFF_PALETTE: Array<{ bg: string; text: string }> = [
  { bg: '#6366f1', text: '#ffffff' }, // Indigo
  { bg: '#10b981', text: '#ffffff' }, // Emerald
  { bg: '#d97706', text: '#ffffff' }, // Amber đậm
  { bg: '#ec4899', text: '#ffffff' }, // Pink
  { bg: '#14b8a6', text: '#ffffff' }, // Teal
  { bg: '#1d4ed8', text: '#ffffff' }, // Navy blue
  { bg: '#be123c', text: '#ffffff' }, // Crimson
  { bg: '#475569', text: '#ffffff' }, // Slate
  { bg: '#7c3aed', text: '#ffffff' }, // Purple
  { bg: '#0284c7', text: '#ffffff' }, // Sky blue
  { bg: '#15803d', text: '#ffffff' }, // Forest green
  { bg: '#b45309', text: '#ffffff' }, // Warm amber
  { bg: '#9333ea', text: '#ffffff' }, // Royal purple
  { bg: '#4338ca', text: '#ffffff' }, // Deep indigo
  { bg: '#0f766e', text: '#ffffff' }, // Dark teal
  { bg: '#c026d3', text: '#ffffff' }, // Fuchsia
  { bg: '#374151', text: '#ffffff' }, // Charcoal
  { bg: '#4d7c0f', text: '#ffffff' }, // Olive
  { bg: '#9a3412', text: '#ffffff' }, // Rust orange
  { bg: '#0369a1', text: '#ffffff' }, // Ocean blue
  { bg: '#854d0e', text: '#ffffff' }, // Bronze brown
  { bg: '#a21caf', text: '#ffffff' }, // Magenta
  { bg: '#166534', text: '#ffffff' }, // Pine green
  { bg: '#9f1239', text: '#ffffff' }, // Wine red
  { bg: '#1e40af', text: '#ffffff' }, // Blue 800
];

export const assignedColorMap = new Map<string, { bg: string; text: string }>();
export const usedBgColors = new Set<string>();

export function resetColorStore() {
  assignedColorMap.clear();
  usedBgColors.clear();
  usedBgColors.add('#8b5cf6'); // Swap shift reservation
  usedBgColors.add('#6b7280'); // Fallback reservation
  for (const col of Object.values(KNOWN_STAFF_COLORS)) {
    usedBgColors.add(col.bg.toLowerCase());
  }
}

// Initial initialization
resetColorStore();

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toLowerCase();
}

export function generateGoldenAngleColor(step: number): { bg: string; text: string } {
  const hue = Math.round((step * 137.508) % 360);
  const bg = hslToHex(hue, 70, 38);
  return { bg, text: '#ffffff' };
}

export function assignNextDistinctColor(key: string): { bg: string; text: string } {
  const normKey = key.trim().toLowerCase();
  if (assignedColorMap.has(normKey)) {
    return assignedColorMap.get(normKey)!;
  }

  // 1. Pick first unused color from DISTINCT_NEW_STAFF_PALETTE
  for (const color of DISTINCT_NEW_STAFF_PALETTE) {
    if (!usedBgColors.has(color.bg.toLowerCase())) {
      usedBgColors.add(color.bg.toLowerCase());
      assignedColorMap.set(normKey, color);
      return color;
    }
  }

  // 2. Fallback: Golden angle generator for extra capacity (>30 staff)
  let step = 0;
  while (step < 500) {
    const candidate = generateGoldenAngleColor(step);
    if (!usedBgColors.has(candidate.bg.toLowerCase())) {
      usedBgColors.add(candidate.bg.toLowerCase());
      assignedColorMap.set(normKey, candidate);
      return candidate;
    }
    step++;
  }

  const fallback = { bg: '#64748b', text: '#ffffff' };
  assignedColorMap.set(normKey, fallback);
  return fallback;
}

export function stripVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function getEventColor(title: string, userId?: string): { bg: string; text: string } {
  if (!title && !userId) return { bg: '#6b7280', text: '#ffffff' };

  const rawClean = (title || '').replace(/^🔄\s*đổi\s*ca:\s*/i, '').trim();
  const cleanName = rawClean.toLowerCase();
  const unaccented = stripVietnameseAccents(cleanName);

  if (userId && assignedColorMap.has(`user:${userId}`)) {
    return assignedColorMap.get(`user:${userId}`)!;
  }
  if (cleanName && assignedColorMap.has(`name:${cleanName}`)) {
    return assignedColorMap.get(`name:${cleanName}`)!;
  }

  // 1. Phương Anh (matches "Phương Anh", "Phuong Anh", "Nguyễn Phương Anh")
  if (cleanName.includes('phương anh') || unaccented.includes('phuong anh')) {
    const col = KNOWN_STAFF_COLORS['phương anh'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  // 2. Quỳnh Anh (matches "Quỳnh Anh", "Quynh Anh", "Đỗ Quỳnh Anh", or standalone "Anh")
  if (
    cleanName.includes('quỳnh anh') ||
    unaccented.includes('quynh anh') ||
    cleanName === 'anh'
  ) {
    const col = KNOWN_STAFF_COLORS['quỳnh anh'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  // 3. Vy (Original staff "Vy", "Bé Vy", but NOT distinct compound staff like "Thảo Vy", "Lan Vy", "Bảo Vy")
  const words = cleanName.split(/\s+/);
  const lastWord = words[words.length - 1];

  if (
    cleanName === 'vy' ||
    unaccented === 'vy' ||
    (words.length === 2 && (words[0] === 'bé' || words[0] === 'chị' || words[0] === 'em') && lastWord === 'vy')
  ) {
    const col = KNOWN_STAFF_COLORS['vy'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  // 4. Other known staff
  if (
    (cleanName.includes('phượng') || unaccented.includes('phuong')) &&
    !cleanName.includes('phương anh') &&
    !unaccented.includes('phuong anh')
  ) {
    const col = KNOWN_STAFF_COLORS['phượng'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (cleanName.includes('uyên') || unaccented.includes('uyen')) {
    const col = KNOWN_STAFF_COLORS['uyên'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (cleanName.includes('ngân') || unaccented.includes('ngan') || cleanName.includes('bảo mỹ')) {
    const col = KNOWN_STAFF_COLORS['ngân'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (cleanName.includes('hương') || unaccented.includes('huong')) {
    const col = KNOWN_STAFF_COLORS['hương'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (cleanName.includes('trang') || unaccented.includes('trang')) {
    const col = KNOWN_STAFF_COLORS['trang'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (
    cleanName === 'hân' ||
    unaccented === 'han' ||
    (words.length <= 2 && lastWord === 'hân' && !cleanName.includes('bảo hân'))
  ) {
    const col = KNOWN_STAFF_COLORS['hân'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (cleanName === 'hiền' || unaccented === 'hien' || lastWord === 'hiền') {
    const col = KNOWN_STAFF_COLORS['hiền'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  if (cleanName === 'na' || cleanName.includes('chị na')) {
    const col = KNOWN_STAFF_COLORS['na'];
    if (userId) assignedColorMap.set(`user:${userId}`, col);
    if (cleanName) assignedColorMap.set(`name:${cleanName}`, col);
    return col;
  }

  // 5. Unmapped / new staff (e.g. "Thảo Vy", "Minh Anh", "Bảo Anh", "Lan Anh"):
  const userKey = userId ? `user:${userId}` : `name:${cleanName}`;
  const assigned = assignNextDistinctColor(userKey);
  if (userId && cleanName) {
    assignedColorMap.set(`name:${cleanName}`, assigned);
  }
  return assigned;
}

export function syncStaffColors(users: any[] = [], events: any[] = []) {
  const sortedUsers = [...users].sort((a, b) => {
    const keyA = a.id || a._id || a.email || a.name || '';
    const keyB = b.id || b._id || b.email || b.name || '';
    return keyA.localeCompare(keyB);
  });

  for (const u of sortedUsers) {
    const uName = u.name || u.displayName || '';
    const uId = u.id || u._id;
    if (uName || uId) {
      getEventColor(uName, uId);
    }
  }

  for (const e of events) {
    const title = e.title || e.user?.name || '';
    const userId = e.userId || e.user?.id || e.resource?.userId;
    if (title || userId) {
      getEventColor(title, userId);
    }
  }
}

export function stringToColor(str: string): string {
  return getEventColor(str).bg;
}

export function eventPropGetter(event: CalendarEvent) {
  const isSwap = !event.isOwner && event.resource?.isOpenForSwap;
  const isSenior = Boolean(event.isSenior || event.resource?.isSenior);
  const colors = isSwap
    ? { bg: '#8b5cf6', text: '#ffffff' }
    : getEventColor(event.title, event.resource?.userId);

  let border = event.isOwner ? '2px solid white' : '0px';
  let boxShadow = event.isOwner
    ? '0 0 0 2px #000'
    : isSwap
    ? '0 0 0 2px #8b5cf6'
    : 'none';

  if (isSenior) {
    border = '2px solid #fde047';
    boxShadow = '0 0 0 2px #d97706, 0 2px 6px rgba(217, 119, 6, 0.35)';
  }

  return {
    style: {
      backgroundColor: colors.bg,
      opacity: 0.95,
      color: colors.text,
      border,
      display: 'block',
      fontSize: '0.75rem',
      boxShadow,
      padding: '2px 4px',
    },
  };
}

export function slotPropGetter(date: Date) {
  const hour = date.getHours();
  if (hour >= 8 && hour < 17) {
    return {
      style: { backgroundColor: '#fafafa' },
    };
  }
  return {};
}
