// assembly.scad - every kit put together, for the Parts tab's Assembly view.
//
//   assembly(kit, explode, layer)
//     kit      a catalog kit id (crank, motor, ..., joint, maggear, magcouple)
//     explode  0 assembled, 1 pulled apart along each bolt
//     layer    "printed" the printed parts, "hardware" bolts, nuts, bearings,
//              pins, screws, magnets and motors, "all" both
//
// The plate top is z = 0 and sockets sit on the grid at (GRID i, GRID j). A gear
// on level k has its bottom at lvl_z(k) - 1 and its bearing at lvl_z(k).

// Needs standard.scad, gear.scad, pin.scad, board.scad, addons.scad, motor.scad, mechanisms.scad, drives.scad, magnets.scad, hexsleeve.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

_EX = 7;
function gz(k) = lvl_z(k) - 1;                  // bottom of a gear on level k
function gtop(k) = gz(k) + GEAR_T;

// what to draw ---------------------------------------------------------------------
module asm_p() { if ($layer != "hardware") children(); }
module asm_h() { if ($layer != "printed") children(); }
module ex(i) { translate([0, 0, i * $explode * _EX]) children(); }
module at(i, j, z = 0) { translate([GRID * i, GRID * j, z]) children(); }

// hardware, drawn plainly -------------------------------------------------------------
module hw_bearing() asm_h() difference() {
    cylinder(d = BEARING[1], h = BEARING[2]);
    translate([0, 0, -1]) cylinder(d = BEARING[0], h = BEARING[2] + 2);
    translate([0, 0, BEARING[2] - 0.4]) difference() { cylinder(d = BEARING[1] - 2, h = 1); cylinder(d = BEARING[0] + 3, h = 1); }
}
module hw_hex(af, h, d) difference() { cylinder(d = af / cos(30), h = h, $fn = 6); translate([0, 0, -1]) cylinder(d = d, h = h + 2, $fn = 24); }
module hw_nut() asm_h() hw_hex(BOLT[1], NUT_H, BOLT[0]);
// bolt head up: z = 0 is the underside of the head, the shank runs down `len`
module hw_bolt(len) asm_h() { cylinder(d = BOLT[1] / cos(30), h = BOLT[2], $fn = 6); translate([0, 0, -len]) cylinder(d = BOLT[0], h = len + EPS, $fn = 24); }
module hw_bolt_up(len) mirror([0, 0, 1]) hw_bolt(len);     // head down, shank up
module hw_pin(l) asm_h() { translate([0, 0, 0.3]) cylinder(d = PIN_D, h = l - 0.6, $fn = 20); cylinder(d1 = PIN_D - 0.5, d2 = PIN_D, h = 0.3 + EPS, $fn = 20); translate([0, 0, l - 0.3]) cylinder(d1 = PIN_D, d2 = PIN_D - 0.5, h = 0.3, $fn = 20); }
module hw_screw(l) asm_h() difference() {   // socket head up, z = 0 the underside of the head
    union() { cylinder(d = SCREW_HEAD[0], h = SCREW_HEAD[1], $fn = 24); translate([0, 0, -l]) cylinder(d = SCREW_D, h = l + EPS, $fn = 16); }
    translate([0, 0, SCREW_HEAD[1] - 1.5]) cylinder(d = 2.5 / cos(30), h = 2, $fn = 6);
}
// a socket head screw as big as the ring leg's recess takes, head up, z = 0 the underside of the head
module hw_cap_screw(len) asm_h() difference() {
    union() { cylinder(d = RING_HEAD[0], h = RING_HEAD[1], $fn = 32); translate([0, 0, -len]) cylinder(d = BOLT[0], h = len + EPS, $fn = 24); }
    translate([0, 0, RING_HEAD[1] - 0.6 * BOLT[0]]) cylinder(d = 0.75 * BOLT[0] / cos(30), h = BOLT[0], $fn = 6);
}
module hw_m3nut() asm_h() hw_hex(SCREW_NUT[0], SCREW_NUT[1], SCREW_D);
module hw_magnet() asm_h() cylinder(d = MAGNET[0], h = MAGNET[1], $fn = 24);

