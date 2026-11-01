// fit-check.scad - interference checks for the face joint. Each case renders the
// intersection of two parts as they stack; an empty result (the render reports
// no output) means they clear. Turn the upper part a little (ang) or drop it
// (dz) to see where it bites: a jaw pair clears at 0 and collides by about 0.6
// degrees, a free gear on its groove clears at any angle.
//
//   node tools/render.mjs scad/fit-check.scad -o /tmp/fit.stl -D 'size="M1.5"' -D 'what="pair"' -D ang=0.6
//
// what: pair, free, compound, crank, crankknob, knob, pointer, dial, winch,
// pulley, wheel, esc, mag, fly. t1, t2: teeth of the lower and upper part.

size = "M2"; profile = "PETG"; overrides = []; joint = "jaws";
ang = 0; dz = 0; t1 = 40; t2 = 30; what = "pair";
include <lib/standard.scad>
include <lib/gear.scad>
include <lib/jaws.scad>
include <lib/pin.scad>
include <lib/board.scad>
include <lib/addons.scad>
include <lib/motor.scad>
include <lib/mechanisms.scad>
include <lib/drives.scad>
include <lib/magnets.scad>
T = GEAR_T;
if (what == "pair") intersection() { gear(t1); translate([0, 0, LEVEL + dz]) rotate(ang) gear(t2); }
if (what == "free") intersection() { gear(t1); translate([0, 0, LEVEL + dz]) rotate(ang) gear(t2, $joint_bottom = "groove"); }
if (what == "compound") intersection() { compound_gear(60, t1); translate([0, 0, 2 * LEVEL + dz]) rotate(ang) gear(t2); }
if (what == "crank") intersection() { gear(t1); translate([0, 0, T + dz]) rotate(ang) crank(40); }
if (what == "crankknob") intersection() { translate([0, 0, T]) crank(40); translate([0, 0, T]) knob(); }
if (what == "knob") intersection() { gear(t1); translate([0, 0, T]) knob(); }
if (what == "pointer") intersection() { gear(t1); translate([0, 0, T + dz]) rotate(ang) pointer(); }
if (what == "dial") intersection() { union() { gear(t1); translate([0, 0, T]) pointer(); } translate([0, 0, T]) dial_knob(); }
if (what == "winch") intersection() { gear(t1); translate([0, 0, LEVEL + dz]) rotate(ang) winch(); }
if (what == "pulley") intersection() { pulley(t1); translate([0, 0, LEVEL + dz]) rotate(ang) pulley(t2); }
if (what == "wheel") intersection() { gear(t1); translate([0, 0, LEVEL + dz]) rotate(ang) geneva_wheel(6); }
if (what == "esc") intersection() { escape_wheel(); translate([0, 0, LEVEL + dz]) rotate(ang) gear(t2); }
if (what == "mag") intersection() { mag_gear(16); translate([0, 0, LEVEL + dz]) rotate(ang) gear(t2); }
if (what == "fly") intersection() { gear(t1); translate([0, 0, LEVEL + dz]) rotate(ang) flywheel(); }
