import type { RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';
import type { Theme } from './patterns';
import type { Shape } from './shapes';

export const FLAT_SHAPES = [
  'tree',
  'snowflake',
  'gingerbread',
  'stocking',
  'bell',
  'jingle-bell',
  'star',
  'heart',
  'candy-cane',
  'snowman',
  'pumpkin',
  'ghost',
  'bat',
  'egg',
  'bunny',
  'shamrock',
  'star-of-david',
  'leaf',
] as const;
export type FlatShape = (typeof FLAT_SHAPES)[number];

export const TOPPERS = ['star', 'north-star', 'radiant-star', 'snowflake'] as const;
export type Topper = (typeof TOPPERS)[number];

export interface Params {
  product: 'bauble' | 'flat' | 'topper';

  shape: Shape;
  customBulge: number;
  customTop: number;
  customBottom: number;
  diameter: number;
  elongation: number;
  mode: 'vase' | 'lace';

  theme: Theme;
  traditionalPattern: string;
  japanesePattern: string;
  scandinavianPattern: string;
  artDecoPattern: string;
  orientalPattern: string;
  gothicPattern: string;
  geometricPattern: string;
  halloweenPattern: string;
  easterPattern: string;
  valentinePattern: string;
  hanukkahPattern: string;
  stPatricksPattern: string;
  autumnPattern: string;
  newYearPattern: string;
  repeats: number;
  verticalScale: number;
  line: number;
  depth: number;
  coverage: number;
  engrave: boolean;

  text: string;
  font: string;
  logo: 'none' | 'symbol' | 'image';
  symbol: string;
  artSize: number;
  artOffset: number;
  artStyle: 'emboss' | 'engrave';

  capStyle: 'smooth' | 'fluted' | 'star';
  neckDiameter: number;
  neckHeight: number;
  loopHole: number;
  threadClearance: number;
  showCap: boolean;

  overhang: number;
  foot: number;
  coneMargin: number;
  lineWidth: number;
  wall: number;
  resolution: 'draft' | 'standard' | 'fine';

  flatShape: FlatShape;
  flatHeight: number;
  flatThickness: number;
  topper: Topper;
  topperHeight: number;
  topperThickness: number;
  edgeRound: number;
  decoration: boolean;
  decoHeight: number;
  loop: boolean;
  colorMode: 'ams' | 'swap' | 'single';
  tipDiameter: number;
  socketDepth: number;
  fitClearance: number;

  baubleColor: RGB;
  capColor: RGB;
  ornamentColor: RGB;
  decoColor: RGB;
}

export type Ctx = ManifoldContext<Params>;

/** The pattern parameter for each theme. */
export const PATTERN_PARAM: Record<Theme, keyof Params | null> = {
  plain: null,
  traditional: 'traditionalPattern',
  japanese: 'japanesePattern',
  scandinavian: 'scandinavianPattern',
  'art-deco': 'artDecoPattern',
  oriental: 'orientalPattern',
  gothic: 'gothicPattern',
  geometric: 'geometricPattern',
  halloween: 'halloweenPattern',
  easter: 'easterPattern',
  valentine: 'valentinePattern',
  hanukkah: 'hanukkahPattern',
  'st-patricks': 'stPatricksPattern',
  autumn: 'autumnPattern',
  'new-year': 'newYearPattern',
};