// a standard pin: base spacer, a bearing on each level in `levels`, spacers between,
// the knob (or dial knob) on top, the bolt through it all into the captive nut.
module std_pin(levels, knob = "knob", bolt = true) {
    top = max(levels); first = min(levels);
    asm_p() ex(0.6) base_spacer();
    if (first > 1) asm_p() ex(0.8) translate([0, 0, BASE_SPACER_H]) spacer(lvl_z(first) - BASE_SPACER_H);
    for (k = levels) ex(2 * k + 0.7) translate([0, 0, lvl_z(k)]) hw_bearing();
    for (n = [0 : len(levels) - 2]) if (len(levels) > 1) let(a = levels[n], b = levels[n + 1])
        asm_p() ex(2 * a + 1.3) translate([0, 0, lvl_z(a) + BEARING[2]]) spacer(lvl_z(b) - lvl_z(a) - BEARING[2]);
    zk = lvl_z(top) + BEARING[2];
    if (knob == "knob") asm_p() ex(2 * top + 2) translate([0, 0, zk]) knob();
    if (knob == "dial") asm_p() ex(2 * top + 2) translate([0, 0, zk]) dial_knob();
    if (bolt) {
        dz = knob == "dial" ? DIAL_Z0 - KNOB_BOSS_H : 0;   // the dial knob stands taller over jaws
        ex(2 * top + 3.5) translate([0, 0, zk + KNOB_BOSS_H + KNOB_FLOOR + dz]) hw_bolt(knob == "dial" ? dial_bolt(top) : stock_bolt(top));
        ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
    }
}
// a bolt and nut through something `h` thick standing on the plate (rail tab, mount leg), knob on top
module leg_pin(h) {
    asm_p() ex(2) translate([0, 0, h]) knob();   // the knob's boss presses the leg top
    zh = h + KNOB_BOSS_H + KNOB_FLOOR;           // under the bolt head
    ex(3.5) translate([0, 0, zh]) hw_bolt(ceil((zh + PLATE_T + NUT_H) / 5) * 5);
    ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
}
module asm_tile(i0, j0, nx, ny) asm_p() ex(-0.8) translate([GRID * i0 - GRID / 2, GRID * j0 - GRID / 2, -TILE_H]) tile(nx, ny);

// two stacked gears joined: nothing with jaws (they are part of the gears); with
// pins three dowel pins, and with bolts also three screws with nuts and the joint
// ring when both gears have room. Call at the pin, k = the lower level.
module joint_hw(k, t_lower, t_upper) if (!JAWS) {
    for (a = [0, 120, 240]) rotate(a) translate([PIN_R, 0, gtop(k) - PIN_DEPTH + 0.2]) ex(2 * k + 1.5) hw_pin(PIN_L);
    if (JOINT == "bolts" && has_screws(gear_rr(t_lower)) && has_screws(gear_rr(t_upper))) {
        asm_p() ex(2 * k + 1.2) translate([0, 0, gtop(k) + 0.1]) joint_ring();
        for (a = [90, 210, 330]) rotate(a) translate([SCREW_R, 0, 0]) {
            ex(2 * k + 4) translate([0, 0, gtop(k + 1) - SCREW_HEAD[1] - 0.2]) hw_screw(SCREW_L);
            ex(2 * k - 0.8) translate([0, 0, gz(k) + SCREW_NUT_UP]) hw_m3nut();
        }
    }
}
// a crank or pointer hub ring with pins: three short pins pressed into the ring (jaws: none)
module hub_pins(k) if (!JAWS) for (a = [0, 120, 240]) rotate(a) translate([PIN_R, 0, gtop(k) - PIN_DEPTH + 0.1]) ex(2 * k + 1.4) hw_pin(PIN_HUB_L);
// a cap on a printed post top at z, keyed by a pin
module post_cap(z, i = 9) { asm_p() ex(i) translate([0, 0, z]) cap(); ex(i + 1) translate([0, 0, z + 1.5 - PIN_L + 0.3]) hw_pin(PIN_L); }

