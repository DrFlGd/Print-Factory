// A die is the intersection of tangent planes. The D10 uses the dual of a
// pentagonal antiprism, giving ten kite faces rather than triangular faces.
export type Vec = [number, number, number];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const phi = (1 + Math.sqrt(5)) / 2;

export function normals(die: string): Vec[] {
  const raw: Vec[] = [];
  if (die === 'd10') {
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      raw.push([Math.cos(angle), Math.sin(angle), i % 2 ? -0.6 : 0.6]);
    }
  } else {
    if (['d4', 'd8', 'd20'].includes(die)) {
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            if (die !== 'd4' || x * y * z === 1) raw.push([x, y, z]);
          }
    }
    const cyclic = (x: number, y: number, z: number) => raw.push([x, y, z], [z, x, y], [y, z, x]);
    for (const s of [-1, 1]) {
      if (die === 'd6') cyclic(0, 0, s);
      for (const t of [-1, 1]) {
        if (die === 'd12') cyclic(0, s, t * phi);
        if (die === 'd20') cyclic(0, s / phi, t * phi);
      }
    }
  }
  // Express normals in a frame with face one flat on the print bed.
  const [x, y, z] = raw[0]!;
  const az = Math.atan2(y, x);
  const tilt = Math.atan2(Math.hypot(x, y), z) - Math.PI;
  return raw.map(([a, b, c]) => {
    const h = a * Math.cos(az) + b * Math.sin(az);
    const len = Math.hypot(a, b, c);
    return [
      (h * Math.cos(tilt) - c * Math.sin(tilt)) / len,
      (-a * Math.sin(az) + b * Math.cos(az)) / len,
      (h * Math.sin(tilt) + c * Math.cos(tilt)) / len,
    ];
  });
}
