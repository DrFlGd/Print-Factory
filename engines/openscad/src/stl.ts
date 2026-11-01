/** Binary STL from OpenSCAD into an indexed mesh, with shared corners welded. */
export function parseStl(bytes: Uint8Array): { positions: Float32Array; indices: Uint32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 84) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const count = view.getUint32(80, true);
  if (84 + count * 50 > bytes.byteLength) throw new Error('The STL is cut short.');
  const positions: number[] = [];
  const indices = new Uint32Array(count * 3);
  const seen = new Map<string, number>();
  for (let t = 0; t < count; t++) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 3; k++) {
      const x = view.getFloat32(o + k * 12, true);
      const y = view.getFloat32(o + k * 12 + 4, true);
      const z = view.getFloat32(o + k * 12 + 8, true);
      const key = `${x},${y},${z}`;
      let i = seen.get(key);
      if (i === undefined) {
        i = positions.length / 3;
        seen.set(key, i);
        positions.push(x, y, z);
      }
      indices[t * 3 + k] = i;
    }
  }
  return { positions: new Float32Array(positions), indices };
}

/** Turns about Z, then moves, in place. */
export function place(positions: Float32Array, rotateDeg = 0, offset: readonly [number, number, number] = [0, 0, 0]): void {
  const a = (rotateDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    positions[i] = c * x - s * y + offset[0];
    positions[i + 1] = s * x + c * y + offset[1];
    positions[i + 2] = positions[i + 2]! + offset[2];
  }
}
