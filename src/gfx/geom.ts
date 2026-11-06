// gfx/geom.ts: low-level geometry helpers: flat-shaded, vertex-coloured boxes merged into one BufferGeometry.
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmp = new Color();

/** Axis-aligned box from min/max corners (world axes), with a uniform vertex colour. Non-indexed. */
export function colorBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): BufferGeometry {
  const g = new BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0)).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.deleteAttribute('uv');
  tmp.setHex(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** Merge a list of compatible geometries (disposes the inputs). Returns null for an empty list. */
export function mergeAll(parts: BufferGeometry[]): BufferGeometry | null {
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
