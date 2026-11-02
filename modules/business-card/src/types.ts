import type { RGB } from '@pf/core';
import type { CrossSection, ManifoldContext } from '@pf/engine-manifold';

export interface Params {
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  website: string;

  template: string;

  qr: boolean;
  qrKind: 'website' | 'contact' | 'link';
  qrLink: string;
  qrPlace: 'back' | 'front';
  qrStyle: 'square' | 'rounded' | 'dots' | 'finder';
  qrLogo: boolean;
  qrSize: 'standard' | 'large';

  logoMode: 'symbol' | 'initials' | 'none';
  logo: string;
  logoPlace: 'back' | 'front';
  backText: 'company' | 'name' | 'none';

  twoSided: boolean;
  size: string;
  cardWidth: number;
  cardHeight: number;
  corner: number;
  thickness: number;

  font: string;
  detailFont: string;
  raised: boolean;
  raise: number;
  nameSize: number;
  detailSize: number;
  nameCase: 'as-typed' | 'upper' | 'title';
  letterSpacing: number;
  iconStyle: 'classic' | 'circle' | 'modern' | 'square' | 'none';

  pattern: string;
  patternZoom: number;
  patternAngle: number;
  patternMode: 'colour' | 'carved' | 'cut';
  patternPaint: 'lines' | 'cells';
  patternLine: number;

  nfc: boolean;
  nfcTag: '25' | '30' | '25c';
  nfcMark: boolean;

  cardColor: RGB;
  inkColor: RGB;
  accentColor: RGB;
}

export type Ctx = ManifoldContext<Params>;

/** The three filaments: the card itself, the lettering, and the accent (fields, rules, patterns). */
export type Colour = 'card' | 'ink' | 'accent';

/** What a piece is, for the tests and the notes. */
export type Role = 'name' | 'details' | 'icons' | 'rule' | 'logo' | 'qr' | 'mark' | 'label' | 'tap';

/** A placed piece of one colour on a face. */
export interface Piece {
  cs: CrossSection;
  colour: Colour;
  role: Role;
  /** Laid on a colour field on purpose (the mark on a swoosh); otherwise it keeps off fields. */
  onField?: boolean;
}

export interface PatternArea {
  /** What the pattern paints: lines or cells, already cut to its area. */
  cs: CrossSection;
  mode: 'colour' | 'carved' | 'cut';
  /** The area it fills, for the tests. */
  area: CrossSection;
}

/** One face of the card, in the front's frame (a back is turned over before it gets here). */
export interface Face {
  /** Colour fields in the accent: a swoosh, a band, a disc. */
  fields: CrossSection | null;
  ink: Piece[];
  pattern: PatternArea | null;
  /** Carved into the face (a monogram). */
  carved: CrossSection | null;
}

export interface Plan {
  w: number;
  h: number;
  front: Face;
  back: Face | null;
  /** Holes right through the card (a window). */
  cutouts: CrossSection | null;
  /** The card under the front's top layers prints in the accent, so carving shows it. */
  reveal: boolean;
  /** The NFC tag's pocket: centre and radius (tag plus clearance). */
  pocket: { x: number; y: number; r: number } | null;
}

export const emptyFace = (): Face => ({ fields: null, ink: [], pattern: null, carved: null });
