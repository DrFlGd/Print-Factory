// coupon.scad - the fit test coupon. One small print that checks every fit:
// two bolt sockets with nut pockets (one press fit, one slip), a dovetail pair
// with the key's crush ribs (two coupons chain key to slot), a bearing seat, a magnet
// pocket and the face joint: with jaws, three jaws on the bearing block that any
// gear's pockets drop over (M2 and M1.5; M1's block is too small); with pins, the
// pin holes (slip fit) and a press-fit pin hole. Print it with a knob and a
// spacer; try a bolt, a nut, a bearing, a magnet and a gear (or a dowel pin).

// Needs standard.scad, gear.scad, board.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

module coupon() {
    W = 2 * GRID; H = GRID;
    block = BEARING[1] + 8 * MOD; // bearing seat block, square
    union() {
    difference() {
        union() {
            // a two-socket strip, same section as a tile, with one male and one female key
            translate([0, 0, SKIRT_H]) cube([W, H, PLATE_T]);
            difference() {
                cube([W, H, SKIRT_H + EPS]);
                translate([WALL_T, WALL_T, -EPS]) cube([W - 2 * WALL_T, H - 2 * WALL_T, SKIRT_H + 3 * EPS]);
            }
            translate([GRID - RIB_T / 2, 0, 0]) cube([RIB_T, H, SKIRT_H + EPS]);
            for (i = [0 : 1]) translate([hole_pos(i), hole_pos(0), SKIRT_H]) socket_boss();
            translate([W, GRID / 2, 0]) rotate(-90) male_key();
            // bearing seat block behind the strip
            translate([0, H + 2, 0]) cube([block, block, GEAR_T]);
            translate([block / 2, H + 2 + block / 2, 0]) face_jaws(GEAR_T, block / 2);
        }
        // socket 0 takes the press-fit nut pocket (when nut_fit is press), socket 1 the slip fit
        translate([hole_pos(0), hole_pos(0), SKIRT_H]) socket_cut();
        translate([hole_pos(1), hole_pos(0), SKIRT_H]) socket_cut(press = false);
        translate([0, GRID / 2, 0]) rotate(90) female_slot();
        translate([block / 2, H + 2 + block / 2, 0]) {
            bearing_seat();
            translate([0, 0, GEAR_T]) top_cut(undef, block / 2);
        }
        // press-fit pin hole (for the pins' hub rings) and a magnet pocket in the strip's top, between the sockets
        if (!JAWS) translate([W / 2, H / 2 + GRID / 4 + 1, TILE_H - PIN_DEPTH]) cylinder(d = PIN_D + fit("pin_press"), h = PIN_DEPTH + EPS, $fn = 32);
        translate([W / 2, H / 2 - GRID / 4 - 1, TILE_H]) magnet_pockets(n = 1, r = 0);
    }
    if (NUT_PRESS) translate([hole_pos(0), hole_pos(0), SKIRT_H]) nut_ribs();
    }
}
