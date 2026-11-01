// drives.scad - phase 4c: a planetary set, a shaft bracket with a bevel pair and
// a worm, a NEMA 17 mount and a flywheel.
//
// Planetary: the carrier is a 60T gear with four posts on its top face; two
// (or four) standard 20T planets ride the posts on bearings, held by caps. A
// standard 20T sun sits on the same pin one level up, inside a 60T ring gear
// whose legs bolt into the sockets four steps away on either side, the socket
// head screws sunk in the leg tops so a gear over the ring can pass. Sun in,
// carrier out: 4:1, same direction. Drive the sun through a gear joined on
// top of it.
//
// Shaft bracket: a base bar along a socket row (bolt heads flush in hex
// pockets) with a bearing housing at each end carries a bolt as a horizontal
// shaft at the middle of level 4. A bevel gear on a pin two steps before the
// first housing turns the shaft through its mate; a worm between the housings
// turns a worm gear on a pin beside the bar (20T two rows away, 40T three).
//
// NEMA 17: like the N20 mount, two legs at (-2, 0) and (2, 0) and a plate the
// motor screws onto from below, shaft down into a 20T pinion with a 5 mm D bore.
//
// Flywheel: a disc on the gear hub with eight nut pockets around the rim for
// the mass.

// Needs standard.scad, gear.scad, addons.scad, motor.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

function drv_z(k) = BASE_SPACER_H + (k - 1) * LEVEL;   // bottom of level k above the plate

// Planetary -----------------------------------------------------------------------
PLN_SUN = 20; PLN_PLANET = 20; PLN_RING = PLN_SUN + 2 * PLN_PLANET;   // 60T ring
PLN_R = gear_pr(PLN_SUN) + gear_pr(PLN_PLANET);                       // planet centres: two grid steps
PLN_CARRIER = 60;                                                     // the posts sit inside its root circle
RING_OR = gear_pr(PLN_RING) + 1.25 * MOD + 4;                         // outer radius of the ring
RING_LEG = 4 * GRID;                                                  // leg sockets at (0, +-4)
function ring_top(level) = drv_z(level) + GEAR_T;
// the leg screw's head, sunk in the leg top: room for a DIN 912 socket head or an ISO 7380
// button head of the bolt size, and never under 10 mm across: [d, h]
RING_HEAD = sz([14, 8], [10.5, 6], [10, 5]);
RING_CB_D = RING_HEAD[0] + 0.6;
RING_LEG_D = max(LEG_D, RING_CB_D + 5);                               // 2.5 mm wall round the counterbore
function ring_cb_z(level) = ring_top(level) - RING_HEAD[1] - 0.5;     // floor of the leg's counterbore
// the leg screw: through the leg under the head, the plate and the captive nut
function ring_bolt(level) = ceil((ring_cb_z(level) + PLATE_T + NUT_H) / 5) * 5;

// The ring over the planets at `level` (2 or 3; the carrier is one level below).
// Prints upside down, legs up. Each leg takes a socket or button head screw sunk below its top,
// so nothing stands over the ring's level.
module planet_ring(level = 2) {
    assert(level >= 2 && level <= 3, "the ring sits over the planets at level 2 or 3");
    z0 = drv_z(level);
    bolt = BOLT[0] + fit("bolt_clear");
    cb = RING_CB_D; zc = ring_cb_z(level);
    difference() {
        union() {
            translate([0, 0, z0]) ring_gear(mod = MOD, teeth = PLN_RING, thickness = GEAR_T, or = RING_OR, pressure_angle = PA, backlash = fit("backlash"), anchor = BOTTOM);
            for (s = [-1, 1]) {
                translate([0, s * RING_LEG, 0]) cylinder(d = RING_LEG_D, h = z0 + GEAR_T);
                translate([-RING_LEG_D / 2, s > 0 ? RING_OR - 3 : -RING_LEG, z0]) cube([RING_LEG_D, RING_LEG - RING_OR + 3, GEAR_T]);
            }
        }
        for (s = [-1, 1]) translate([0, s * RING_LEG, 0]) {
            translate([0, 0, -EPS]) cylinder(d = bolt, h = z0 + GEAR_T + 2 * EPS);
            translate([0, 0, zc]) cylinder(d = cb, h = z0 + GEAR_T);
            // printed upside down the counterbore's floor is a roof: two 0.3 mm bridge steps
            // (a slot, then a square) carry it over the bolt hole without supports
            translate([-bolt / 2, -cb / 2, zc - 0.3]) cube([bolt, cb, 0.3 + EPS]);
            translate([-bolt / 2, -bolt / 2, zc - 0.6]) cube([bolt, bolt, 0.3 + EPS]);
        }
    }
}

