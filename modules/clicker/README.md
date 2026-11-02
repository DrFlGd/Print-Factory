# Image to Clicker

A clicker built round a real mechanical keyboard switch (Cherry MX or any clone with the same
plate fit and cross stem): press the cap and the switch clicks. Put your picture or some
letters on the cap, make one key or a row or grid of them, and add a keyring loop.

## Design

- **Picture:** choose or drop a PNG, JPG, WebP or SVG; Prepare the picture removes the
  background and reduces it to a few colours. Pick each colour's filament in **Picture
  colours**. **Follow the picture** cuts the cap round the picture's outline.
- **Text:** a letter, a word or a symbol. With several keys, separate them with commas
  (A,B,C) for one each. A symbol name between colons (`:heart:`) puts that symbol on a key.
- **Blocks:** one key per character of what you type: "Name" makes four keys. "/" starts
  the next row, a space is a blank key, and `:heart:` or `:arrow-big-up:` puts a symbol on a
  key. Lay them out in a **row**, a **column**, a **grid**, **WASD** or **Arrows** (one key
  over the middle of three), or **Custom**, where the rows are as you type them and "."
  leaves a gap.
- **Icon:** a symbol from the library on the cap.
- **Plain:** just the cap colour.
- **3D model:** your own STL, 3MF or OBJ made into a clicker (see below).

The design is inlaid flush in the cap, which prints face down, so it comes out smooth.

## Keys and body

One body holds every switch. Each key has a well that guides its cap and, under it, a 1.5 mm
plate with the standard 14 mm switch cutout and room for the switch's pins. The cap stands
proud of the body by about the switch travel, so a full press takes it flush. A cap must be
big enough to cover the switch (about 19 mm across inside the wall): it is grown if not.

Keyring: a **loop** tab on the side you choose, or a **hole** through a wide border.

## Fit

- **Cap clearance:** the gap round the cap in its well.
- **Stem clearance:** grows the cross socket in the cap (+ if it is hard to push on).
- **Plate cutout:** widens the 14 mm cutout if your switch will not click in.

## Assembly

Push a switch into each socket from above until its clips snap under the plate, then press
the cap onto the stem. No wiring: the switch just clicks.

## 3D model

Choose or drop an STL, 3MF or OBJ (up to 100 MB) in the **3D model** panel. Until you do,
a sample stands in: a toadstool, an acorn, an owl, a snowman or a cactus, sculpted for this
generator. On import the model is:

- welded into one surface;
- turned the right way out if it was inside out;
- joined into one solid where parts overlap;
- rebuilt from voxels if it has holes (150 across its longest side, with the surface put
  back where it was between them, so flat faces stay flat);
- simplified to 100,000 triangles;
- set on the bed.

Then you can:

- choose which of the file's axes points **up**;
- **turn** it about that axis;
- set its **size** (the longest side);
- **flatten** its bottom so it stands. Left at 0, a ball gets shaved just enough to stand.

There are three ways to make it click. **Ways to make it click** shows your model cut each
way, pulled apart, with what the moving piece weighs, and picks one for you when you load a
model: Slice if the switch fits, then Button, then Stand. Click a card to use that one.

- **Slice:** one level cut. The top half is the button and the bottom half holds the switch.
  The cut is placed nearest the middle with room for the switch, or you can set the height,
  or drag the orange plane on the 3D view (click it and the arrow keys move it 0.5 mm, 5 mm
  with Shift).
  At rest the top floats 4.35 mm up; a press closes the gap to 0.35 mm, so pressed, the
  model is whole. **Hide the gap** keeps 8 mm of the model's skin as a collar above the cut,
  and the top slides into it on a pillar. At rest you then see a groove instead of the
  switch, and the top cannot wobble.
- **Stand:** the model is left whole and rides on a plate that presses the switch, in a base
  like the picture clicker's. The plate is a circle, a square or the model's footprint.
  This one works with any model, however thin.
- **Button:** a round or square button is cut down into the model's top, flush or raised.
  The switch goes in through the button's bore, so the button is at least 23.5 mm round or
  16.6 mm square. It goes in the middle of the top if there is room there, otherwise on
  the widest high part, or wherever you place it.

The switch goes where it fits by itself: the deepest part of the model for Slice, the middle
of the plate for Stand. **Move switch** and **Turn switch** (under advanced) shift it from
there and turn it in 15° steps, for a model with a narrow part, or to face its pins a way you
like. If it no longer fits, you are told; a Stand plate grows to reach it.

Every moving piece is solid down to the switch post, so it prints upright with no supports.
The summary gives what each piece weighs printed with a 1 mm skin and 15% infill in PLA.

**Beside the layout** shows the clicker assembled or exploded: pulled apart with the switch
between the pieces, the way it goes together. Neither is exported.

Not ported: dished keycaps and walls between letter blocks, raised colour relief,
several switches under one big cap, per-edge fillets, knurled and ribbed block textures.

Feature set after the Vostok Labs Clicker Generator. Its switch and socket meshes were not
used: the switch fit is modelled from the published MX dimensions and written for Print
Factory.
