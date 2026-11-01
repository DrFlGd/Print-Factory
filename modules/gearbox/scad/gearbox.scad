// gearbox.scad - one entry point for every part. Works in the desktop OpenSCAD
// customizer and from the command line:
//   openscad -D 'size="M1.5"' -D 'part="gear"' -D teeth=40 -o G40.stl gearbox.scad
// BOSL2 must be on the library path (lib/BOSL2 in this repo, or your OpenSCAD
// libraries folder). Run `npm run render` to build the whole catalog.

/* [Part] */
part = "gear"; // [gear, compound, tile, knob, spacer, base_spacer, bushing, coupon, crank, handle, cap, pointer, dial_knob, pulley, link, ratchet, pawl, motor_mount, pinion, rail, carriage, rack, yoke, slider_post, cam, follower, geneva_driver, geneva_wheel, partial, qr_lever, escape_wheel, anchor, spring_gear, spring, winch, winch_flange, hook, ring, carrier, bracket, bevel, bevel_shaft, worm, worm_gear, nema_mount, flywheel, mag_gear, barrier, hex_sleeve, hex_core, hex_gear, hex_spacer, hex_lever, jaw_gear, joint_ring, handle_spacer, module_plate, assembly, coupler, post, joint]

/* [Size] */
// M2: module 2, 20 mm grid, M8 bolts, 608 bearings. M1.5: module 1.5, 15 mm grid, M6 bolts, 606 bearings.
// M1: module 1, 10 mm grid, M5 bolts, 605 bearings.
size = "M2"; // [M2, M1.5, M1]

/* [Joint] */
// How stacked parts join. jaws: three tapered jaws on each top face, pockets
// underneath, no hardware. pins: the legacy dowel pin holes. bolts: dowel pins
// plus a screw clamp (M3 for M2, M2.5 for M1.5, M2 for M1) on parts with room.
joint = "jaws";        // [jaws, pins, bolts]
// One face set apart from `joint` (the layout's kit export picks these per level):
joint_top = "auto";    // [auto, jaws, flat, pins] flat: nothing on the top face
joint_bottom = "auto"; // [auto, pockets, groove, flat, pins] groove: a free part above a jaw part

/* [Gear] */
teeth = 40;        // [20:10:80]
teeth_upper = 20;  // [20:10:80] compound only: the smaller gear on top
face = "solid";    // [solid, spokes, cross, holes, spiral]
magnets = "none";  // [none, top, bottom] gear: six magnet pockets in that face, for a magnetic slip coupling (40T and up)

/* [Tile] */
tile_nx = 4;       // [2:1:8]
tile_ny = 4;       // [2:1:8]
flip = false;      // tile, crank, pointer, carriage, rack, yoke: render print-ready (upside down)
// Nut pockets under a tile (and in the coupon): press holds the nut on three crush ribs
// (push it out again with a rod through the bolt hole); slip lets it drop in and out.
nut_fit = "press"; // [press, slip]

/* [Modules] */
mod_n = 5;         // [3:1:9] magnetic module plate (test): sockets a side; odd sizes carry a hub port gear of mod_n x 10 teeth in the centre
mod_magnets = "all"; // [all, centre] all: a magnet pair at every step of every edge; centre: every other step from the middle (odd plates centred on each other only)

/* [Spacer] */
spacer_h = 3;      // [1:0.5:30] 27 (M2) or 23 (M1.5) is the handle core

/* [Add-ons] */
throw = 40;        // [20:10:80] crank: post distance from the axis, mm
post_h = 11;       // [8:1:40] post height above the crank arm; 11 carries a bearing, 28 a handle
level = 1;         // [1:1:3] motor mounts: level of the pinion; rack: level of the teeth; yoke, slider post: level of the crank gear; ring: level of the planets
pulley_n = 40;     // [20:10:80] pulley diameter as a tooth count: MOD x n mm
holes = 3;         // [2:1:6] link: bearing seats, one grid step apart
hex_levels = 2;    // [0:1:4] hex sleeve and core: levels they span (1..4); hex spacer: empty levels it bridges (0..2)
flip_pawl = false; // pawl for a ratchet that locks the other way

/* [Mechanisms] */
rail_n = 4;        // [2:1:8] rail: sockets it spans
rack_len = 2;      // [2:1:4] rack: length in grid steps
reach = 3;         // [2:1:6] yoke: grid steps from the carriage centre to the crank pin
cam = "eccentric"; // [eccentric, heart, snail]
slots = 6;         // [6, 8] geneva: slots in the wheel
keep = "half";     // [half, quarter] partial gear: how much of the rim has teeth
d_steps = 3;       // [2:1:4] quick return: grid steps from the crank pin to the lever pivot
cw = true;         // anchor for an escape wheel that runs clockwise (seen from above); false mirrors it

/* [Magnets] */
poles = 16;        // [12, 16, 20, 24] magnetic gear: magnets in the rim; it meshes like a gear of 2.5 x poles teeth

