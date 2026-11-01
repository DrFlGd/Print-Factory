/**
 * The geometry: parameters in, parts out. Runs in the module's worker (and in Node for
 * tests). Keep it free of DOM access.
 */
import type { BuildResult, RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';
import { circle, roundedRect } from '@pf/shapes';

export interface Params {
  width: number;
  height: number;
  thickness: number;
  cornerRadius: number;
  hole: boolean;
  holeDiameter: number;
  color: RGB;
}

export function build(ctx: ManifoldContext<Params>): BuildResult {
  const p = ctx.params;
  let outline = ctx.cs([roundedRect(p.width, p.height, p.cornerRadius)]);
  if (p.hole) {
    const r = p.holeDiameter / 2;
    const x = -p.width / 2 + Math.max(r + 2, p.cornerRadius);
    outline = outline.subtract(ctx.cs([circle(r)]).translate([x, 0]));
  }
  const solid = ctx.extrude(outline, p.thickness);
  const part = ctx.part(solid, 'Plate', p.color);
  return { parts: part ? [part] : [] };
}
