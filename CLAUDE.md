# Working on Print Factory

- pnpm workspace, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Vitest. Node 22.
- Before pushing: `pnpm check` (registry up to date, typecheck, tests). After UI or module
  changes also `pnpm build && pnpm test:browser`; it screenshots every module into
  `test-results/`.
- Units are millimetres everywhere. 3D is Z up with the bed at z = 0. 2D contours are flat
  `[x0, y0, x1, y1, …]`, Y up, outer boundaries counter-clockwise, holes clockwise.
- Colours are `[r, g, b]` with 0–255 channels.
- A module is `modules/<id>/`: module.json, params.json, presets.json, README.md,
  src/index.ts, src/worker.ts, src/build.ts. `tools/tests/modules.test.ts` builds every
  module with its defaults and presets, so a broken preset fails CI.
- After adding or renaming a module run `pnpm gen` and commit the generated
  `apps/hub/src/registry.generated.ts` and `generator-library.json`.
- Parameters are the only state that goes in share links. Images, imported fonts and
  meshes are module inputs (`api.setInput`), kept in project files and autosave only.
- Do not copy code from the Vostok Labs repository (CC BY-NC-ND). Modules here are written
  from their behaviour; see docs/PORTING.md. Jerred's own work from that fork (the LED
  lightbox) is his and is MIT here.
- Fonts: add families in `tools/fetch-fonts.mjs` and run it (needs `pip install fonttools`
  to cut variable fonts into static weights). Only OFL or Apache fonts.
