/**
 * The design menu and which settings each design shows. params.json's design options and
 * every `showIf` that names designs are generated from this (tests/params.test.ts; run the
 * tests with LS_PARAMS=write to rewrite params.json).
 */

export interface DesignInfo {
  id: string;
  label: string;
  description: string;
  /** The settings this design reads. */
  uses: string[];
}

/** Settings that only show for a design that has a keyring, and only when it is not None. */
export const RING_FIELDS = ['ringSide', 'holeDiameter', 'ringWall'];

export const DESIGN_INFO: DesignInfo[] = [
  {
    id: 'name-keychain',
    label: 'Name keychain',
    description: 'A name with an outline that follows the letters and a loop',
    uses: ['text', 'font', 'size', 'spacing', 'weight', 'op', 'margin', 'smooth', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'layered-keychain',
    label: 'Layered keychain',
    description: 'The name cut from one colour, glued on a backer',
    uses: ['text', 'font', 'size', 'spacing', 'weight', 'margin', 'smooth', 'ring', 'ringSide', 'holeDiameter', 'ringWall', 'color2'],
  },
  {
    id: 'connected-text',
    label: 'Connected text',
    description: 'A name welded into one cut piece, bridged where letters part',
    uses: ['text', 'font', 'size', 'spacing', 'weight', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'symbol-charm',
    label: 'Symbol charm',
    description: 'An icon outlined, with a loop',
    uses: ['op', 'symbol', 'symbolSize', 'margin', 'smooth', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'name-tag',
    label: 'Name tag',
    description: 'Lettering on a heart, disc, bone, shield or banner',
    uses: ['text', 'font', 'size', 'spacing', 'op', 'shape', 'tagWidth', 'tagHeight', 'margin', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'pet-tag',
    label: 'Pet ID tag',
    description: "A pet's name and your number on a bone or tag",
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'spacing', 'op', 'shape', 'tagWidth', 'tagHeight', 'margin', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'pattern-fill',
    label: 'Pattern fill',
    description: 'A shape filled with a pattern, a monogram in the middle',
    uses: ['text', 'monogram', 'font', 'size', 'spacing', 'shape', 'tagWidth', 'tagHeight', 'border', 'pattern', 'patternOp', 'patternSize', 'patternAngle', 'web', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'arc-coaster',
    label: 'Arc coaster',
    description: 'Text curved round the rim, a monogram in the middle',
    uses: ['text', 'text2', 'monogram', 'font', 'font2', 'size', 'size2', 'spacing', 'op', 'shape', 'diameter', 'border', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'framed-ornament',
    label: 'Framed ornament',
    description: 'A name across a ring frame on a dark backer',
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'spacing', 'weight', 'diameter', 'border', 'holeDiameter', 'ringWall', 'color2'],
  },
  {
    id: 'cake-topper',
    label: 'Cake topper',
    description: 'Up to three lines welded together on stakes',
    uses: ['text', 'font', 'size', 'spacing', 'weight', 'stakeLength', 'stakes'],
  },
  {
    id: 'plant-stake',
    label: 'Plant stake',
    description: "The plant's name on top of a garden stake",
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'spacing', 'weight', 'stakeLength'],
  },
  {
    id: 'place-cards',
    label: 'Place cards',
    description: 'A folding card for each name on your list',
    uses: ['text', 'font', 'size', 'spacing', 'op', 'cardWidth', 'cardHeight', 'bothSides', 'margin'],
  },
  {
    id: 'luggage-tag',
    label: 'Luggage tag',
    description: 'A strap-slot tag per name, with contact details',
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'spacing', 'op', 'tagWidth', 'tagHeight', 'margin'],
  },
  {
    id: 'qr-tag',
    label: 'QR tag',
    description: 'A code, two lines and a loop',
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'spacing', 'tagWidth', 'tagHeight', 'margin', 'qrData', 'ecc', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'jigsaw',
    label: 'Jigsaw',
    description: 'A puzzle in the shape and number of pieces you pick',
    uses: ['text', 'font', 'size', 'spacing', 'op', 'shape', 'puzzleWidth', 'puzzleHeight', 'cols', 'rows', 'tabSize', 'seed'],
  },
  {
    id: 'bag-charm',
    label: 'Bag charm',
    description: 'An initial, name or symbol on a shape, for a zip pull',
    uses: ['charmStyle', 'text', 'font', 'size', 'spacing', 'op', 'symbol', 'shape', 'tagWidth', 'tagHeight', 'margin', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'svg-keychain',
    label: 'Artwork keychain',
    description: 'A symbol or your own SVG, outlined or on a shape, a name under it',
    uses: ['text', 'font', 'size', 'spacing', 'op', 'symbol', 'symbolSize', 'mount', 'shape', 'tagWidth', 'tagHeight', 'margin', 'smooth', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'tile-keychain',
    label: 'Letter tiles',
    description: 'A word as a row of word-game tiles',
    uses: ['text', 'font', 'op', 'tileSize', 'tileValues', 'ring', 'ringSide', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'couple-keychains',
    label: 'Couple keychains',
    description: 'Two tags whose notches make one heart',
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'op', 'tagWidth', 'tagHeight', 'margin', 'heartSize', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'heart-cutout-keychains',
    label: 'Heart cutout pair',
    description: 'Two bars that share a heart cut across them',
    uses: ['text', 'text2', 'font', 'font2', 'size', 'size2', 'op', 'symbol', 'tagWidth', 'tagHeight', 'margin', 'heartSize', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'heart-puzzle-keychains',
    label: 'Heart puzzle pair',
    description: 'Two bars that lock together at two hearts',
    uses: ['text', 'font', 'size', 'spacing', 'op', 'tagWidth', 'tagHeight', 'margin', 'heartSize', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'date-keychain',
    label: 'Date calendar',
    description: 'A month with your day in a heart, and an initials charm',
    uses: ['text', 'font', 'font2', 'op', 'tagWidth', 'charmSize', 'calDate', 'weekStart', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'song-keychain',
    label: 'Now playing',
    description: 'A song plate: title, artist, progress bar, controls and a code',
    uses: ['text', 'text2', 'font', 'font2', 'op', 'tagWidth', 'qrData', 'ecc', 'codeMode', 'songLength', 'progress', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'keychain-phone-stand',
    label: 'Pocket phone stand',
    description: 'A keychain bar that stands your phone up',
    uses: ['text', 'font', 'size', 'spacing', 'op', 'tagWidth', 'tagHeight', 'margin', 'slotWidth', 'slotDepth', 'legLength', 'ring', 'holeDiameter', 'ringWall'],
  },
  {
    id: 'split-monogram',
    label: 'Split monogram',
    description: 'A big initial split by your name, framed',
    uses: ['text', 'monogram', 'font', 'font2', 'size', 'spacing', 'weight', 'diameter', 'border', 'frame', 'ring', 'holeDiameter', 'ringWall'],
  },
];
