import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Part } from '@pf/core';
import { buildDXF, buildOBJ, buildSTL, buildSVG, buildThreeMF, palette, read3MF, readModel, readOBJ, readSTL } from '../src';

function cube(name: string, color: [number, number, number], x = 0, group?: string): Part {
  const s = 10;
  const p = new Float32Array([0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s]);
  for (let i = 0; i < p.length; i += 3) p[i] = p[i]! + x;
  const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const part: Part = { name, positions: p, indices: new Uint32Array(f), color };
  if (group) part.group = group;
  return part;
}

describe('3mf', () => {
  const parts = [cube('Body', [0, 0, 0], 0, 'a'), cube('Text', [255, 255, 255], 20, 'a'), cube('Lid', [0, 0, 0], 40, 'b'), { ...cube('Ghost', [9, 9, 9], 60), role: 'reference' as const }];

  it('numbers filaments by first-seen colour and skips reference parts', () => {
    expect(palette(parts)).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
  });

  it('writes the model, Bambu, Prusa and colour assignments that agree', () => {
    const files = unzipSync(buildThreeMF(parts, { title: 'Test <&>', generator: 'test@1.0.0' }));
    const model = strFromU8(files['3D/3dmodel.model']!);
    expect(model).toContain('BambuStudio:3mfVersion');
    expect(model).toContain('Test &lt;&amp;&gt;');
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(model).not.toContain('Ghost');
    const bambu = strFromU8(files['Metadata/model_settings.config']!);
    expect(bambu.match(/key="extruder" value="2"/g)).toHaveLength(1);
    const prusa = strFromU8(files['Metadata/Slic3r_PE_model.config']!);
    expect(prusa).toContain('firstid="12" lastid="23"');
    const proj = JSON.parse(strFromU8(files['Metadata/project_settings.config']!));
    expect(proj.filament_colour).toEqual(['#000000', '#FFFFFF']);
  });

  it('round-trips through the reader, centred on the plate', () => {
    const back = read3MF(buildThreeMF(parts, { title: 't', plate: [200, 200] }));
    expect(back).toHaveLength(3);
    const xs = back.flatMap((m) => [...m.positions].filter((_, i) => i % 3 === 0));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(100);
  });

  it('refuses an empty export', () => {
    expect(() => buildThreeMF([parts[3]!], { title: 'x' })).toThrow(/Nothing to export/);
  });
});

describe('stl and obj', () => {
  it('round-trips binary STL and welds vertices', () => {
    const m = readSTL(buildSTL([cube('a', [0, 0, 0])]));
    expect(m.indices.length).toBe(36);
    expect(m.positions.length).toBe(24);
  });
  it('reads ascii STL', () => {
    const ascii = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid';
    expect(readModel('x.stl', new TextEncoder().encode(ascii))[0]!.indices.length).toBe(3);
  });
  it('writes OBJ with materials and reads it back', () => {
    const { obj, mtl } = buildOBJ([cube('a', [255, 0, 0]), cube('b', [0, 255, 0], 20)]);
    expect(mtl).toContain('Kd 1.0000 0.0000 0.0000');
    expect(readOBJ(obj).indices.length).toBe(72);
  });
});

describe('drawings', () => {
  const d = {
    layers: [
      { name: 'Outline', operation: 'cut' as const, color: [255, 0, 0] as [number, number, number], contours: [[0, 0, 50, 0, 50, 20, 0, 20]] },
      { name: 'Name', operation: 'engrave' as const, color: [0, 0, 0] as [number, number, number], contours: [[5, 5, 10, 5, 10, 10]] },
    ],
  };
  it('writes millimetre SVG with one group per operation, Y down', () => {
    const svg = buildSVG(d, { margin: 0 });
    expect(svg).toContain('width="50mm" height="20mm"');
    expect(svg).toContain('id="cut-outline"');
    expect(svg).toContain('fill="#000000" fill-rule="evenodd"');
    expect(svg).toContain('M0 20L50 20L50 0L0 0Z');
  });
  it('writes DXF polylines per layer', () => {
    const dxf = buildDXF(d);
    expect(dxf.match(/POLYLINE/g)).toHaveLength(2);
    expect(dxf).toContain('Outline');
  });
});