// a crank on the top face of a gear at level k, its bolt post carrying `rides`
// ("bearing" for a link or slot, "handle" for the grip)
module crank_on(k, throw, rides = "handle") {
    z0 = gtop(k);
    asm_p() ex(2 * k + 1.6) translate([0, 0, z0]) crank(throw);
    hub_pins(k);
    translate([throw, 0, 0]) {
        ex(2 * k + 1.2) translate([0, 0, z0]) hw_bolt_up(crank_bolt(rides == "handle"));
        zt = z0 + crank_top();
        if (rides == "handle") {
            asm_p() ex(2 * k + 2.4) translate([0, 0, zt]) spacer(HANDLE_H + 1);
            asm_p() ex(2 * k + 3.2) translate([0, 0, zt + 0.5]) handle();
            ex(2 * k + 4.4) translate([0, 0, zt + HANDLE_H + 1]) hw_nut();
        } else {
            ex(2 * k + 2.6) translate([0, 0, zt]) hw_bearing();
            ex(2 * k + 4) translate([0, 0, zt + BEARING[2]]) hw_nut();
        }
    }
}
function cc_int(c1, r1, c2, r2, s = 1) = let(d = norm(c2 - c1), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = sqrt(max(0, r1 * r1 - a * a)), m = c1 + a * (c2 - c1) / d)
    m + s * h * [-(c2 - c1)[1], (c2 - c1)[0]] / d;
module link_between(a, b, k, holes) {   // a link on level k with its first hole at a, pointing at b
    translate([a[0], a[1], gz(k)]) rotate(atan2(b[1] - a[1], b[0] - a[0])) children();
}

