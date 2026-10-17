import { describe, it, expect } from 'vitest';
import { cleanAiOutputForHumans } from '../src/routes/documents.route';

describe('documents.route: cleanAiOutputForHumans', () => {
  it('converts LaTeX symbols into natural unicode', () => {
    const raw = 'Quy định tối thiểu $\\ge 4$ ca/tuần, tỷ lệ phạt $\\times 2$ nếu vắng không phép, $\\le 1$ lần trễ/tháng.';
    const result = cleanAiOutputForHumans(raw);

    expect(result).toContain('≥ 4 ca/tuần');
    expect(result).toContain('× 2');
    expect(result).toContain('≤ 1 lần trễ/tháng');
    expect(result).not.toContain('$');
    expect(result).not.toContain('\\ge');
    expect(result).not.toContain('\\times');
    expect(result).not.toContain('\\le');
  });

  it('removes math delimiters $$...$$ and $...$', () => {
    const raw = 'Công thức: $$ThựcNhận = LươngCơBản + PhụCấp$$';
    const result = cleanAiOutputForHumans(raw);

    expect(result).toBe('Công thức: ThựcNhận = LươngCơBản + PhụCấp');
  });

  it('preserves clean Vietnamese text and friendly emojis', () => {
    const raw = '1️⃣ **Vào Ca (Check-in)**: Bấm nút lớn trên màn hình chính 🦫✨\n2️⃣ **Giải trình**: Gửi yêu cầu qua menu /requests 🍊';
    const result = cleanAiOutputForHumans(raw);

    expect(result).toBe(raw);
  });
});
