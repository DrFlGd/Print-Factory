import type { RGB } from '@pf/core';
import type { Contour } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export interface Params {
  product: 'cutter' | 'stencil' | 'roller';
  cutterType: 'imprint' | 'only';
  wall: number;
  previewDough: boolean;
  source: 'ready' | 'text' | 'svg' | 'picture';
  shapeId: string;
  shapeText: string;
  shapeFont: string;
  size: number;
  aspect: number;
  rotation: number;
  corner: number;
  mirror: boolean;
  polish: boolean;
  digits: boolean;
  letterHeight: number;
  printerBed: number;
  stampText: string;
  stampFont: string;
  imprintInset: number;
  edgesOnly: boolean;
  designBase: number;
  designEdge: 'flat' | 'dome' | 'round' | 'chamfer';
  invert: boolean;
  layout: 'one' | 'grid' | 'mirror';
  gridCols: number;
  gridRows: number;
  gridGap: number;
  separateParts: boolean;
  practiceCookie: boolean;
  nameplate: boolean;
  height: number;
  thinEdge: boolean;
  rimWidth: number;
  rimThickness: number;
  sealer: boolean;
  handles: 'none' | 'round' | 'rect';
  stiffeners: number;
  stencilThickness: number;
  stencilBorder: number;
  stencilBridge: number;
  rollerDiameter: number;
  rollerLength: number;
  rollerDepth: number;
  rollerRepeat: number;
  rollerRows: number;
  rollerHandle: 'none' | 'axle' | 'grips';
  color: RGB;
  alphabetChars: string;
}

export interface CookieImage {
  width: number;
  height: number;
  silhouette: Contour[];
  regions: { index: number; color: RGB; contours: Contour[] }[];
}

export type Ctx = ManifoldContext<Params>;
