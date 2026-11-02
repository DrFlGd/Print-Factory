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
| Fold-Up Box | `foldbox` | done (see below) |
| Laser Box | `laser-box` | done (see below) |
| Laser Studio | `laser-studio` | done: all 58 designs (see below) |
| Image to Clicker | `clicker` | done (see below) |
| Business Card Generator | `business-card` | done (see below) |
| Photo Frames Studio | `photo-frame` | done (see below) |

Shared features the originals had, and where they live now:

| Feature | Here |
| --- | --- |
| Font library with live previews | `@pf/text` (64 OFL/Apache families) and the shell's font picker. The original's 257 fonts included families whose licences do not allow bundling; any font file can still be loaded with "Use a font file…". |
| 3D model import (STL, 3MF, OBJ, with repair) | `@pf/mesh`: parsing, preparation in a worker, a compact stored form for project files, and the `meshInput` panel. |
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

## Fold-Up Box

The nets are written here as a tree of panels (hinge to parent, fold angle) from the
standard glue-free carton structures; nothing is taken from the original's builders.

- [x] Mailer (roll-end locking ends, lid and tuck), mailer with side flaps, tray, tray and lid.
- [x] Inside or outside sizes; lid depth and fit; tuck depth and lock (shoulders, friction, none); thumb notch; hand holes through both plies.
- [x] Window in the lid or front; text or icon logo inlaid in the outside face, one layer deep, mirrored to read right when folded.
- [x] Printed sheet with grooved folds down to a one-layer hinge; layer height, sheet and hinge layers, groove and cut widths.
- [x] Folded or part-folded preview beside the sheet, with the logo (preview only).
- [x] Tests fold the nets: outside size, the end tabs landing in the floor slots, the ears trapped between wall and ply, the logo reading right.
- [ ] Cut-from-card output and the cutting-machine profiles, inch units, dividers, hang tabs, film insert, webbed-corner styles.
- [ ] Slicer process settings (first-layer height, infill direction) written into the 3MF.

## Image to Clicker

The original seated its cap and body round switch and socket meshes measured off a 3D asset.
Here the fit is modelled from the published Cherry MX dimensions (14 mm cutout in a 1.5 mm
plate, housing, stem and travel heights); tests check the cap stays clear of the body from
rest to full travel and the plate opening and pocket sizes.

- [x] Picture (per-colour filament), text or plain cap; cap follows the picture or a preset shape; frame, inlay depth, colour overlap.
- [x] Caps grow to cover the switch; cap clearance, stem clearance, plate cutout fit; cap stands proud by about the travel.
- [x] One to twelve keys in a row, column or grid in one body, a text legend each.
- [x] Keyring loop or hole on any side.
- [x] Caps print face down (design first), body on its floor; assembled preview beside them.
- [x] Model mode: STL, 3MF or OBJ through `@pf/mesh` (weld, turn right way out, join shells, voxel repair, simplify, set down); up axis, turn, size, flatten; Slice (auto cut, hide the gap), Stand (circle, square or footprint plate), Button (round or square, flush or raised, auto placed). Tests check the moving piece clears the still one at rest and pressed.
- [ ] Letter blocks (WASD, Arrows, Custom layouts, symbols on keys), Icon source, raised colour relief, several switches under one cap, per-edge fillets, block textures.

## Laser Box

The joint model here is written from scratch: each piece is a slab of sheet at its face of
the box, every overlap is handed to one piece by a joint (fingers or tabs) or by rank, and
outlines come from that, so a finger and its notch can never disagree. Tests assemble every
style in 3D and check that nothing overlaps at an exact fit, that an open box is its whole
shell, that the hinged lid turns open clear of everything and that each drawer slides out.

- [x] Open, lift-off lid (glued lip, thumb notch), hinged lid (square pins in round holes under a knuckle, latch tab in a front recess), chest of one to three drawers (overlay fronts, drawers tabbed through them, finger holes).
- [x] Inside or outside sizes; flush, inset (slots) and feet bottoms; egg-crate dividers both ways.
- [x] Materials with nominal thickness and kerf, measured thickness, kerf override, five fit stops shifted per material; flex tabs on slot joints (not on acrylic or board), plain corner fingers; finger width.
- [x] Patterns (asanoha, seigaiha, shippo, hexagons, diamonds, stars, dots, waves) scored, engraved or cut as a lattice with a web, kept clear of joints, on the lid, front, walls or all; shape windows with a frame line; kept inside a lift-off lid's lip when cut.
- [x] Sheet presets and custom sheets, MaxRects packing with the grain kept one way on plywood, several sheets exported as one SVG or DXF per sheet.
- [x] Assembled 3D view, closed or open.
- [ ] Several pattern layers on different faces at once, clicking faces in 3D, a 2D design view, the original's pattern library, rounded flex-tab tips, dimension lines in 3D.

## Laser Studio

