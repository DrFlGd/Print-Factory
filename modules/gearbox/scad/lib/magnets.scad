// magnets.scad - phase 5a: non-contact drives with disc magnets.
//
//   mag_gear(poles)   magnetic gear: a disc with `poles` magnets standing on edge in
//                     its rim, alternating north and south outward. Two of them on the
//                     grid mesh with a 1 mm air gap and turn like gears of 2.5 x poles
//                     teeth (12 poles = 30T, 16 = 40T, 20 = 50T, 24 = 60T), so the
//                     gear mesh rule holds: pole counts that add up to a multiple of 8
//                     land on the grid. Slips instead of stalling: a torque limiter.
//   barrier()         a 3 mm spacer with a thin flange: a fixed wall between the two
//                     gears of a magnetic face coupling (gear(..., magnets = "top") below,
//                     gear(..., magnets = "bottom") above) to show torque through a wall.
//
// Magnets: 6 x 3 mm discs for M2, 4 x 2 mm for M1.5 (MAGNET in gear.scad). Every
// pocket has a dot beside it where the north pole goes up (or outward).

// Needs standard.scad, gear.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

MAG_GAP  = 1.0;                              // air gap between two magnetic gears
MAG_WALL = 1.0;                              // rim outside the magnets
function mag_teeth(poles) = 2.5 * poles;     // the spur gear it behaves like
function mag_pr(poles)    = gear_pr(mag_teeth(poles));
function mag_r(poles)     = mag_pr(poles) - MAG_GAP / 2;                 // disc radius
function mag_slot_r(poles) = mag_r(poles) - MAG_WALL - (MAGNET[1] + fit("magnet_fit")) / 2;   // slot centre radius

module mag_gear(poles = 16) {
    assert(poles % 4 == 0 && poles >= 12 && poles <= 24, "magnetic gear: 12, 16, 20 or 24 poles");
    r = mag_r(poles); rs = mag_slot_r(poles);
    sw = MAGNET[0] + fit("magnet_fit");      // slot width along the rim: the magnet's diameter
    sd = MAGNET[1] + fit("magnet_fit");      // slot depth into the rim: the magnet's height
    depth = MAGNET[0] + 0.3;                 // the magnet stands on edge
    assert(rs - sd / 2 > PIN_R + PIN_D / 2 + 1, "magnetic gear: the slots reach the pin holes");
    difference() {
        union() {
            cylinder(r = r, h = GEAR_T);
            face_jaws(GEAR_T, rs - sd / 2 - 1);
        }
        bearing_seat();
        face_joints(GEAR_T, rs - sd / 2 - 1);
        for (i = [0 : poles - 1]) rotate(180 / poles + i * 360 / poles) {
            translate([rs - sd / 2, -sw / 2, GEAR_T - depth]) cube([sd, sw, depth + 1]);
            if (i % 2 == 0) translate([rs - sd / 2 - 1.8, 0, GEAR_T - 0.6]) cylinder(d = 1.6, h = 1, $fn = 12);   // dot: north pole outward
        }
        face_pattern(mag_teeth(poles), poles >= 16 ? "holes" : "solid");
    }
}

// Barrier: the spacer between the two bearings of a magnetic face coupling, with a
// thin flange that fills the 2 mm gap between the gears but touches neither.
BARRIER_R = MAGF_R + MAGNET[0] / 2 + 4;
module barrier() {
    id = BOLT[0] + fit("bore_clear");
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = SPACER_H);
            translate([0, 0, (SPACER_H - 0.8) / 2]) cylinder(r = BARRIER_R, h = 0.8);
        }
        translate([0, 0, -EPS]) cylinder(d = id, h = SPACER_H + 2 * EPS);
    }
}
