# GearBox Gear Board

A modular, 3D printed gear board: interlocking tiles with a grid of bolt sockets, spur
gears riding on ball bearings, and add-ons from hand cranks to a Geneva drive. This is
Jerred's GearBox (DrFlGd/GearBox) on Print Factory's OpenSCAD engine: the same OpenSCAD
library, part table and kit catalog, rendered in the browser.

## Make

- **One part.** Any of GearBox's parts with your own options: gears (plain, compound,
  partial), board tiles, knobs and spacers, cranks, pointers and dials, pulleys and
  links, motor mounts, the planetary set, bevel and worm drives, rails and carriages,
  cams, Geneva drives, the escapement, the wind-up spring and winch, magnetic gears, and
  the legacy and test parts (fit test coupon, hex sleeve set, straight jaw gears,
  magnetic module plates).
- **A kit.** Every part of one of GearBox's kits. *Print layout* renders each part once
  and lays every copy flat on 220 mm beds (side by side when one bed is not enough), to
  export as one 3MF. *Assembled* and *Exploded* show the kit put together on a tile, the
  printed parts in orange and the bolts, nuts and bearings in grey: a picture to build
  from (it exports as one model, not as parts to print). The kit's hardware list is shown under
  the status line.

## Three sizes

| | **M2** | **M1.5** | **M1** |
|---|---|---|---|
| Gear module | 2 mm | 1.5 mm | 1 mm |
| Hole pitch | 20 mm | 15 mm | 10 mm |
| Bolt | M8 | M6 | M5 |
| Bearing | 608 | 606 | 605 |

Two gears mesh when their tooth counts add up to a multiple of 20. Pick one size for a
board: parts do not mix. Some parts are not made in M1 (the ratchet and pawl, the
escapement, the NEMA 17 mount); the generator says so.

## Print and fit

- **Gear joints**: jaws (three tapered jaws on each top face, pockets underneath, no
  hardware), dowel pins, or pins + screws.
- **Filament**: PLA, PETG or ABS, which sets every fit and clearance.
- **More settings** adjusts any single fit from the profile's value, in hundredths of a
  millimetre: bearing seats, bolt and nut clearances, the tile keys, the jaw flanks,
  gear backlash, dowel pins and magnet pockets. Print the fit test coupon first and
  tune from it.

Renders take from under a second (a spacer) to half a minute (a large tile or a kit's
assembly). Every render is kept in the browser, so going back to a part opens it at
once.

## Credits and licences

- The GearBox OpenSCAD library (`scad/`), part table and kit catalog (`catalog/`) are
  Jerred's, ported directly, MIT.
- `lib/BOSL2/` holds the 34 files of BOSL2 that GearBox uses (gears, threading, shapes),
  BSD-2-Clause, licence beside them.
- The shapes are rendered by OpenSCAD compiled to WebAssembly (openscad-wasm-prebuilt,
  GPL-2.0-or-later). It is loaded as a separate program at run time and given the files
  and arguments; nothing of it is compiled into this module.