// the kits --------------------------------------------------------------------------
module asm_joint() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1, 2]);
    asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "spokes");
    asm_p() ex(4.6) translate([0, 0, gz(2)]) rotate(JAWS ? 0 : 60) gear(40, "spokes");   // screws: counterbores over nut pockets
    joint_hw(1, 40, 40);
}
module asm_crank() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1]);
    asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "spokes");
    crank_on(1, 60, "handle");
}
module asm_pointer() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1], knob = "dial");
    asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "spokes");
    asm_p() ex(3.4) translate([0, 0, gtop(1)]) pointer();
    hub_pins(1);
}
module asm_motor() {
    asm_tile(-1, -1, 7, 4);
    at(1, 0) {
        asm_p() ex(0.5) motor_mount(1);
        asm_p() ex(-0.2) translate([0, 0, lvl_z(1)]) pinion(20, "n20");
        H = mount_h(1);
        for (p = MOUNT_LEGS) translate([p[0] * GRID, p[1] * GRID, 0]) leg_pin(H);
        asm_h() ex(4) translate([-N20_W / 2, -N20_H / 2, H]) { cube([N20_W, N20_H, 24]); translate([N20_W / 2, N20_H / 2, -N20_SHAFT_L]) cylinder(d = N20_SHAFT_D, h = N20_SHAFT_L); }
    }
    at(4, 0) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "spokes"); }
}
module asm_nema17() {
    asm_tile(-1, -1, 7, 7);
    at(2, 1) {
        asm_p() ex(0.5) nema_mount(1);
        asm_p() ex(-0.2) translate([0, 0, lvl_z(1)]) pinion(20, "nema17");
        H = nema_h(1);
        for (p = NEMA_LEGS) translate([p[0] * GRID, p[1] * GRID, 0]) leg_pin(H);
        asm_h() ex(4) translate([0, 0, H]) { translate([-NEMA_W / 2, -NEMA_W / 2, 0]) cube([NEMA_W, NEMA_W, 40]); translate([0, 0, -20]) cylinder(d = NEMA_SHAFT, h = 20); }
        for (x = [-1, 1], y = [-1, 1]) ex(3) translate([x * NEMA_HOLES / 2, y * NEMA_HOLES / 2, H - NEMA_PLATE_T + 2.2]) mirror([0, 0, 1]) asm_h() { cylinder(d = 5.5, h = 3, $fn = 16); translate([0, 0, -8]) cylinder(d = 3, h = 8, $fn = 12); }
    }
    at(2, 4) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "spokes"); }
}
module asm_ratchet() {
    asm_tile(-1, -1, 4, 3);
    at(0, 0) { std_pin([1], bolt = true); asm_p() ex(2) translate([0, 0, lvl_z(1)]) pawl(); }
    at(2, 0) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) ratchet(); }
}
module asm_linkage() {
    O = [0, 0]; R = [3 * GRID, 0];
    th = 40; Cp = O + th * [cos(100), sin(100)];
    J = cc_int(Cp, 3 * GRID, R, 2 * GRID, 1);
    asm_tile(-1, -1, 5, 4);
    std_pin([1]);
    asm_p() ex(2) translate([0, 0, gz(1)]) rotate(100) gear(40, "spokes");   // turned with the crank: its jaws in the crank's slots
    rotate(100) crank_on(1, th, "bearing");
    asm_p() ex(6.5) link_between(Cp, J, 3) link(4);
    at(3, 0) std_pin([4]);
    asm_p() ex(8.5) link_between(R, J, 4) link(3);
    translate([J[0], J[1], 0]) {
        asm_p() ex(5.5) translate([0, 0, lvl_z(3) - 2.5]) joint();
        ex(6.6) translate([0, 0, lvl_z(3)]) hw_bearing();
        asm_p() ex(7.5) translate([0, 0, lvl_z(3) + BEARING[2]]) spacer(SPACER_H);
        ex(8.6) translate([0, 0, lvl_z(4)]) hw_bearing();
        post_cap(lvl_z(3) + 2 * BEARING[2] + SPACER_H, 10);
    }
}
module rail_on_row(n) {   // a rail along +x from (0, 0) over n sockets, tabs on the row above
    asm_p() ex(0.4) rail(n);
    for (x = [0, (n - 1) * GRID]) translate([x, GRID, 0]) leg_pin(RAIL_T);
}
module asm_rack() {
    asm_tile(-1, -3, 5, 5);
    rail_on_row(4);
    asm_p() ex(1.6) translate([1.5 * GRID, 0, 0]) rack_carriage(2, 1);
    at(1, -2) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) gear(20); }
}
// A 20 mm crank swings the carriage 40 mm: a 7 socket rail holds that travel in every size,
// and reach 6 keeps the carriage and the rail's end clear of the crank gear's rim. A 30T,
// as a 20T in M1 is too small for the crank's jaws.
module asm_yoke() {
    asm_tile(-1, -2, 13, 4);
    rail_on_row(7);
    px = 9 * GRID; c = px - 6 * GRID;
    asm_p() ex(1.6) translate([c, 0, 0]) carriage();
    asm_p() ex(3) translate([c, 0, 0]) yoke(1, 20, 6);
    at(9, 0) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) rotate(90) gear(30); rotate(90) crank_on(1, 20, "bearing"); }
}
// Crank slider: the crank's 30T gear on level 2 runs above the rail, the carriage
// and the tab knobs (a 20T is too small for a crank in M1); it sits three sockets
// past the end of a 7-socket rail and a 7-hole link reaches the post, so in every
// size the carriage keeps its whole stroke on the rail and the post and the tab
// knobs stay clear of the crank. `phi` turns the crank (90: pin at +y).
SL_RAIL = 7; SL_LINK = 7; SL_THROW = 20; SL_GEAR = 30;
SL_CRANK = SL_RAIL + 2;     // the crank's socket along the row
module asm_slider(phi = 120) {
    px = SL_CRANK * GRID; LL = (SL_LINK - 1) * GRID;
    P = [px + SL_THROW * cos(phi), SL_THROW * sin(phi)];
    c = P[0] - sqrt(LL * LL - P[1] * P[1]);
    asm_tile(-1, -2, 6, 5); asm_tile(5, -2, 6, 5);
    rail_on_row(SL_RAIL);
    asm_p() ex(1.6) translate([c, 0, 0]) carriage();
    asm_p() ex(3) translate([c, 0, 0]) slider_post(2);
    at(SL_CRANK, 0) { std_pin([2]); asm_p() ex(4) translate([0, 0, gz(2)]) rotate(phi) gear(SL_GEAR); rotate(phi) crank_on(2, SL_THROW, "bearing"); }
    asm_p() ex(8.5) link_between(P, [c, 0], 4) link(SL_LINK);
    translate([c, 0, 0]) { ex(8.6) translate([0, 0, lvl_z(4)]) hw_bearing(); post_cap(lvl_z(4) + BEARING[2], 10); }
}

