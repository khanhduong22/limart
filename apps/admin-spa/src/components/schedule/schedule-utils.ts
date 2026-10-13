import type { CalendarEvent } from './types';

export function stringToColor(str: string): string {
  if (!str) return '#6b7280';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#84cc16',
    '#10b981',
    '#06b6d4',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#d946ef',
    '#f43f5e',
    '#0ea5e9',
    '#14b8a6',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function getEventColor(title: string): { bg: string; text: string } {
  if (!title) return { bg: '#6b7280', text: '#ffffff' };

  const cleanName = title.replace('🔄 Đổi ca: ', '').trim();
  const words = cleanName.toLowerCase().split(/\s+/);
  const firstName = words[words.length - 1];

  if (firstName === 'hân') return { bg: '#fbcfe8', text: '#9d174d' };
  if (firstName === 'hiền') return { bg: '#fef08a', text: '#854d0e' };
  if (firstName === 'hương') return { bg: '#0ea5e9', text: '#ffffff' };
  if (firstName === 'ngân') return { bg: '#e9d5ff', text: '#6b21a8' };
  if (firstName === 'uyên') return { bg: '#ef4444', text: '#ffffff' };
  if (firstName === 'na') return { bg: '#fef08a', text: '#854d0e' };
  if (firstName === 'trang') return { bg: '#a7f3d0', text: '#065f46' };
  if (firstName === 'anh' || cleanName.toLowerCase().includes('quỳnh anh')) {
    return { bg: '#a5f3fc', text: '#0e7490' };
  }

  return { bg: stringToColor(cleanName), text: '#ffffff' };
}

export function eventPropGetter(event: CalendarEvent) {
  const isSwap = !event.isOwner && event.resource?.isOpenForSwap;
  const isSenior = Boolean(event.isSenior || event.resource?.isSenior);
  const colors = isSwap ? { bg: '#8b5cf6', text: '#ffffff' } : getEventColor(event.title);

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
