# Architecture

## The pieces

```
modules/<id>  ──defines──▶  ModuleDefinition (manifest, params, presets, readme, createWorker, ui?)
                                   │
apps/hub  ──registry──▶  @pf/hub ──mounts──▶ @pf/shell ──postMessage──▶ worker: engine + build()
                                   │                 ▲                          │
                                   │                 └──── BuildResult ◀────────┘
                                   │                       (parts, drawing, diagnostics)
                                   ▼
                       @pf/viewer (3D/2D), @pf/export (files), @pf/project (saving)
```

A module never touches the page layout, the viewer, export or storage. It describes its
settings (params.json), turns settings into geometry (build.ts, in a worker), and may add
panels and inputs through `ui(api)` when the generated form is not enough (an image to
trace, a symbol to pick). Everything else is the shell's job, so every module gets the
same export buttons, presets, undo, share links, autosave, themes and units.

## The module contract (`@pf/core`)

- **module.json** (`ModuleManifest`): id, name, summary, version, engine, process
  (3d-print, laser, cnc, tool), category, tags, export formats, `supersedes` (Generator
  Library cards it replaces), credits, licence.
- **params.json** (`ParamSchema`): typed parameters (number, integer, boolean, enum,
  string, color, font, vector) with groups, units, ranges, `showIf` expressions and an
  `advanced` flag. A superset of SCAD Workshop's params.schema.json, so OpenSCAD
  Customizer parameters map onto it (`show_if` is accepted as an alias).
- **presets.json**: named sets of values that differ from the defaults.
- **build(ctx)** returns a `BuildResult`: parts (`{name, positions, indices, color, group?,
  role?}`), an optional 2D `drawing` (cut, score and engrave layers), diagnostics and a
  summary. Parts in one `group` are one object in the slicer with a filament per part.
- **ui(api)** (optional): extra panels, inputs, reactions to values and results. Returns
  a teardown.
- **migrate(values, fromVersion)** (optional): renames and re-scales saved settings.

## Engines

Every engine speaks the same worker protocol (`@pf/core/protocol`): `build` requests in,
`result`, `error` and `log` out, meshes transferred without copying. The page side
(`createEngine`) keeps only the newest request, so dragging a slider never queues work.

- **manifold** (`engines/manifold`): manifold-3d WebAssembly with helpers for the common
  steps (contours to sections, extrude from the bed, offset, part conversion). Every
  WebAssembly object made during a build is freed afterwards.
- **openscad** (`engines/openscad`): OpenSCAD compiled to WebAssembly (Manifold backend),
  for modules written in OpenSCAD. A module gives a `ScadProgram`: its .scad files and
  libraries (as virtual paths), an entry file, and a `plan` that turns values into one or
  more renders (`-D` defines, a name, a colour, an offset). The worker mounts the files in
  a fresh OpenSCAD instance per render, reads the binary STL back as a part, keeps every
  render in IndexedDB keyed by sources and defines, and turns OpenSCAD's asserts and
  warnings into diagnostics. `finish` gets the rendered parts for a last pass (GearBox
  lays a kit's copies out on beds there). The engine itself (openscad-wasm-prebuilt,
  GPL-2.0-or-later) is emitted as its own file and loaded at run time, never bundled into
  a module. `@pf/engine-openscad/node` runs the same plan in tests.

## Shared packages

- **shapes**: contour maths (area, orientation, transforms, offsets via Manifold),
  primitives and named shapes, SVG path and document import.
- **text**: font catalogue, loading in page, worker and Node, layout to contours with
  cap-height sizing, letter spacing, alignment, multi-line, fallback fonts.
- **trace**: decode, adjust, background removal, OKLab k-means, speck cleanup, marching
  squares. The shell's Prepare Image dialog sits on top of it.
- **export**: 3MF written three ways at once (standard colour groups, Bambu/Orca
  model_settings, PrusaSlicer volume config), so colours land on the right filament in
  each slicer; STL, OBJ+MTL, SVG and DXF (R12) for laser software; zip.
- **project**: settings stored as the difference from defaults, so old files and links
  keep working as parameters are added.
- **plate**: printer beds and laser sheets, a shelf packer, size warnings.

## The hub and Generator Library

The hub (`@pf/hub`) is a gallery plus a hash router (`#/m/<id>?s=<settings>`). Modules
load on demand. `apps/hub` registers every module in `modules/`; another repository can
depend on these packages, keep its own modules, and compose its own hub the same way.

Generator Library installs the hub as a collection: `generator-library.json` has a card
for the whole hub and one per module, each opening `index.html#/m/<id>`. The Library
builds from source with pnpm (it reads `pnpm-workspace.yaml`) and hosts `dist/`.

## Decisions

- **No UI framework.** The shell is plain DOM with a small element helper. Modules can
  use anything inside their own panels.
- **Static and offline.** No server, no accounts, no telemetry. Fonts and the WebAssembly
  engine ship with the app.
- **One stylesheet** with light and dark tokens; modules add classes only for what is
  unique to them.
- **Clean-room ports.** The Vostok Labs generators are re-implemented from their
  behaviour, not copied: their licence (CC BY-NC-ND) forbids distributing derivatives.
