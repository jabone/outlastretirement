// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleMemo } from '../../utils/idle';

describe('useIdleMemo', () => {
  it('computes off the render path, once per set of deps', async () => {
    vi.useFakeTimers();
    try {
      const compute = vi.fn((x) => x * 2);
      const { result, rerender } = renderHook(({ x }) => useIdleMemo(() => compute(x), [x]), { initialProps: { x: 1 } });
      expect(result.current).toBe(null);
      expect(compute).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(50); });
      expect(result.current).toBe(2);
      rerender({ x: 1 });
      await act(async () => { vi.advanceTimersByTime(50); });
      expect(compute).toHaveBeenCalledTimes(1);
      // Several changes before idle: only the last is computed.
      rerender({ x: 2 });
      rerender({ x: 3 });
      await act(async () => { vi.advanceTimersByTime(50); });
      expect(result.current).toBe(6);
      expect(compute).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('immediate computes without waiting for idle', async () => {
    const { result } = renderHook(() => useIdleMemo(() => 'now', [1], { immediate: true }));
    expect(result.current).toBe('now');
  });
});