// The cam on level 2, pinned to the 30T under it that turns it (the cam is too
// small for the jaws); the follower on level 2 two sockets away, its output post's
// bearing on level 3; a rubber band from the tail to a pin two sockets back and
// one over pulls the nose onto the cam.
module asm_cam() {
    asm_tile(-3, -1, 6, 3);
    D = 2 * GRID; L = FOLLOWER_A; Rn = CAM_R0 + NOSE_R;
    phi = acos((D * D + L * L - Rn * Rn) / (2 * D * L));
    at(0, 0) {
        std_pin([2]);
        asm_p() ex(4) translate([0, 0, gz(2)]) rotate(phi) follower();
        rotate(phi) translate([-FOLLOWER_POST, 0, 0]) {
            z0 = gz(2) + FOLLOWER_POST_H + FOLLOWER_BOSS;
            ex(3.2) translate([0, 0, gz(2)]) hw_bolt_up(follower_bolt());
            ex(5.4) translate([0, 0, z0]) hw_bearing();
            ex(6.6) translate([0, 0, z0 + BEARING[2]]) hw_nut();
        }
    }
    at(2, 0) {
        std_pin([1, 2]);
        asm_p() ex(2) translate([0, 0, gz(1)]) gear(30, $joint_top = "pins");
        for (a = [0, 120, 240]) rotate(a) translate([PIN_R, 0, gtop(1) - PIN_DEPTH + 0.2]) ex(3) hw_pin(PIN_L);
        asm_p() ex(4) translate([0, 0, gz(2)]) cam("eccentric");
    }
    at(-2, 1) std_pin([2]);
    // the band, drawn as two strands from the tail hole round the anchor's bearing
    t = [cos(phi) * FOLLOWER_BAND[0] - sin(phi) * FOLLOWER_BAND[1], sin(phi) * FOLLOWER_BAND[0] + cos(phi) * FOLLOWER_BAND[1]];
    a = [-2 * GRID, GRID]; z = gz(2) + GEAR_T / 2; dv = a - t; nv = [-dv[1], dv[0]] / norm(dv) * (BEARING[1] / 2 + 0.6);
    asm_h() ex(4) for (s = [-1, 1]) hull() { translate([t[0], t[1], z]) sphere(d = 1.6, $fn = 8); translate([a[0] + s * nv[0], a[1] + s * nv[1], z]) sphere(d = 1.6, $fn = 8); }
}
module asm_geneva() {
    asm_tile(-1, -1, 5, 3);
    std_pin([1, 2]);
    asm_p() ex(2) translate([0, 0, gz(1)]) rotate(180) geneva_driver(6);
    at(3, 0) { std_pin([2]); asm_p() ex(4) translate([0, 0, gz(2)]) rotate(150) geneva_wheel(6); }
}
module asm_quickreturn() {
    asm_tile(-1, -1, 5, 3);
    th = 20; D = 3 * GRID;
    std_pin([1]);
    asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "spokes");
    crank_on(1, th, "bearing");
    at(3, 0) { std_pin([3]); asm_p() ex(6) translate([0, 0, gz(3)]) rotate(180) qr_lever(3, th); }
}
module asm_escapement() {
    asm_tile(-1, -1, 3, 5);
    at(0, 0) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) escape_wheel(); }
    at(0, 2) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) anchor(true); }
    af = BOLT[1];
    ex(3) translate([0, 2 * GRID + 2.5 * GRID - af / 2 - 2, gz(1) + 0.5]) hw_nut();
}
module asm_spring() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1], knob = "none", bolt = false);
    asm_p() ex(2) translate([0, 0, gz(1)]) spring_gear(60);
    asm_p() ex(3.4) translate([0, 0, lvl_z(1) + BEARING[2]]) spring();
    zk = lvl_z(1) + BEARING[2] + 2 + SPR_H - 2;
    asm_p() ex(5) translate([0, 0, zk + 2]) knob();
    ex(6.5) translate([0, 0, zk + 2 + KNOB_BOSS_H + KNOB_FLOOR]) hw_bolt(stock_bolt(2));
    ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
}
module asm_winch() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1, 2]);
    asm_p() ex(2) translate([0, 0, gz(1)]) winch();
    asm_p() ex(4.5) translate([0, 0, gz(1) + WINCH_H]) winch_flange();
    asm_p() ex(2) translate([WINCH_FLANGE_R + 12, 0, 0]) rotate([90, 0, 0]) hook();
}
module asm_planetary() {
    asm_tile(-2, -5, 5, 11);
    std_pin([1, 2, 3]);
    asm_p() ex(2) translate([0, 0, gz(1)]) carrier();
    asm_p() ex(4) translate([0, 0, gz(2)]) gear(20);
    asm_p() ex(6) translate([0, 0, gz(3)]) gear(20);
    joint_hw(2, 20, 20);
    for (s = [-1, 1]) translate([s * PLN_R, 0, 0]) {
        ex(4.7) translate([0, 0, lvl_z(2)]) hw_bearing();
        asm_p() ex(4) translate([0, 0, gz(2)]) rotate(9) gear(20);
        post_cap(gtop(1) + 3 + BEARING[2], 6.5);
    }
    asm_p() ex(8) planet_ring(2);
    for (s = [-1, 1]) at(0, s * 4) {   // socket head screws sunk in the leg tops
        ex(9) translate([0, 0, ring_cb_z(2)]) hw_cap_screw(ring_bolt(2));
        ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
    }
}
module asm_shaft() {
    asm_tile(-1, -1, 8, 5);
    bx = 2 * GRID; L = bracket_len(4);
    std_pin([1], knob = "none", bolt = false);
    asm_p() ex(2) translate([0, 0, gz(1)]) bevel_pin(40);
    ex(1) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
    translate([bx, 0, 0]) {
        asm_p() ex(0.5) bracket(4);
        for (k = [1 : 3]) translate([k * GRID, 0, 0]) { ex(2) translate([0, 0, 0.7]) hw_bolt_up(stock_bolt(1)); ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut(); }
        for (u = [0, L]) ex(3) translate([u + (u == 0 ? -HOUSING_T / 2 : HOUSING_T / 2 - BEARING[2]), 0, SHAFT_H]) rotate([0, 90, 0]) translate([0, 0, 0]) hw_bearing();
        asm_p() ex(4) translate([HOUSING_T / 2 + 0.5, 0, SHAFT_H]) rotate([0, 90, 0]) worm_part(4);
        sl = ceil((L + HOUSING_T + 0.5 + NUT_H + 1) / 10) * 10;
        ex(6) translate([L + HOUSING_T / 2, 0, SHAFT_H]) rotate([0, 90, 0]) hw_bolt(sl);       // head outside the far housing
        ex(4.8) translate([HOUSING_T / 2 + 0.75, 0, SHAFT_H]) rotate([0, 90, 0]) hw_nut();      // keys the worm
    }
    ex(2.6) translate([BEVEL_D - HOUSING_T / 2 - 0.75, 0, SHAFT_H]) rotate([0, -90, 0]) hw_nut();  // keys the bevel's hub
    asm_p() ex(3.5) translate([gear_pr(BEVEL_T), 0, SHAFT_H]) rotate([0, -90, 0]) bevel_shaft();
    at(4, 3) { std_pin([4]); asm_p() ex(8) translate([0, 0, gz(4)]) worm_gear_part(40); }
}
module asm_flywheel() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1]);
    asm_p() ex(2) translate([0, 0, gz(1)]) flywheel();
    af = BOLT[1] + fit("nut_clear");
    for (i = [0 : 7]) rotate(22.5 + i * 45) translate([FLY_R - 3 - af / cos(30) / 2, 0, 0]) ex(3.5) translate([0, 0, gtop(1) - (SMALL ? NUT_H : NUT_H - 0.5)]) hw_nut();
}
module mag_set(poles, rot = 0) {   // magnets standing in the slots, alternating
    rs = mag_slot_r(poles);
    for (i = [0 : poles - 1]) rotate(rot + 180 / poles + i * 360 / poles) translate([rs, 0, gtop(1) - MAGNET[0] - 0.3 + MAGNET[0] / 2]) ex(3) rotate([0, 90, 0]) translate([0, 0, -MAGNET[1] / 2]) hw_magnet();
}
module asm_maggear() {
    asm_tile(-1, -1, 6, 3);
    std_pin([1]);
    asm_p() ex(2) translate([0, 0, gz(1)]) mag_gear(16);
    mag_set(16);
    at(4, 0) { std_pin([1]); asm_p() ex(2) translate([0, 0, gz(1)]) rotate(180 / 16) mag_gear(16); rotate(180 / 16) mag_set(16); }
}
module asm_magcouple() {
    asm_tile(-1, -1, 3, 3);
    asm_p() ex(0.6) base_spacer();
    ex(2.7) translate([0, 0, lvl_z(1)]) hw_bearing();
    asm_p() ex(2) translate([0, 0, gz(1)]) gear(40, "solid", "top");
    asm_p() ex(3.3) translate([0, 0, lvl_z(1) + BEARING[2]]) barrier();
    ex(4.7) translate([0, 0, lvl_z(2)]) hw_bearing();
    asm_p() ex(4.6) translate([0, 0, gz(2)]) gear(40, "solid", "bottom");
    for (i = [0 : MAGF_N - 1]) rotate(i * 360 / MAGF_N) translate([MAGF_R, 0, 0]) {
        ex(2.8) translate([0, 0, gtop(1) - MAGNET[1]]) hw_magnet();
        ex(4.2) translate([0, 0, gz(2)]) hw_magnet();
    }
    zk = lvl_z(2) + BEARING[2];
    asm_p() ex(6) translate([0, 0, zk]) knob();
    ex(7.5) translate([0, 0, zk + KNOB_BOSS_H + KNOB_FLOOR]) hw_bolt(stock_bolt(2));
    ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
}

