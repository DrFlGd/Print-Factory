import type { RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export interface Params {
  source: 'picture' | 'text' | 'blocks' | 'icon' | 'none' | 'model';
  blockText: string;
  icon: string;
  legends: string;
  font: string;
  textColor: RGB;
  keys: number;
  layout: 'row' | 'column' | 'grid' | 'wasd' | 'arrows' | 'custom';
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
  /** Beside the print layout: nothing, the clicker put together, or pulled apart with its switch. */
  preview: 'none' | 'assembled' | 'exploded';

  // Model mode.
  cutter: 'slice' | 'stand' | 'button';
  /** The model shown until one is loaded. */
  sample: 'toadstool' | 'acorn' | 'owl' | 'snowman' | 'cactus';
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
  /** The switch moved from where it is put by itself, and turned (Slice and Stand). */
  switchX: number;
  switchY: number;
  switchTurn: number;
}

export type Ctx = ManifoldContext<Params>;
