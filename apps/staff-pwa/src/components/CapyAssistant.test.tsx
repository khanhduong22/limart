import { describe, it, expect } from 'vitest';
import { cleanAiMarkdown } from './CapyAssistant';

describe('CapyAssistant: Text Formatting & JSON Cleaning', () => {
  it('safely extracts text if given a raw JSON string', () => {
    const rawJson = JSON.stringify({
      success: true,
      reply: 'Chào bạn, đây là thông tin chấm công hợp lệ! 🦫',
    });

    const cleaned = cleanAiMarkdown(rawJson);
    expect(cleaned).toBe('Chào bạn, đây là thông tin chấm công hợp lệ! 🦫');
    expect(cleaned).not.toContain('{"success":true');
  });

  it('safely extracts content if JSON has content property', () => {
    const rawJson = JSON.stringify({
      success: true,
      content: 'Nội dung hướng dẫn giải trình ca làm việc.',
    });

    const cleaned = cleanAiMarkdown(rawJson);
    expect(cleaned).toBe('Nội dung hướng dẫn giải trình ca làm việc.');
  });

  it('converts LaTeX math symbols into clean unicode characters', () => {
    const raw = 'Nhân viên phải đăng ký ca làm $\\ge 4$ ca/tuần và số giờ $\\times 1.5$ khi tăng ca, không được $\\le 2$ ca.';
    const cleaned = cleanAiMarkdown(raw);

    expect(cleaned).toContain('≥ 4 ca/tuần');
    expect(cleaned).toContain('× 1.5');
    expect(cleaned).toContain('≤ 2 ca');
    expect(cleaned).not.toContain('$\\ge');
    expect(cleaned).not.toContain('\\times');
    expect(cleaned).not.toContain('\\le');
    expect(cleaned).not.toContain('$');
  });

  it('removes double dollar signs $$...$$ delimiters', () => {
    const raw = 'Công thức tính: $$Lương = Giờ \\times ĐơnGiá$$';
    const cleaned = cleanAiMarkdown(raw);

    expect(cleaned).toBe('Công thức tính: Lương = Giờ × ĐơnGiá');
    expect(cleaned).not.toContain('$$');
  });
});
