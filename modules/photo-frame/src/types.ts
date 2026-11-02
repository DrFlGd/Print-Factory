import type { RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export interface Params {
  product: 'frame' | 'song' | 'post' | 'holder';

  photo: PhotoId;
  orientation: 'portrait' | 'landscape';
  customWidth: number;
  customHeight: number;

  outline: 'rect' | 'arch' | 'scallop' | 'ricrac' | 'squiggle';
  corners: 'square' | 'rounded' | 'round';
  border: 'thin' | 'regular' | 'thick';
  profile: 'flat' | 'bevel' | 'deep';
  wordsAt: 'none' | 'top' | 'bottom';
  crest: boolean;

  holder: 'ledge' | 'pebble' | 'heart';

  caption: string;
  second: string;
  initials: string;
  song: string;
  artist: string;
  length: string;
  handle: string;
  likes: string;
  postCaption: string;
  front: string;
  font: string;
  textAuto: boolean;
  textSize: number;

  pattern: 'none' | 'dots' | 'checks' | 'stripes' | 'swirls' | 'blobs' | 'stars' | 'hearts' | 'deco';
  patternSize: number;
  patternDx: number;
  patternDy: number;

  stand: 'foot' | 'kickstand' | 'base' | 'block' | 'magnets' | 'keychain' | 'none';
  kickstands: '1' | '2';
  magnet: string;
  magnetCount: '2' | '4';
  holeDia: number;
  holeRing: number;
  loopAt: 'left' | 'middle' | 'right';

  bodyColor: RGB;
  inkColor: RGB;
  matColor: RGB;
  baseColor: RGB;
}

export type PhotoId = 'mini' | 'isq' | 'iwide' | '2x3' | '3.5x5' | '4x6' | 'a6' | '5x7' | 'a5' | 'custom';

export type Ctx = ManifoldContext<Params>;
