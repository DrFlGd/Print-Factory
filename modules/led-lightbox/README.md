# Image LED Lightbox

Choose a PNG, JPG or WebP (or drop one on the page). **Prepare the picture** removes a flat
background, reduces it to one to six colours and traces both the outside shape and every
colour region in one pass. Cancel leaves the lightbox as it was; **Adjust…** reopens the
dialog while the picture is still loaded.

You get two printable objects, side by side on the plate:

- **The box:** a hollow shell with a solid back and a flat **LED ledge** inside the wall for
  glue-on LED strip, plus the cable exits you choose.
- **The diffuser:** a separate translucent cover with the same outline that glues to the
  top rim of the box, 0.6 to 3 mm thick. With **Print the picture's colours** on, each colour
  is a 0.4 mm inlay in its face with its own filament (two layers at 0.2 mm). The colours do
  not overlap the white face.

Saved projects keep the traced shape and colours, so the picture is not needed to rebuild or
export. To trace it differently after reopening a project, choose the picture again.

## Cable exits

- **Back**, **Right side** or **both**: as before; the back hole sits where the LED opening
  has the most room.
- **One** or **Two positioned side holes:** each has an angle seen from the front (0° right,
  90° top, 180° left, 270° bottom) and a position from 0 % (near the back) to 100 % (near the
  open front). Each hole only crosses the first wall in its direction, never the far side.

## Picture border

**White** or **Black** shrinks the picture uniformly inside a band of the chosen width, so the
outline is unchanged. White is part of the diffuser; black is its own 0.4 mm face part
(assign black filament).

## Registration lip

- **On diffuser:** a tongue under the cover fits inside the box.
- **On box:** a ridge on the rim fits a groove under the cover. The diffuser must be at least
  the lip height plus 0.55 mm thick.

Width, height and **clearance per side** apply to both. 0.15 to 0.2 mm is a reasonable first
test, but the fit depends on your printer and filament. With a lip, the cover prints face
down.

## Marquee lights

Through-holes in the diffuser for individual LEDs:

- **Outer silhouette:** a row following an inset of the outline, with or without a picture.
- **Black artwork border:** a row in the black band (pick a wide enough black border first).
- **Inside each colour section:** a row inside every colour region, like an illuminated
  sign. Neighbouring colours get their own rows.

Holes are spaced evenly by length round each outline; with several outlines the count is
shared out by perimeter. **Pattern shift** slides every hole along its outline in 0.1 mm
steps and wraps round. Layouts that cannot work (holes too near the wall, overlapping, no
colours, no room in the band) stop with a message rather than a misleading file. The box
itself is not drilled.

## Printing and safety

Print the diffuser in translucent white. Colour, brightness and the thinnest workable cover
depend on the filament, the printer and the LED spacing: test a small piece first. The box
is not a certified enclosure; fit, secure and wire the LEDs yourself and keep them within
their rated power.

Only the largest outside shape of the picture becomes the box; separate islands and very
small specks are left out. Very narrow parts of a silhouette may not have room for the
walls and the ledge.

Ported from Jerred's own Image LED Lightbox in Generator-Standalone.
