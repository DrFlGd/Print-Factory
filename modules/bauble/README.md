# Bauble Maker

Ornaments for the tree and for other holidays, in three kinds:

- **Bauble:** hollow, in one piece, printed upright without supports, with a cap that screws
  onto its neck and a loop to hang it by.
- **Flat ornament:** printed flat, with a hanging loop and raised details in a second colour.
- **Tree topper:** a star printed flat that pushes, without glue, into a socket that sits over
  the tip of the tree.

## Bauble

**Shapes:** sphere, egg, teardrop, onion dome, lantern, spinning top, icicle, tree, bell and
jingle bell, or a custom outline (where the widest point is, and how full or pointed each end
is). Set the diameter and stretch it taller or squatter with Elongation.

**Round · 2 halves** is a true sphere instead, printed as two halves, rim down, in normal
mode. Every outside surface of a rim-down half faces up, so the relief covers it all; inside,
the wall thickens towards the ends so nothing overhangs (print with 15 % infill). A ring
pressed or glued inside the rims joins the halves, and a chamfer on each rim makes a neat
groove at the seam.

Nothing on a bauble leans further than the **max overhang** (45°, under Advanced). Where a
shape would, near its ends, the wall carries on as a cone at that angle down to a small **flat
base** and up to the neck. That is what lets it print upright with no supports.

**Print mode:**

- **Vase · relief:** print in vase (spiral) mode, a single wall. The pattern stands out of the
  wall by the relief depth, or sinks into it with *Engrave instead of emboss*. It covers the
  cones too: with a relief, the cones are made a little under the limit (*relief margin on
  cones*) to leave it room.
- **Lace · openwork:** a thicker wall printed normally, the pattern's lines left standing and
  the rest cut away. Patterns of separate motifs (snowflakes, hearts, pumpkins) are cut out of
  the wall instead, and lines that only join up one way get thin ribs to hold them together.
  *Engrave* always cuts the pattern out. Towards the ends, where the tiles get small, the holes
  shrink and stop. Make lines at least two line widths thick.

**Patterns** come in themes: Traditional, Japanese (asanoha, kikkō, kagome, shippō, seigaiha,
sakura, uroko, tachiwaki, yagasuri), Scandinavian, Art Deco, Oriental, Gothic, Geometric,
Halloween, Easter, Valentine's, Hanukkah, St Patrick's, Autumn and New Year. *Repeats around*
is how many times it goes round the widest point; the tiles stay square and shrink towards
the ends, the lines the same width everywhere. *Coverage* limits how far the pattern reaches
from the widest point.

**Logo or text:** up to three lines in any font, a symbol from the library, your own SVG, or a
PNG or JPG traced in the Picture panel. It's wrapped onto the front, embossed or engraved, with
the pattern kept clear around it.

**Neck and cap:** the cap is smooth, fluted or star-shaped, with a teardrop loop hole on top
(teardrop, so it prints without support). The thread is 2.5 mm pitch; *thread clearance* is
the play between the two. If the cap is tight, raise it by 0.05 mm.

**Light hole:** for a fairy light or an LED. *Top* goes through the cap, with the loop made
into an arch over it. *Side* goes through the back wall; in vase mode, which can't print
through a hole, it's a dimple to drill out.

**Mesh:** Fine has the most detail (twice what it had in 0.2.0) and builds slower; use it for the final
export.

**Slicer:** the notes under the model say what to set. In short: vase mode for the bauble
(0.5 mm line width, 3 bottom layers, a brim, since the foot is small), normal mode for the cap,
open end down.

## Flat ornament

Tree, snowflake, gingerbread, stocking, bell, jingle bell, star, heart, candy cane and
snowman, plus pumpkin, ghost, bat, Easter egg, bunny, shamrock, Star of David and maple leaf.
Set the height, thickness and edge rounding. The raised decoration (icing, stripes, faces, an
inner outline) and any name or logo print in a second colour:

- **AMS:** two parts in one object; the printer swaps.
- **No AMS:** the same two parts; add a pause where the decoration starts (the note gives the
  height) and swap by hand.
- **1 colour:** all one piece.

## Tree topper

Star, north star, radiant star or snowflake. The star prints flat with a tongue below it; the
socket prints upright on its mouth. The tongue pushes into a slot across the socket's head
(*fit clearance* each side; 0.1 mm is a firm push fit), and the socket's tapered bore slips
over the tree's top shoot (*tree tip* is that shoot's diameter at the socket's mouth).

## Credits

The feature set follows DSCMaker's bauble maker; this module is written from scratch, with no
code or artwork from it. The Japanese patterns are traditional designs.
