# Print Factory

Parametric generators for 3D printing and laser cutting, built on one framework: shared
packages for geometry, text, images and export, one module contract, and one app (the
hub) that runs every module. Everything runs in the browser, offline, on the user's
device.

```
pnpm install
pnpm dev          # the hub at http://localhost:5173
pnpm check        # registry, types and tests
pnpm build        # static app in dist/
pnpm test:browser # every module in headless Chromium (after pnpm build)
pnpm new:module my-thing "My Thing"
```

## What is in it

| Folder | What |
| --- | --- |
| `packages/core` | The contract: module manifest, parameter schema, presets, engine protocol, host. |
| `packages/shapes` | 2D contours in mm: primitives, transforms, measuring, SVG import. |
| `packages/text` | Text to outlines, 64 bundled OFL and Apache fonts, user fonts, fallback for missing glyphs. |
| `packages/trace` | Images to colour regions: background removal, quantisation, tracing. |
| `packages/export` | 3MF (a filament per colour, for Bambu Studio, Orca and PrusaSlicer), STL, OBJ, SVG, DXF, zip; STL, OBJ and 3MF import. |
| `packages/project` | Project files, share links, autosave, user presets, undo. |
| `packages/plate` | Printer beds, laser sheets, arranging parts. |
| `packages/viewer` | The 3D stage (three.js) and the 2D drawing view. |
| `packages/shell` | The common generator UI, generated from a module's parameters. |
| `packages/hub` | Gallery and router; any repo can compose its own hub. |
| `engines/manifold` | manifold-3d in a worker; the default engine. |
| `engines/openscad` | OpenSCAD (WebAssembly) in a worker, for modules written in OpenSCAD (GearBox). |
| `modules/*` | The generators. |
| `apps/hub` | The app that ships: every module in `modules/`. |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the parts fit, [docs/MODULES.md](docs/MODULES.md)
to write a module, and [docs/PORTING.md](docs/PORTING.md) for the generators being
brought over from the Vostok Labs fork.

## Generator Library

`generator-library.json` (written by `pnpm gen`) lists the hub and one card per module.
Each builds from this repository's source with the Library's own Node.js; a release
zip (`print-factory-web-*.zip`, from the Release workflow) is the second option.

## Licence

MIT, for the code. Bundled fonts keep their own licences (SIL OFL 1.1 or Apache 2.0),
included beside each font in `packages/text/fonts/licenses/`. Laser Studio's QR codes come
from qrcode-generator by Kazuhiko Arase (MIT). GearBox carries the parts of BOSL2 it uses
(BSD-2-Clause, licence in `modules/gearbox/lib/BOSL2/`). The OpenSCAD engine
(openscad-wasm-prebuilt, GPL-2.0-or-later) is an npm dependency that the build copies
beside the app as its own file and loads at run time; it is not compiled into Print
Factory's code. Its source is at https://github.com/lorenzowritescode/openscad-wasm (the
build) and https://github.com/openscad/openscad (OpenSCAD).
