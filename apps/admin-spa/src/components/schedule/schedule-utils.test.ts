import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEventColor,
  syncStaffColors,
  resetColorStore,
  KNOWN_STAFF_COLORS,
  DISTINCT_NEW_STAFF_PALETTE,
} from './schedule-utils';

describe('schedule-utils: Staff Color System', () => {
  beforeEach(() => {
    resetColorStore();
  });

  it('assigns 100% unique, non-colliding background colors to all existing staff', () => {
    const existingStaff = [
      'Quỳnh Anh',
      'Phương Anh',
      'Vy',
      'Uyên',
      'Ngân',
      'Hương',
      'Trang',
      'Phượng',
      'Hân',
      'Hiền',
      'Na',
    ];

    const colors = existingStaff.map((name) => ({
      name,
      ...getEventColor(name),
    }));

    // Verify Phương Anh gets rose pink (#f9a8d4)
    const phuongAnh = colors.find((c) => c.name === 'Phương Anh')!;
    expect(phuongAnh.bg.toLowerCase()).toBe('#f9a8d4');
    expect(phuongAnh.text.toLowerCase()).toBe('#831843');

    // Verify Quỳnh Anh gets ice cyan (#a5f3fc)
    const quynhAnh = colors.find((c) => c.name === 'Quỳnh Anh')!;
    expect(quynhAnh.bg.toLowerCase()).toBe('#a5f3fc');
    expect(quynhAnh.text.toLowerCase()).toBe('#0e7490');

    // Verify Phương Anh and Quỳnh Anh have completely distinct colors
    expect(phuongAnh.bg).not.toBe(quynhAnh.bg);

    // Verify Vy gets warm gold/lemon (#fde047)
    const vy = colors.find((c) => c.name === 'Vy')!;
    expect(vy.bg.toLowerCase()).toBe('#fde047');
    expect(vy.text.toLowerCase()).toBe('#713f12');

    // Verify every existing staff has a 100% unique bg color
    const bgList = colors.map((c) => c.bg.toLowerCase());
    const uniqueBgs = new Set(bgList);
    expect(uniqueBgs.size).toBe(existingStaff.length);
  });

  it('assigns unique colors to 15+ new staff members without colliding with existing staff or each other', () => {
    // First register all existing staff
    const existingStaff = [
      'Quỳnh Anh',
      'Phương Anh',
      'Vy',
      'Uyên',
      'Ngân',
      'Hương',
      'Trang',
      'Phượng',
    ];
    const existingColors = new Set(
      existingStaff.map((name) => getEventColor(name).bg.toLowerCase())
    );

    // 15 new employees (including compound names with Anh and Vy)
    const newStaff = [
      'Minh Anh',
      'Bảo Anh',
      'Lan Anh',
      'Thảo Vy',
      'Bảo Vy',
      'Khánh Linh',
      'Thanh Trúc',
      'Hoàng Nam',
      'Minh Khôi',
      'Tấn Phát',
      'Ngọc Hà',
      'Kim Oanh',
      'Diễm My',
      'Anh Thư',
      'Quốc Bảo',
    ];

    const newStaffColors = newStaff.map((name, idx) => ({
      name,
      ...getEventColor(name, `user_new_${idx}`),
    }));

    // Verify Thảo Vy does NOT receive Vy's gold (#fde047)
    const thaoVy = newStaffColors.find((c) => c.name === 'Thảo Vy')!;
    expect(thaoVy.bg.toLowerCase()).not.toBe('#fde047');

    // Verify Minh Anh, Bảo Anh, Lan Anh do NOT receive Quỳnh Anh or Phương Anh's color
    for (const anhName of ['Minh Anh', 'Bảo Anh', 'Lan Anh']) {
      const match = newStaffColors.find((c) => c.name === anhName)!;
      expect(match.bg.toLowerCase()).not.toBe('#a5f3fc');
      expect(match.bg.toLowerCase()).not.toBe('#f9a8d4');
    }

    // Verify none of the new staff collide with any existing staff color
    for (const staff of newStaffColors) {
      expect(existingColors.has(staff.bg.toLowerCase())).toBe(false);
    }

    // Verify all 15 new staff have 100% unique colors from each other
    const newBgList = newStaffColors.map((c) => c.bg.toLowerCase());
    const uniqueNewBgs = new Set(newBgList);
    expect(uniqueNewBgs.size).toBe(newStaff.length);
  });

  it('syncStaffColors deterministically pre-registers colors for users and events', () => {
    const mockUsers = [
      { id: 'u1', name: 'Nguyễn Phương Anh' },
      { id: 'u2', name: 'Đỗ Quỳnh Anh' },
      { id: 'u3', name: 'Trần Thảo Vy' },
      { id: 'u4', name: 'Lê Minh Anh' },
    ];

    const mockEvents = [
      { title: '🔄 Đổi ca: Nguyễn Phương Anh', userId: 'u1' },
      { title: 'Trần Thảo Vy', userId: 'u3' },
    ];

    syncStaffColors(mockUsers, mockEvents);

    const paColor = getEventColor('Nguyễn Phương Anh', 'u1');
    expect(paColor.bg.toLowerCase()).toBe('#f9a8d4');

    const qaColor = getEventColor('Đỗ Quỳnh Anh', 'u2');
    expect(qaColor.bg.toLowerCase()).toBe('#a5f3fc');

    const tvColor = getEventColor('Trần Thảo Vy', 'u3');
    expect(tvColor.bg.toLowerCase()).not.toBe('#fde047'); // Not Vy's gold
    expect(tvColor.bg.toLowerCase()).not.toBe('#f9a8d4'); // Not Phương Anh
    expect(tvColor.bg.toLowerCase()).not.toBe('#a5f3fc'); // Not Quỳnh Anh
  });
});