// hex sleeve: one stack on a 4-level sleeve (gear, gear, an empty level, lever)
// turning together, meshing with two free standard gears on the next pin; the
// lever sits above that pin's knob
module hw_small_bearing(b) asm_h() difference() { cylinder(d = b[1], h = b[2]); translate([0, 0, -1]) cylinder(d = b[0], h = b[2] + 2); }
module asm_hexsleeve() {
    n = 4; h = hex_sleeve_h(n); z0 = gz(1); b = HEX_BEARING;
    asm_tile(-1, -1, 6, 3);
    asm_p() ex(0.6) base_spacer();
    ex(0.9) translate([0, 0, z0 + HEX_FLANGE]) hw_small_bearing(b);
    asm_p() ex(1.6) translate([0, 0, z0]) hex_sleeve(n);
    asm_p() ex(2.4) translate([0, 0, z0 + HEX_FLANGE + b[2]]) hex_core(n);
    ex(3) translate([0, 0, z0 + h - b[2]]) hw_small_bearing(b);
    asm_p() {
        ex(3.6) translate([0, 0, lvl_z(1)]) hex_gear(40, "spokes");
        ex(4.2) translate([0, 0, lvl_z(1) + HEX_GEAR_T]) hex_spacer(0);
        ex(4.8) translate([0, 0, lvl_z(2)]) hex_gear(30);
        ex(5.4) translate([0, 0, lvl_z(2) + HEX_GEAR_T]) hex_spacer(1);
        ex(6) translate([0, 0, lvl_z(4)]) rotate(120) hex_lever(4);
    }
    for (i = [2, 3]) ex(6.6) rotate(120) translate([i * GRID, 0, lvl_z(4)]) hw_bearing();
    zk = z0 + h;
    asm_p() ex(7.2) translate([0, 0, zk]) knob();
    ex(8.4) translate([0, 0, zk + KNOB_BOSS_H + KNOB_FLOOR]) hw_bolt(stock_bolt(n));
    ex(-1.5) translate([0, 0, -PLATE_T - NUT_H]) hw_nut();
    at(3, 0) {   // free gears: the upper one's groove clears the lower one's jaws
        std_pin([1, 2]);
        asm_p() ex(2) translate([0, 0, gz(1)]) rotate(180 / 20) gear(20);
        asm_p() ex(4) translate([0, 0, gz(2)]) rotate(180 / 30) gear(30, $joint_bottom = JAWS ? "groove" : "auto");
    }
}

