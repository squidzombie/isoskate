// platform/compat.ts: boot checks (TECH §10.8). Missing WebGL2, structuredClone or AudioContext → a friendly card.
export function checkCompat(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  try {
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2')) missing.push('WebGL2');
  } catch { missing.push('WebGL2'); }
  if (typeof structuredClone !== 'function') missing.push('structuredClone');
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  if (!w.AudioContext && !w.webkitAudioContext) missing.push('AudioContext');
  return { ok: missing.length === 0, missing };
}

export const supportsInert = () => typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
