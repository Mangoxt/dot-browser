import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ nativeImage: {} }));
import { captureBounds } from '../src/main/page-capture';

describe('capture resource bounds', () => {
  it('accepts ordinary tall documents and rounds fractional layout pixels', () => {
    expect(captureBounds(1200, 2400)).toEqual({ width: 1200, height: 2400 });
    expect(captureBounds(700.4, 600.1)).toEqual({ width: 701, height: 601 });
  });
  it('rejects nonfinite, zero and negative sizes before attempting capture', () => {
    for (const [width, height] of [
      [NaN, 600],
      [700, Infinity],
      [0, 600],
      [700, -1],
    ])
      expect(() => captureBounds(width, height)).toThrow(/too large/);
  });
  it('bounds both individual dimensions and total image pixels', () => {
    for (const [width, height] of [
      [16001, 100],
      [700, 24001],
      [8000, 8000],
      [2000, 20000.01],
    ])
      expect(() => captureBounds(width, height)).toThrow(/too large/);
  });
});