// Carrier: a 60T gear with four planet posts. The post shoulder reaches through
// the 2 mm gap to the planet's bearing; a cap keyed by a steel dowel pin into each
// post top keeps the planet on and stays inside the 2 mm gap above it (a nut
// would stand into the next level).
module carrier() {
    hp = 3 + BEARING[2];
    difference() {
        union() {
            gear_blank(PLN_CARRIER);
            for (i = [0 : 3]) rotate(i * 90) translate([PLN_R, 0, GEAR_T - EPS]) {
                cylinder(d = POST_D + 2, h = 3 + EPS);
                cylinder(d = POST_D, h = hp - 0.5);
                translate([0, 0, hp - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
            }
        }
        bearing_seat();
        face_joints(GEAR_T, gear_rr(PLN_CARRIER), $joint_top = JAWS ? "flat" : "auto");   // the sun turns freely above it
        for (i = [0 : 3]) rotate(i * 90) translate([PLN_R, 0, GEAR_T + hp - PIN_L + 1.5 + 0.3]) cylinder(d = CAP_D, h = PIN_L, $fn = 32);
        for (i = [0 : 3]) rotate(45 + i * 90) translate([18 * MOD, 0, -EPS]) cylinder(d = 8 * MOD, h = GEAR_T + 2 * EPS);
    }
}

// Shaft bracket --------------------------------------------------------------------
SHAFT_H   = drv_z(4) + GEAR_T / 2;      // the shaft runs at the middle of level 4
HOUSING_T = BEARING[2] + 1;             // bearing pocket from outside, 1 mm ledge inside
HOUSING_W = BEARING[1] + 8;
BAR_T     = BOLT[2] + 0.7;              // bolt heads sit flush in the base bar
BEVEL_T   = 20;
BEVEL_D   = 2 * GRID;                   // bevel pin: two steps before the first housing
BEVEL_HUB = SHAFT_H - BEVEL_T * MOD / 2 - drv_z(1);   // hub height to the pitch base, so the apex lands on the shaft
WORM_D    = 2 * GRID;                   // worm pitch diameter: a 20T wheel two rows out, a 40T three
WORM_L    = 2 * GRID;
function bracket_len(span) = span * GRID;

module bracket(span = 4) {
    assert(span >= 2 && span <= 4, "span 2..4 sockets");
    L = bracket_len(span);
    bolt = BOLT[0] + fit("bolt_clear");
    af = BOLT[1] + fit("nut_clear");
    bore = bearing_bore(); ledge = BEARING[1] - 2;
    module housing(u) {
        hull() {
            translate([u - HOUSING_T / 2, -HOUSING_W / 2, 0]) cube([HOUSING_T, HOUSING_W, 1]);
            translate([u, 0, SHAFT_H]) rotate([0, 90, 0]) cylinder(d = HOUSING_W, h = HOUSING_T, center = true);
        }
    }
    difference() {
        union() {
            translate([-HOUSING_T / 2, -HOUSING_W / 2, 0]) cube([L + HOUSING_T, HOUSING_W, BAR_T]);
            housing(0); housing(L);
        }
        for (k = [1 : span - 1]) translate([k * GRID, 0, 0]) {
            translate([0, 0, -EPS]) cylinder(d = bolt, h = BAR_T + 2 * EPS);
            translate([0, 0, 0.7]) cylinder(d = af / cos(30), h = BAR_T, $fn = 6);
        }
        // bearing pockets open outward, a ledge on the inside touches only the outer race
        translate([-HOUSING_T / 2 - EPS, 0, SHAFT_H]) rotate([0, 90, 0]) cylinder(d = bore, h = BEARING[2] + EPS);
        translate([L + HOUSING_T / 2 + EPS, 0, SHAFT_H]) rotate([0, -90, 0]) cylinder(d = bore, h = BEARING[2] + EPS);
        for (u = [0, L]) translate([u - HOUSING_T, 0, SHAFT_H]) rotate([0, 90, 0]) cylinder(d = ledge, h = 2 * HOUSING_T);
    }
}

// Bevel gear on a pin, teeth up: a 20T or 40T spur gear at level 1 drives it, a tall
// hub carries the cone whose apex sits on the shaft. It fills its pin.
module bevel_pin(teeth = 20) {
    assert(teeth == 20 || teeth == 40, "bevel: 20 or 40 tooth spur");
    difference() {
        union() {
            gear_blank(teeth);
            cylinder(d = BEARING[1] + 6, h = BEVEL_HUB + EPS);
            translate([0, 0, BEVEL_HUB]) bevel_gear(mod = MOD, teeth = BEVEL_T, mate_teeth = BEVEL_T, spiral = 0, cutter_radius = 0, bottom = 1.5 * MOD, pressure_angle = PA, backlash = fit("backlash"), anchor = "pitchbase");
        }
        bearing_seat();
        translate([0, 0, BEARING[2] + 0.5]) cylinder(d = BOLT[0] + 1 + fit("bore_clear"), h = 100);
        bottom_cut(undef, gear_rr(teeth));
    }
}

// Its mate on the shaft: the cone toward the pin, a hub back to the first housing
// with a nut pocket that keys and clamps it. Prints hub down.
module bevel_shaft() {
    hub_l = BEVEL_D - gear_pr(BEVEL_T) - HOUSING_T / 2 - 0.5;
    af = BOLT[1] + fit("nut_clear");
    hub_d = af / cos(30) + 6;
    back_r = gear_pr(BEVEL_T) + 1.5 * MOD;
    difference() {
        union() {
            translate([0, 0, -hub_l]) cylinder(d = hub_d, h = hub_l - (back_r - hub_d / 2) + EPS);
            translate([0, 0, -(back_r - hub_d / 2)]) cylinder(d1 = hub_d, r2 = back_r, h = back_r - hub_d / 2 + EPS);
            bevel_gear(mod = MOD, teeth = BEVEL_T, mate_teeth = BEVEL_T, spiral = 0, cutter_radius = 0, bottom = 1.5 * MOD, pressure_angle = PA, backlash = fit("backlash"), anchor = "pitchbase");
        }
        translate([0, 0, -hub_l - EPS]) cylinder(d = BOLT[0] + fit("bore_clear"), h = 100);
        translate([0, 0, -hub_l - EPS]) cylinder(d = af / cos(30), h = NUT_H + 0.5, $fn = 6);
    }
}

// Worm between the housings: a hub the length of the gap between the two inner
// races, the thread in the middle, a nut pocket at one end that keys it to the
// bolt. Prints standing.
module worm_part(span = 4) {
    L = bracket_len(span) - HOUSING_T - 1;
    af = BOLT[1] + fit("nut_clear");
    hub_d = af / cos(30) + 6;
    difference() {
        union() {
            cylinder(d = hub_d, h = L);
            translate([0, 0, L / 2]) worm(mod = MOD, d = WORM_D, l = WORM_L, starts = 1, pressure_angle = PA, backlash = fit("backlash"), anchor = CENTER);
        }
        translate([0, 0, -EPS]) cylinder(d = BOLT[0] + fit("bore_clear"), h = L + 2 * EPS);
        translate([0, 0, -EPS]) cylinder(d = af / cos(30), h = NUT_H + 0.5, $fn = 6);
    }
}

// Worm gear on a pin at level 4, 20T or 40T, with the usual hub.
module worm_gear_part(teeth = 20) {
    assert(teeth == 20 || teeth == 40, "worm gear: 20 or 40 teeth");
    difference() {
        union() {
            worm_gear(mod = MOD, teeth = teeth, worm_diam = WORM_D, thickness = GEAR_T, profile_shift = 0, pressure_angle = PA, backlash = fit("backlash"), anchor = BOTTOM);
            face_jaws(GEAR_T, gear_rr(teeth) - 1);
        }
        bearing_seat();
        face_joints(GEAR_T, gear_rr(teeth) - 1);
    }
}

// NEMA 17 ------------------------------------------------------------------------
NEMA_W = 42.3; NEMA_HOLES = 31; NEMA_PILOT = 22; NEMA_SHAFT = 5;
NEMA_LEGS = [[-2, 0], [2, 0]];
NEMA_PLATE = 48; NEMA_PLATE_T = 4;
function nema_h(level) = BASE_SPACER_H + (level - 1) * LEVEL + GEAR_T + MOUNT_GAP + NEMA_PLATE_T;
module nema_mount(level = 1) {
    assert(SZ < 2, "the NEMA 17 mount is not made in M1: the motor is wider than its legs' sockets");
    assert(level >= 1 && level <= 3, "level 1..3");
    H = nema_h(level);
    bolt = BOLT[0] + fit("bolt_clear");
    arm_w = 12;
    difference() {
        union() {
            for (p = NEMA_LEGS) translate([p[0] * GRID, p[1] * GRID, 0]) cylinder(d = LEG_D, h = H);
            for (s = [-1, 1]) translate([s > 0 ? NEMA_PLATE / 2 - 1 : -2 * GRID, -arm_w / 2, 0]) cube([2 * GRID - NEMA_PLATE / 2 + 1, arm_w, H]);
            translate([-NEMA_PLATE / 2, -NEMA_PLATE / 2, H - NEMA_PLATE_T]) cube([NEMA_PLATE, NEMA_PLATE, NEMA_PLATE_T]);
            translate([0, 0, H - EPS]) linear_extrude(3) difference() { square(NEMA_PLATE, center = true); square(NEMA_W + 0.6, center = true); }
        }
        for (p = NEMA_LEGS) translate([p[0] * GRID, p[1] * GRID, -EPS]) cylinder(d = bolt, h = H + 2 * EPS);
        translate([0, 0, H - NEMA_PLATE_T - EPS]) cylinder(d = NEMA_PILOT + 0.6, h = NEMA_PLATE_T + 4);
        for (x = [-1, 1], y = [-1, 1]) translate([x * NEMA_HOLES / 2, y * NEMA_HOLES / 2, H - NEMA_PLATE_T - EPS]) {
            cylinder(d = 3.4, h = NEMA_PLATE_T + 2 * EPS, $fn = 20);
            cylinder(d = 6.5, h = 2.2, $fn = 24);
        }
    }
}

// Flywheel ------------------------------------------------------------------------
FLY_R = 2 * GRID - 2.5;
module flywheel() {
    af = BOLT[1] + fit("nut_clear");
    depth = SMALL ? NUT_H : NUT_H - 0.5;
    rp = FLY_R - 3 - af / cos(30) / 2;
    difference() {
        union() {
            cylinder(r = FLY_R, h = GEAR_T);
            face_jaws(GEAR_T, FLY_R - 2 - af / cos(30));   // the nut pockets come down from the top: they pass the jaw pockets' depth by 0.4 mm only
        }
        bearing_seat();
        face_joints(GEAR_T, FLY_R - 3 - af / cos(30), FLY_R - 2 - af / cos(30));
        for (i = [0 : 7]) rotate(22.5 + i * 45) translate([rp, 0, GEAR_T - depth]) cylinder(d = af / cos(30), h = depth + EPS, $fn = 6);
    }
}
