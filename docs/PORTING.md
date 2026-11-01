# Porting the Vostok Labs generators

The fork at DrFlGd/Generator-Standalone holds twelve generators by Vostok Labs, under
CC BY-NC-ND 4.0 ("the generator and the designs it produces"). That licence does not
allow distributing modified versions, and this repository is public, so nothing is
copied from it. Each module here is a clean re-implementation of the original's
*behaviour* (what the settings do and what the printed part needs), written against
this framework's packages under MIT.

The exception is the Image LED Lightbox: every commit to it in the fork is Jerred's, so
its design and tests come across directly.

Status: **done** means the module is in `modules/` with the features listed; **partial**
lists what is still missing; **planned** has not started.

| Original | Module | Status |
| --- | --- | --- |
| Name Keychain | `name-keychain` | done (see below) |
| House & Office Number | `house-number` | done (see below) |
| Pen Topper | `pen-topper` | done (see below) |
| Image LED Lightbox (Jerred's) | `led-lightbox` | done, direct port (see below) |
| Fridge Magnet & Fidget Slider | `magnet` | done (see below) |
| Keychain Carabiner Set | `keychain-carabiner` | done (see below) |
| Custom Keycap | `keycap` | done (see below) |
| Bubble Pop fidget | `bubble-pop` | done (see below) |
| Fold-Up Box | `foldbox` | planned |
| Laser Box | `laser-box` | planned |
| Laser Studio | `laser-studio` | planned |
| Image to Clicker | `clicker` | planned |

Shared features the originals had, and where they live now:

| Feature | Here |
| --- | --- |
| Font library with live previews | `@pf/text` (64 OFL/Apache families) and the shell's font picker. The original's 257 fonts included families whose licences do not allow bundling; any font file can still be loaded with "Use a font file…". |
| Prepare Image (background removal, colour keep switches, smoothing, tone) | `@pf/trace`, the shell's Prepare Image dialog and the shared Picture panel (`imageInput`). |
| 3MF with a filament per colour, AMS and no-AMS | `@pf/export` and per-module diagnostics giving swap heights. |
| Save/Load project, share links, undo | `@pf/project` and the shell. |
| Printer bed picker, size warnings | `@pf/plate` and the shell. |
| Symbol library | `@pf/symbols` (999 Tabler filled icons, MIT), the `symbol` parameter type and the shell's symbol picker; any SVG can be added with "Use an SVG file…". |
| Website, checkout, licence-key and watermark code | Not ported: not part of the generators. |

## Name Keychain

- [x] Text up to three lines, any bundled or user font, cap-height sizing, letter and line spacing, alignment.
- [x] Bubble outline that follows the letters, with smoothing and automatic joining; rounded plate; pill; letters only.
- [x] One, two or three colours (plate, letters, border).
- [x] Raised, inlaid (flush) or engraved letters.
- [x] Ring tab or hole, left, top or right.
- [x] No-AMS printing: swap heights in the status line; inlay warns.
- [x] Accents, Greek and Cyrillic through the Noto Sans fallback.
- [ ] Pixel-font style presets (the fonts are bundled: Press Start 2P, Silkscreen, VT323).

## House Number

- [x] Two lines at independent sizes; second line above, below, left or right; alignment and vertical alignment.
- [x] Stacked (vertical) characters with their own pitch.
- [x] Overall size that scales the face but not thicknesses or screws.
- [x] Divider line (length, overhang, offset) or band with the second line knocked out.
- [x] Rounded, square, pill, plaque and plateless (bridged) signs; fixed plate size that grows to fit.
- [x] Raised, inlaid or engraved text; front-edge bevel.
- [x] Colour strip on any edge, raised panel, raised frame, each its own filament.
- [x] Keyhole slots (shank slot plus head channel from the back), screw holes (two or four, countersunk), tape.
- [x] Oversize plate warning.

## Pen Topper

- [x] Pen table (BIC Cristal, Pilot G2, Sharpie, pencils, Stabilo, straws, stylus and more) plus a custom diameter, round or hex barrel.
- [x] Fit (snug, normal, loose) through gripping ribs; teardrop bore so the hole prints without supports.
- [x] Inset socket, straight-through, or a collar that wraps the pen.
- [x] Name across or along the pen, optional second line, socket offset and angle.
- [x] Bubble outline, rounded block or letters only, held together by a spine along the pen.
- [x] Symbol left, right or above the name; halo layer; raised or engraved letters.
- [x] One to three colours, with no-AMS swap heights.
- [x] Plate thickens automatically for the wall the pen needs; a translucent preview pen in the viewer.

## Image LED Lightbox

Jerred's own code: `src/build.ts` and `src/marquee.ts` are his geometry, moved onto the
framework's engine context, and the tests are his, moved to Vitest.

- [x] Shell with back plate, LED ledge and cable exits: back, right side, both, one or two positioned radial holes.
- [x] Separate diffuser beside the shell, 0.6 to 3 mm, with up to six 0.4 mm colour inlays.
- [x] White or black picture border; the black band is its own filament part.
- [x] Registration lip on the diffuser or on the box, with clearance per side; face-down printing with a lip.
- [x] Marquee holes along the outline, the black band or inside each colour section, with count, diameter, inset and 0.1 mm shift.
- [x] Up to 600 mm; the shell's printer check replaces the fixed 250 mm warning.
- [x] Prepare Image, and projects that keep the traced picture without the bitmap.
- [x] Box, diffuser and band colours are settings (they were fixed before).

## Fridge Magnet & Fidget Slider

- [x] Picture (PNG, JPG, WebP, SVG) or text as the design; per-colour filament and raise level (Colours panel).
- [x] Body follows the design (closed outline plus frame margin) or a circle, rounded rectangle, rectangle, square or hexagon with the design fitted inside.
- [x] Front bevel with a flat back; colour inlay depth, raise step and overlap.
- [x] Glue-in, embedded (pause height reported) or magnetic sheet.
- [x] Stock disc and block magnets or a custom size; fit clearance with the hex allowance; block direction.
- [x] Pockets spread over the eroded outline with 2 mm walls; count reduced and reported when they do not fit; whole set can be moved.
- [x] Thickness never below magnet + floor + 0.8 mm cover.
- [x] Slider: 2 × 2, 2 × 3 or 2 × 4 per half, pitch from the pocket, wall and spacing; body grows to fit; mirrored half B for outline shapes; plain half B.
- [ ] Recolour one shape by clicking it on the model (whole colours only, from the panel).
- [ ] Drag pockets on the model (Move magnets shifts the set instead).

## Keychain Carabiner Set

- [x] Hook in 19 shapes with an S-cut spring gate (soft, normal, firm).
- [x] Print-in-place swivel (barrel, window, stem through a tunnel), plain loop, or none; stem size checked against the hook's thickness.
- [x] Symbol on the hook from the symbol library: position round the band, in/out, turn, raise, own colour.
- [x] Open links in any shape with a leaning slit at the thinnest point; connector rings at both ends.
- [x] Print-in-place chain grown out of the hook or the swivel's stem, or as its own part with a connector. Here it alternates wide and narrow octagon links rather than the original's link layout.
- [x] Charm: any shape, solid or frame, symbol cut, engraved or raised; on the chain or on the swivel's stem.
- [x] Chamfered or rounded top and bottom edges (now an engine feature, `ctx.edged`); one-colour mode.
- [ ] The "as worn" preview with the hanging animation.
- [ ] Dragging the symbol on the model; the skull shape; SVG shape files.

## Custom Keycap

The original shipped keycap meshes converted from STEP files under its CC BY-NC-ND licence, so
none of them are used. The caps here are generated from measurements of those caps (height,
footprint, top size, ceiling, stem positions).

- [x] Standard (dished), Thocky, Low profile and Choc v1 profiles.
- [x] 1u to 2.75u and the 6u, 6.25u and 6.5u spacebars, with stabiliser stems where needed; Choc in 1u, 1.5u and 2u.
- [x] Legend from the symbol library, your own SVG, or text in any font; size, rotation, nudge, mirror; trimmed to the top with a warning.
- [x] Two-colour inlay, one-colour engraving, and shine-through (legend through the roof, stem in the same clear part).
- [x] Second legend in a corner.
- [x] Homing bump (upright prints only).
- [x] Stem clearance from −0.4 to +0.4 mm that changes the socket (or Choc legs) by exactly that amount.
- [x] Stem fit test: five labelled stems, 0.05, 0.1 or 0.2 mm apart, centred on the current clearance.
- [x] Print orientation: face down for flat tops, upright for the dished Standard.
- [ ] The paid full-set (A to Z) export and the "Walls" slicer setting written into the 3MF.

## Bubble Pop Fidget

The original placed a fixed pop-module mesh (a CC BY-NC-ND design) in each socket. It is
not used: the socket (bore, chamfers, two blind pockets, two tapered spring beams) and the
button (skirt, neck, snap bead, cap) are modelled here from the mechanism's working
dimensions, and the tests check the bead really overlaps the beams half way, clears them at
full travel, and that the cap and skirt stop the button at both ends.

- [x] 21 body shapes (circle to butterfly) with corner radius, donut hole and star points; or the picture's outline plus a frame.
- [x] Picture inlaid flush in the face that prints on the bed, per-colour filament choice, colour overlap.
- [x] Chamfered or rounded top edge; the picture face stays square.
- [x] Button count, spread-out or grid layout, extra spacing, move-all offset, bore clearance, body with empty sockets.
- [x] Buttons printed in place, each its own part, in their own colour.
- [ ] Dragging single buttons on the model (manual layout).
