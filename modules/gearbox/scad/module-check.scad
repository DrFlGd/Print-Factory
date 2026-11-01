// module-check.scad - interference check for two magnetic module plates butted
// edge to edge: plate b turned `rot` degrees and shifted `shift` sockets along
// plate a's right edge. An empty result (the render reports no output) means the
// ridges, grooves and faces clear; gap = -0.2 pushes them into each other to
// show where they meet.
//
//   node tools/render.mjs scad/module-check.scad -o /tmp/m.stl -D a=3 -D b=5 -D rot=90 -D shift=1
size = "M2"; profile = "PETG"; overrides = []; joint = "jaws"; nut_fit = "press"; mod_magnets = "all";
a = 3; b = 5; rot = 0; shift = 0; gap = 0;
include <lib/standard.scad>
include <lib/gear.scad>
include <lib/jaws.scad>
include <lib/pin.scad>
include <lib/board.scad>
include <lib/modules.scad>
// plate b, turned `rot` about its own centre, against plate a's right edge, `shift` sockets up
intersection() {
    module_plate(a);
    translate([mod_size(a) + gap, shift * GRID, 0]) translate([mod_size(b) / 2, mod_size(b) / 2, 0]) rotate(rot) translate([-mod_size(b) / 2, -mod_size(b) / 2, 0]) module_plate(b);
}
