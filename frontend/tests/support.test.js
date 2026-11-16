import { describe, it, expect } from 'vitest';
import { supportLinks, safeSupportUrl } from '../src/config/support.js';

describe('Enlaces para apoyar el proyecto', () => {
  it('sólo acepta https de cada plataforma', () => {
    expect(safeSupportUrl('https://ko-fi.com/enyeon', ['ko-fi.com'])).toBe('https://ko-fi.com/enyeon');
    expect(safeSupportUrl('http://ko-fi.com/enyeon', ['ko-fi.com'])).toBeNull();
    expect(safeSupportUrl('javascript:alert(1)', ['ko-fi.com'])).toBeNull();
    expect(safeSupportUrl('https://ko-fi.com.evil.io/x', ['ko-fi.com'])).toBeNull();
    expect(safeSupportUrl('https://user:pw@ko-fi.com/x', ['ko-fi.com'])).toBeNull();
  });
  it('el Ko-fi del autor viene puesto', () => {
    expect(supportLinks()[0]).toMatchObject({ id: 'kofi', url: 'https://ko-fi.com/Y8Y51PN6IF' });
  });
  it('sin configurar no hay nada; Ko-fi va primero', () => {
    expect(supportLinks({})).toEqual([]);
    const l = supportLinks({ VITE_CAFECITO_URL: 'https://cafecito.app/enyeon', VITE_KOFI_URL: 'https://ko-fi.com/enyeon' });
    expect(l.map((x) => x.id)).toEqual(['kofi', 'cafecito']);
  });
});