// straight jaw gears (the v0.10.0 test): three on one pin, each on its own bearing, joined by the jaws
module asm_jaws() {
    asm_tile(-1, -1, 3, 3);
    std_pin([1, 2, 3]);
    asm_p() for (k = [1 : 3]) ex(2 * k) translate([0, 0, gz(k)]) jaw_gear([40, 30, 20][k - 1], "spokes");
}

ASSEMBLIES = ["joint", "crank", "pointer", "motor", "nema17", "ratchet", "linkage", "rack", "yoke", "slider", "cam", "geneva",
              "quickreturn", "escapement", "spring", "winch", "planetary", "shaft", "flywheel", "maggear", "magcouple", "hexsleeve", "jaws"];
module assembly(kit = "joint", explode = 0, layer = "all") {
    $explode = explode; $layer = layer;
    if (kit == "joint") asm_joint();
    else if (kit == "crank") asm_crank();
    else if (kit == "pointer") asm_pointer();
    else if (kit == "motor") asm_motor();
    else if (kit == "nema17") asm_nema17();
    else if (kit == "ratchet") asm_ratchet();
    else if (kit == "linkage") asm_linkage();
    else if (kit == "rack") asm_rack();
    else if (kit == "yoke") asm_yoke();
    else if (kit == "slider") asm_slider();
    else if (kit == "cam") asm_cam();
    else if (kit == "geneva") asm_geneva();
    else if (kit == "quickreturn") asm_quickreturn();
    else if (kit == "escapement") asm_escapement();
    else if (kit == "spring") asm_spring();
    else if (kit == "winch") asm_winch();
    else if (kit == "planetary") asm_planetary();
    else if (kit == "shaft") asm_shaft();
    else if (kit == "flywheel") asm_flywheel();
    else if (kit == "maggear") asm_maggear();
    else if (kit == "magcouple") asm_magcouple();
    else if (kit == "hexsleeve") asm_hexsleeve();
    else if (kit == "jaws") asm_jaws();
    else assert(false, str("no assembly for kit ", kit));
}
