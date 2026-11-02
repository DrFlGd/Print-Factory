import type { RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export type Form = 'flat' | 'arc' | 'cylinder' | 'cone' | 'globe' | 'cube';

export interface Params {
  form: Form;

  // Size.
  width: number;
  height: number;
  arcAngle: number;
  diameter: number;
  topDiameter: number;
  side: number;

  // A flat panel's shape and frame.
  outline: 'rect' | 'rounded' | 'oval' | 'heart' | 'arch' | 'hexagon' | 'cloud';
  frame: number;
  frameThickness: number;
  // A lamp's solid bands at the top and bottom.
  rim: number;

  // The picture.
  fit: 'fill' | 'fit';
  zoom: number;
  shiftX: number;
  shiftY: number;
  turn: '0' | '90' | '180' | '270';
  mirror: boolean;

  // Tone.
  minThickness: number;
  maxThickness: number;
  mapping: 'natural' | 'linear';
  brightness: number;
  contrast: number;
  midtones: number;
  negative: boolean;
  relief: 'front' | 'back';
  detail: 'draft' | 'standard' | 'fine';

  // Standing, hanging, lighting.
  stand: 'none' | 'feet' | 'base' | 'hole';
  holeDia: number;
  baseLight: 'none' | 'strip' | 'tealight';
  lampBase: 'none' | 'tealight' | 'puck';
  puckDia: number;
  fitting: 'none' | 'e14' | 'e27' | 'custom';
  fittingHole: number;
  opening: number;
  vent: number;
  printLying: boolean;

  lithoColor: RGB;
  baseColor: RGB;
}

export type Ctx = ManifoldContext<Params>;
