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
| Image LED Lightbox (Jerred's) | `led-lightbox` | planned |
| Fridge Magnet & Fidget Slider | `magnet` | planned |
| Keychain Carabiner Set | `keychain-carabiner` | planned |
| Custom Keycap | `keycap` | planned |
| Bubble Pop fidget | `bubble-pop` | planned |
| Fold-Up Box | `foldbox` | planned |
| Laser Box | `laser-box` | planned |
| Laser Studio | `laser-studio` | planned |
| Image to Clicker | `clicker` | planned |

Shared features the originals had, and where they live now:

| Feature | Here |
| --- | --- |
| Font library with live previews | `@pf/text` (64 OFL/Apache families) and the shell's font picker. The original's 257 fonts included families whose licences do not allow bundling; any font file can still be loaded with "Use a font file…". |
| Prepare Image (background removal, colour keep switches, smoothing, tone) | `@pf/trace` and the shell's Prepare Image dialog. |
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