/* [Drives] */
span = 4;          // [2:1:4] shaft bracket: sockets between its housings
shaft = "n20";     // [n20, nema17] pinion: which motor shaft it fits

/* [Assembly] */
kit = "joint";     // [joint, crank, pointer, motor, nema17, ratchet, linkage, rack, yoke, slider, cam, geneva, quickreturn, escapement, spring, winch, planetary, shaft, flywheel, maggear, magcouple, hexsleeve, jaws]
explode = 0;       // [0:1:1] 0 assembled, 1 exploded along each bolt
layer = "all";     // [all, printed, hardware]

/* [Print profile] */
profile = "PETG"; // [PLA, PETG, ABS]
// single fit overrides, e.g. [["bearing_bore_d", 22.2]]; the web app writes these
overrides = [];

include <lib/standard.scad>
include <lib/gear.scad>
include <lib/jaws.scad>
include <lib/pin.scad>
include <lib/board.scad>
include <lib/coupon.scad>
include <lib/addons.scad>
include <lib/motor.scad>
include <lib/mechanisms.scad>
include <lib/drives.scad>
include <lib/magnets.scad>
include <lib/hexsleeve.scad>
include <lib/modules.scad>
include <lib/assembly.scad>

// turn a part upside down for printing (cranks and pointers: hub ring up; carriages: flat top down)
module print_flip(on, h) { if (on) translate([0, 0, h]) mirror([0, 0, 1]) children(); else children(); }

if (part == "gear")             gear(teeth, face = face, magnets = magnets);
else if (part == "compound")    compound_gear(teeth, teeth_upper, face = face);
else if (part == "tile")        tile(tile_nx, tile_ny, flip = flip);
else if (part == "knob")        knob();
else if (part == "spacer")      spacer(spacer_h);
else if (part == "base_spacer") base_spacer();
else if (part == "coupler")     coupler_half();
else if (part == "joint_ring")  joint_ring();
else if (part == "handle_spacer") spacer(HANDLE_H + 1);
else if (part == "bushing")     bushing();
else if (part == "coupon")      coupon();
else if (part == "crank")       print_flip(flip, crank_top()) crank(throw);
else if (part == "post")        post(post_h);
else if (part == "joint")       joint();
else if (part == "handle")      handle();
else if (part == "cap")         cap();
else if (part == "pointer")     print_flip(flip, HUB_T) pointer();
else if (part == "dial_knob")   dial_knob();
else if (part == "pulley")      pulley(pulley_n);
else if (part == "link")        link(holes);
else if (part == "ratchet")     ratchet();
else if (part == "pawl")        pawl(flip_pawl);
else if (part == "motor_mount") motor_mount(level);
else if (part == "pinion")      pinion(20, shaft);
else if (part == "rail")        rail(rail_n);
else if (part == "carriage")    print_flip(flip, BASE_TOP) carriage();
else if (part == "rack")        print_flip(flip, rack_top(level)) rack_carriage(rack_len, level);
else if (part == "yoke")        print_flip(flip, yoke_top(level)) yoke(level, throw, reach);
else if (part == "slider_post") slider_post(level);
else if (part == "cam")         cam(cam);
else if (part == "follower")    follower();
else if (part == "geneva_driver") geneva_driver(slots);
else if (part == "geneva_wheel") geneva_wheel(slots);
else if (part == "partial")     partial_gear(teeth, keep == "quarter" ? 0.25 : 0.5);
else if (part == "qr_lever")    qr_lever(d_steps, throw);
else if (part == "escape_wheel") escape_wheel();
else if (part == "anchor")      anchor(cw);
else if (part == "spring_gear") spring_gear(teeth);
else if (part == "spring")      spring();
else if (part == "winch")       winch();
else if (part == "winch_flange") winch_flange();
else if (part == "hook")        hook();
else if (part == "ring")        print_flip(flip, ring_top(level)) planet_ring(level);
else if (part == "carrier")     carrier();
else if (part == "bracket")     bracket(span);
else if (part == "bevel")       bevel_pin(teeth);
else if (part == "bevel_shaft") bevel_shaft();
else if (part == "worm")        worm_part(span);
else if (part == "worm_gear")   worm_gear_part(teeth);
else if (part == "nema_mount")  nema_mount(level);
else if (part == "flywheel")    flywheel();
else if (part == "mag_gear")    mag_gear(poles);
else if (part == "barrier")     barrier();
else if (part == "hex_sleeve")  hex_sleeve(hex_levels);
else if (part == "hex_core")    hex_core(hex_levels);
else if (part == "hex_gear")    hex_gear(teeth, face);
else if (part == "hex_spacer")  hex_spacer(hex_levels);
else if (part == "hex_lever")   hex_lever(holes);
else if (part == "jaw_gear")    jaw_gear(teeth, face);
else if (part == "module_plate") module_plate(mod_n, flip = flip);
else if (part == "assembly")    assembly(kit, explode, layer);
else assert(false, str("unknown part: ", part));
