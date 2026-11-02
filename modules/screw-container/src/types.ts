import type { RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export type Shape = 'round' | 'hexagon' | 'octagon' | 'square';

export interface Params {
  product: 'jar' | 'stack';
  tiers: number;

  // The body.
  shape: Shape;
  diameter: number;
  height: number;
  corner: number;
  wall: number;
  floor: number;
  mouth: 'wide' | 'narrow';
  neckDiameter: number;
  dividers: '0' | '2' | '3' | '4' | '6';

  // The thread.
  pitch: 'fine' | 'standard' | 'coarse';
  starts: '1' | '2' | '3';
  threadHeight: number;
  fit: 'tight' | 'standard' | 'loose';

  // The lid.
  lidHeight: number;
  lidTop: number;
  grip: 'smooth' | 'knurled' | 'ribs';
  label: string;
  font: string;
  textSize: number;
  loop: boolean;

  detail: 'draft' | 'standard' | 'fine';
  bodyColor: RGB;
  lidColor: RGB;
}

export type Ctx = ManifoldContext<Params>;
