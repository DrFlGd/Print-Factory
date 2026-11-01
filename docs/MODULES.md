# Writing a module

```
pnpm new:module bag-tag "Bag Tag"
pnpm install && pnpm dev     # open http://localhost:5173/#/m/bag-tag
```

That copies `tools/module-template` to `modules/bag-tag`: a working rounded plate to
change into your generator.

## Files

| File | What |
| --- | --- |
| `module.json` | Name, summary, version, engine, process, export formats, category, tags. |
| `params.json` | The settings. The form, presets, share links and project files all read it. |
| `presets.json` | Named starting points; `values` only lists what differs from the defaults. |
| `README.md` | Shown as "About this generator". Say what each group does and what to print it in. |
| `src/build.ts` | Settings in, `BuildResult` out. Runs in a worker and in Node tests. No DOM. |
| `src/worker.ts` | `serve(build)`, two lines. |
| `src/index.ts` | `defineModule({...})`: wires the files together, plus optional `ui`, `migrate`, `fileName`. |
| `tests/*.test.ts` | Geometry tests in Node. |

## Parameters

```json
{ "name": "width", "label": "Width", "type": "number", "default": 60, "min": 10, "max": 200,
  "step": 0.5, "unit": "mm", "group": "Size", "description": "One sentence of help." }
```

- Types: `number`, `integer`, `boolean`, `enum` (with `options` and `widget`: select,
  segmented or cards), `string` (`multiline`, `maxLength`), `color` (`palette` of
  swatches), `font` (a font id from `@pf/text`), `vector`.
- `showIf`: an expression over other parameters, such as `"layers == 3"` or
  `"shape != 'none' && hole"`. Hidden values are kept.
- `advanced: true` folds the field under "More settings".
- Lengths are always millimetres; the shell converts for display when the user picks
  inches.

## The build

```ts
export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const p = ctx.params;
  const t = await text(p.font, p.label, { capHeight: p.size });   // @pf/text
  const plate = ctx.cs([roundedRect(w, h, r)]);                     // contours → section
  const body = ctx.extrude(plate, p.thickness);                     // section → solid on the bed
  const letters = ctx.extrude(ctx.cs(t.contours), 1, p.thickness);
  return { parts: [ctx.part(body, 'Plate', p.baseColor), ctx.part(letters, 'Text', p.textColor)].filter(Boolean) };
}
```

- Put parts that print as one object in the same `group` (one filament per part); give
  separate objects different groups. Use `role: 'preview'` for things shown but not
  exported (a pen in a pen topper).
- Return `diagnostics` for anything the user should know: `info` (how to print it),
  `warning` (probably not what they want), `error` (blocks export).
- Return `drawing` for laser and 2D output; the shell shows a Drawing view and offers SVG
  and DXF.
- Throwing is fine: the shell shows the message and keeps the last good model.

## Extra UI

```ts
ui(api) {
  const panel = api.panel({ title: 'Image' });
  const button = h('button', { class: 'pf-btn', onclick: async () => {
    const file = await api.host.openFile('image/*');
    if (!file) return;
    const prepared = await prepareImage(await decodePicked(file), file.name);
    if (prepared) api.setInput('image', prepared);
  } }, 'Choose image…');
  panel.append(button);
  return () => {/* teardown */};
}
```

`api.setInput` hands data that is not a parameter to the build (`ctx.inputs`) and keeps it
in project files and autosave. `api.onDrop` receives files dropped on the generator.

## Checks

`tools/tests/modules.test.ts` builds every module with its defaults and every preset,
validates the schema and presets, and requires a README. `pnpm test:browser` loads each
module in Chromium, builds, screenshots and exports.