The original is a library of 58 templates. This module has the design pipeline (lettering,
outlines that hug it, bridges, keyring loops and holes, text on an arc, patterns, QR codes,
packing onto sheets, layered pieces stacked in 3D) and the designs written on it. A design is
a function in `modules/laser-studio/src/` (`designs.ts`, `keychains.ts`, …) registered in
`registry.ts`; `catalog.ts` names it and lists the settings it reads, and the form's menu and
conditions are generated from that.

- [x] Name keychain, layered keychain, connected text, symbol charm.
- [x] Name tag (13 shapes, shrink to fit, engrave, score or cut through), pet ID tag, pattern fill with a monogram tile.
- [x] Arc coaster (plain or scalloped), framed name ornament on a backer.
- [x] Cake topper on one or two stakes, plant stake.
- [x] Place cards from a guest list (scored fold, name on one or both sides), luggage tags per name.
- [x] QR tag (offline, UTF-8, error correction, a warning when the squares get too small).
- [x] Jigsaw in five shapes with seeded knobs.
- [x] Bag charm, artwork (SVG) keychain, letter tiles, couple keychains, heart cutout and heart puzzle pairs, date calendar keychain, now-playing song keychain, pocket phone stand, split monogram (ring, laurel, disc or scalloped disc).
- [x] Business cards in five layouts (band, half with a dahlia burst, framed, tall, logo tile), one per name; new patterns: tumbling blocks, rays, dahlia.
- [x] Wi-Fi card, table sign and QR table tent (a tent braced at both ends), QR stand (half-lapped feet), QR slot stand (raised code plate, base under the weight), QR display stand (plaque, feet, two codes, rounded).
- [x] Pet feeding sign (screw holes or a keyhole), snowflake gift tag (four flakes), basketball, baseball, soccer and football bag tags.
- [x] Christmas, house and cat ornaments (frame over backer, lettering welded or its own piece over a scored guide), family tree of names, family crossword (crossword layout of the names as letter tiles), pattern on your SVG (areas by number), heart and icon photo frames (three sheets, a drop-in pocket, two tabbed ribs).
- [x] Multi-piece layouts on one or more sheets, kerf, 3D view with layers stacked and marks shown.
- [x] Phone stand (two identical crossed planks, the slot placed so both feet stand), name puzzle (pockets with fingertip notches, letter middles kept), tic-tac-toe, bracelet sets with words or a symbol on a scored display card, hair-tie holder and card, tie holder on a closet-rod hook.
- [ ] Dragging the keyring on the preview, per-symbol tokens inside text, warped text, the template gallery pictures, clicking the areas of an SVG (here they are typed as numbers).

## Business Card

Written from how the original behaves: a card is planned as two faces (fields, ink pieces in
three colours, a pattern, carved and cut areas, a pocket), and one solid builder turns a plan
into a flush card printed face down or a raised one printed face up, with the back laid into
the bottom layers. Every design is a function in `modules/business-card/src/templates-*.ts`
written for Print Factory. Tests check that every design's lettering stays on the card, off
its fields and pattern and clear of itself, at the default size and a US card.

- [x] Eighteen designs: minimal, split, window, monogram, swoosh, orbit, sash, dots, split name, band, half, framed, tall (portrait), logo tile, texture, corner QR, NFC and scan back.
- [x] Name, title, company, phone, email and website; icons in five styles; logo as a symbol, your own SVG or initials; on the front or the back.
- [x] QR codes (website, vCard contact or another link; square, rounded, dot or round-corner modules; a logo in the middle at high error correction; standard or large; a warning on low contrast).
- [x] Card sizes (EU, US, AU, credit card, custom), corner radius, thickness that grows to hold the colours or a tag.
- [x] Patterns in colour, carved tone on tone or cut through as a lattice, at any zoom and angle.
- [x] NFC sticker or coin pocket between the faces with a pause height, and a tap mark.
- [x] One or two sides, raised or flush lettering, three filaments.
- [ ] The original's font set beyond the bundled OFL and Apache families; batch cards from a list.

## Photo Frame

Written from how the original behaves. A frame is built in front view and printed face down:
the face with its words and pattern laid into the first three layers, a bevelled window, the
pocket, and a back plate that slides in from the right in grooves under a ceiling. Holders and
bases share one groove model (`geo.ts`): a slot leaning back 15° whose front wall keeps 4 mm
at its foot. Tests check the pocket and window against each print, that the plate never meets
the frame, and every shape, profile, pattern and stand.

- [x] Instant mini, square and wide film (the window inside the picture area) and 2 × 3, 3.5 × 5, 4 × 6, A6, 5 × 7 and A5 paper, either way up, or custom.
- [x] Rectangle, arch, scallops, ric-rac with a trim band, squiggle; corners; three borders; flat, bevel and shadow-box (with a mat) profiles.
- [x] Words above or below, a crest with initials, nine bold patterns with size and shift.
- [x] Song plaque (title, artist, progress bar with times, buttons) and social post (handle, actions, likes, caption).
- [x] Foot, kickstand fins on the back plate, low base, tall block, fridge magnets in pucks (with a weight check), key ring loop, none.
- [x] Ledge, pebble and heart holders with words on the front.
- [ ] Photo upload for the preview, hanging hooks, the original's full font set.
