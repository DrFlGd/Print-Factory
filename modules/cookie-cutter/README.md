# Cookie Cutter Studio

Make printable baking tools from **104 ready shapes**, silhouette text, an imported SVG or a traced
raster image. The generator shares Print Factory's Manifold geometry worker, Picture preparation,
font catalogue, symbols, STL/3MF and SVG/DXF export, project files and share links. Geometry is
written independently for Print Factory; the attached app screenshots were the feature reference.

## Make

- **Cutter → Imprint cutter:** a cutting blade and a design press in one print. The cutting edge
  finishes at the selected height; the raised detail ends the chosen distance *behind* it.
  Instead of fragile one-point ribs, the marks now meet a continuous 1.8 mm rear support plate,
  bonded to the perimeter all around. It uses more filament but prevents isolated stamp pillars
  from snapping. The stamp can use filled marks or thin outlines, rounded/chamfered tips, and invert.
- **Cutter → Two-piece: cutter + nesting stamp:** prints **exactly two matching solids**: an open,
  sharp cookie outline, and a broad, solid, embossing cap. Use the cutter first. Then set the cap
  on the cutter's hand rim, with its raised details pointing down into the cookie. Its shallow
  inner locating ring centres the two pieces, while the flange stops it on the rim. Adjust
  **Stamp alignment clearance** (default 0.5 mm radially) if the fit is too tight or loose,
  and the embossing depth from the cutter edge to control how firmly the design presses.
  Print both parts broad-face down; no additional handle or separate little support ribs are
  required. This is the recommended mode for detailed cookies.
- **Cutter → Cutter only:** a clean cutting edge with no internal stamp. Choose wall thickness,
  a smoothly tapered cutting edge, a protective rim with a rounded shoulder into the
  main wall, a sandwich crimp ring, two press handles, stiffening bars, or grid/mirrored sets.
- **Embossing stamp:** when selected under Cookie shape, an additional flat design plate and
  separate push-fit handle are generated. Print the stamp design-face down, and push the
  handle peg into the rear socket.
- **Decorating stencil:** a thin framed plate with the silhouette cut through it. Where enclosed
  counters would be loose, bridges keep them attached.
- **Texture roller:** a hollow printable cylinder with repeated copies of the selected image
  wrapped around its circumference. Set diameter, length, number of repeats/rows, depth and
  axle/handle style. Print upright, with a brim.

## Cookie shape and outline

The ready-shape gallery is searchable and grouped into *Most popular*, Christmas, Winter,
Love and wedding, Birthday and baby, Easter and spring, Animals, Halloween, Plaques for names,
Geometric, and Basics and figures. The first 20 are popular seasonal silhouettes (gingerbread,
tree, star, snowflake, stocking, mitten, snowman, etc.). Much of the catalogue uses the existing
MIT-licensed filled-symbol library. Christmas tree, bell, stocking, Santa and gingerbread have dedicated solid, continuous
outlines with separately raised details; no internal holes are interpreted as extra blades.

You can instead choose **Text**, **SVG graphic** (closed filled paths) or **Picture**
(PNG/JPG/WebP/SVG through the shared tracing and background-removal tool). The source is stored
in Print Factory's project file, unlike the share link. Shape controls include the final longest
dimension in mm, width ratio, rotation, corner rounding and left-right mirror.

Text-shaped cutters use **short local bridges between disconnected letters**, rather than a
horizontal band through the word. In **Decorating stencil** mode letters stay visually separate:
short bridges are added only where required to retain enclosed counters (such as O, A and B).
Standalone text-on-cookie stamps have a solid backing and do not require letter joins.

Optional **Text on the cookie** prints a name or short message as part of the stamp.

## Alphabet A–Z

Export 26 letter-shaped cutters at the chosen font and height; optionally include nine Polish
characters (Ą, Ć, Ę, Ł, Ń, Ó, Ś, Ź, Ż) and digits 0–9.

- **Alphabet as 3MF:** a ZIP with one full-colour 3MF for each printer-sized plate. Each plate
  can be loaded into a slicer separately. Separate plates are needed because Print Factory's
  standard 3MF exporter does not yet encode multi-plate slicer projects.
- **Alphabet as ZIP of STL files:** individual STL files for each letter, arranged to fit on
  the requested printer bed.

These exports use a separate background worker and do not change the selected live design.

## Output

The normal Print Factory **Export** menu writes 3MF, STL, OBJ, SVG, DXF or all formats as ZIP.
The module also writes a **1:1 vector outline PDF**; it is never rescaled to fit an A4 sheet.
It uses a larger custom PDF page for an oversize outline, and includes a 100 mm reference line.
Print using 100% / Actual size. The normal share link retains parameter choices but not uploaded
images or SVGs; save a project file when using external artwork.

Turn on **Practice cookie** to print a 6 mm model alongside the cutter. The **Preview on dough**
option shows a non-exportable reference. **Nameplate** adds a printable plate with lettering.

## Smooth cutter wall transitions

The cutter's cookie-side outline stays fixed for dimensional accuracy. With **Thinner cutting
edge** enabled, the outside of the wall transitions continuously over the final 3 mm into a
0.6 mm blade, rather than stepping abruptly. The wide hand-safe rim has a flat gripping
section followed by a smooth shoulder into the normal wall. Both transitions are genuine
sloped mesh surfaces, not horizontal stacked bands, for cutter-only, combined imprint and
two-piece designs.

## Printing and food contact

Print cutters rim down, cutting edge up; print separate stamps flat-side down too.
Typically supports are unnecessary. For two-piece cutters, turn the cutter blade down
onto the cookie, then lower the stamp from the hand-rim side until the cap seats. 0.2 mm layers,
2–3 walls and no infill are a good starting point. PLA is suitable for occasional use, but
layer grooves can trap residue and bacteria. For repeated food contact use a suitable material,
food-safe manufacturing and cleaning process, and follow relevant local guidance. Always hand
wash in lukewarm water. PLA may soften in the dishwasher or above about 55–60°C.

The exact fit and recommended food-contact practices depend on the filament and print finish.
