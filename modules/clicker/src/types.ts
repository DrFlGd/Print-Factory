import type { RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export interface Params {
  source: 'picture' | 'text' | 'none' | 'model';
  legends: string;
  font: string;
  textColor: RGB;
  keys: number;
  layout: 'row' | 'column' | 'grid';
  columns: number;
  shape: string;
  size: number;
  imageMargin: number;
  imageDepth: number;
  bleed: number;
  capProud: number;
  tolerance: number;
  border: number;
  keySpacing: number;
  stemFit: number;
  socketFit: number;
  keychain: 'none' | 'loop' | 'hole';
  keychainSide: 'left' | 'right' | 'top' | 'bottom';
  capColor: RGB;
  bodyColor: RGB;
  showAssembled: boolean;

  // Model mode.
  cutter: 'slice' | 'stand' | 'button';
  modelSize: number;
  modelUp: 'z' | '-z' | 'y' | '-y' | 'x' | '-x';
  modelSpin: number;
  flatten: number;
  cutHeight: number;
  hideGap: boolean;
  standShape: 'circle' | 'square' | 'outline';
  standMargin: number;
  buttonShape: 'round' | 'square';
  buttonSize: number;
  buttonRaise: number;
  buttonX: number;
  buttonY: number;
}

export type Ctx = ManifoldContext<Params>;
