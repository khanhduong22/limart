import { describe, it, expect, beforeEach } from 'vitest';
import { useScheduleStore } from '../../apps/admin-spa/src/stores/useScheduleStore';
import { getEventColor, stringToColor } from '../../apps/admin-spa/src/components/schedule/schedule-utils';
import type { CalendarEvent } from '../../apps/admin-spa/src/components/schedule/types';

describe('useScheduleStore & Schedule Utils', () => {
  beforeEach(() => {
    useScheduleStore.getState().reset();
  });

  describe('useScheduleStore UI Filters', () => {
    it('initializes with default values', () => {
      const state = useScheduleStore.getState();
      expect(state.hideFullTime).toBe(true);
      expect(state.showAllShifts).toBe(false);
      expect(state.showDutyDetails).toBe(false);
      expect(state.dutySheetOpen).toBe(false);
      expect(state.modalOpen).toBe(false);
      expect(state.actionModalOpen).toBe(false);
      expect(state.pendingEvent).toBeNull();
      expect(state.selectedEvent).toBeNull();
    });

    it('toggles filter switches correctly with boolean and updater function', () => {
      const { setHideFullTime, setShowAllShifts, setShowDutyDetails } = useScheduleStore.getState();

      setHideFullTime(false);
      expect(useScheduleStore.getState().hideFullTime).toBe(false);
      setHideFullTime((prev) => !prev);
      expect(useScheduleStore.getState().hideFullTime).toBe(true);

      setShowAllShifts(true);
      expect(useScheduleStore.getState().showAllShifts).toBe(true);
      setShowAllShifts((prev) => !prev);
      expect(useScheduleStore.getState().showAllShifts).toBe(false);

      setShowDutyDetails(true);
      expect(useScheduleStore.getState().showDutyDetails).toBe(true);
      setShowDutyDetails((prev) => !prev);
      expect(useScheduleStore.getState().showDutyDetails).toBe(false);
    });

    it('handles openCreateModal and closeCreateModal cleanly', () => {
      const { openCreateModal, closeCreateModal } = useScheduleStore.getState();
      const start = new Date('2026-10-12T08:00:00Z');
      const end = new Date('2026-10-12T12:00:00Z');

      openCreateModal({ start, end }, 'user-456');

      let state = useScheduleStore.getState();
      expect(state.modalOpen).toBe(true);
      expect(state.pendingEvent).toEqual({ start, end });
      expect(state.targetUserId).toBe('user-456');
      expect(state.isSeniorRegister).toBe(false);

      closeCreateModal();
      state = useScheduleStore.getState();
      expect(state.modalOpen).toBe(false);
      expect(state.pendingEvent).toBeNull();
      expect(state.targetUserId).toBe('');
    });

    it('handles openActionModal and closeActionModal cleanly', () => {
      const { openActionModal, closeActionModal } = useScheduleStore.getState();
      const mockEvent: CalendarEvent = {
        id: 99,
        title: 'Thảo',
        start: new Date('2026-10-12T08:00:00Z'),
        end: new Date('2026-10-12T12:00:00Z'),
        isOwner: true,
      };

      openActionModal(mockEvent, true);

      let state = useScheduleStore.getState();
      expect(state.actionModalOpen).toBe(true);
      expect(state.selectedEvent?.id).toBe(99);
      expect(state.showAddShiftTask).toBe(true);

      closeActionModal();
      state = useScheduleStore.getState();
      expect(state.actionModalOpen).toBe(false);
      expect(state.selectedEvent).toBeNull();
      expect(state.showAddShiftTask).toBe(false);
    });
  });

  describe('Schedule Utils & Color Mapping', () => {
    it('returns consistent hash color for names', () => {
      const color1 = stringToColor('Trực ca sáng');
      const color2 = stringToColor('Trực ca sáng');
      expect(color1).toBe(color2);
      expect(color1).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('provides specialized palette for known employee first names', () => {
      const han = getEventColor('Nguyễn Ngọc Hân');
      expect(han.bg).toBe('#fbcfe8');

      const hien = getEventColor('Phạm Thu Hiền');
      expect(hien.bg).toBe('#fef08a');

      const huong = getEventColor('Lê Thu Hương');
      expect(huong.bg).toBe('#0ea5e9');

      const quynhAnh = getEventColor('Đặng Quỳnh Anh');
      expect(quynhAnh.bg).toBe('#a5f3fc');
    });

    it('handles empty titles gracefully', () => {
      const empty = getEventColor('');
      expect(empty.bg).toBe('#6b7280');
      expect(empty.text).toBe('#ffffff');
    });
  });
});
