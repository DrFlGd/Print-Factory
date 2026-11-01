// addons.scad - phase 4a: what rides on a gear face or a pin besides gears.
//
//   crank(throw)       hub ring pinned to a gear's top face, with a thick arm and
//                      a bolt pocket at `throw` mm: a kit bolt is the crank post
//   handle()           free-spinning grip over a long spacer on the crank bolt
//   joint()            flanged post that joins two links, cap pinned on top
//   cap()              disc keyed by a dowel pin into the top of a printed post
//   post(h)            legacy printed crank post (before the bolt posts)
//   pointer()          hub ring with a thin arm that reaches past the dial knob
//   dial_knob()        the knob with a numbered disc: the pointer reads its rim
//   pulley(n)          grooved wheel for rubber bands, diameter MOD * n like a gear
//   link(n)            bar with n bearing seats at grid pitch
//   ratchet()          12 tooth sawtooth wheel on the gear hub
//   pawl(flip)         clamps on a pin two sockets away, a leaf spring tooth
//
// Every part prints flat without support. Cranks and pointers print hub ring up
// (upside down from how they sit on the gear) so the hex pocket and the jaw
// sockets (or pin holes) face up.
//
// With jaws (joint = "jaws") a crank or pointer keys onto the jaws of the gear
// below: its hub ring sits on the gear's top face and the jaws pass through
// three tapered slots in it. A crank adds a collar round the jaws for torque;
// the dial knob's disc rises above the jaw tops. With pins the hub ring carries
// three short dowel pins pressed in.

// Needs standard.scad, gear.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

HUB_ID  = SPACER_OD + 1.5;            // clears the knob boss
ARM_W   = 7 * MOD;                    // 14 / 10.5
ARM_T   = LEVEL + 1;                  // thick part of a crank: 1 mm under a link or lever two levels up, which swings over it
R_FREE  = KNOB_D / 2 + 1.5;           // beyond this radius a part may rise above the hub ring
POST_D  = BOLT[0] - 0.1;              // printed posts (slider post, Geneva driver, legacy posts): a bearing's bore slides over it
STEM_D  = 3 * MOD;                    // legacy press-fit stem of a printed post, 6 / 4.5
STEM_H  = LEVEL;                      // legacy stem: the old crank's socket depth
CAP_D   = PIN_D + fit("pin_press");   // a dowel pin pressed through the cap keys it into a post top
CRANK_BOSS = 2;                       // boss on a crank arm: its bearing lands at level + 2, level with a link on a pin; the link's ledge clears it
DIAL_R  = sz(17, 13, 9);             // dial knob disc: clears a neighbour's gear one level up
DIAL_T  = 2.5;
DIAL_Z0 = JAWS ? max(KNOB_BOSS_H, JAW_H + 0.4) : KNOB_BOSS_H;   // dial disc bottom above the gear: clears the jaw tops
// a pin with a dial knob: the bolt reaches up through the taller dial knob
function dial_bolt(levels) = ceil((bolt_len(levels) + DIAL_Z0 - KNOB_BOSS_H) / 5) * 5;
HUB_OD  = JAWS ? 2 * (JAW_OUT + 1.2) : CPL_OD;   // hub ring: covers the jaw band
HUB_COLLAR = JAW_H + 0.3 + 1.2;                  // crank: collar round the jaws

// Hub ring. Jaws: three tapered slots the jaws of the gear below pass through.
// Pins: three press-fit holes for the short hub pins (every other face hole),
// the pins stand PIN_DEPTH - 0.1 proud below the ring and drop into the gear.
// z = 0 is the ring bottom.
module hub_ring(t = HUB_T) {
    d = PIN_D + fit("pin_press");
    difference() {
        cylinder(d = HUB_OD, h = t);
        translate([0, 0, -1]) cylinder(d = HUB_ID, h = t + 2);
        if (JAWS) hub_sockets(t + 1);
        else for (i = [0, 2, 4]) rotate(i * 360 / PIN_N) translate([PIN_R, 0, -1]) cylinder(d = d, h = t + 2, $fn = 32);
    }
}
module hub_sockets(h) jaws_ring() jaw_socket(h);   // between the jaws' angles the arm runs along +x

// Bolt post: a kit bolt dropped through a part from below, hex head in a flush
// pocket, a boss on top that presses only the bearing inner race, a nut above
// the bearing (or the handle's spacer) holds it. z = 0 is the part's bottom, h its
// top, boss the boss height.
module bolt_pocket(h, boss) {
    af = BOLT[1] + fit("nut_clear");
    translate([0, 0, -EPS]) cylinder(d = af / cos(30), h = BOLT[2] + 0.2 + EPS, $fn = 6);
    translate([0, 0, -1]) cylinder(d = BOLT[0] + fit("bolt_clear"), h = h + boss + 2);
}
// Shortest stock bolt for a post: shank through the part above the head, the boss,
// what rides on it and a nut, plus a thread.
function post_bolt(h, boss, rides) = let(l = h - BOLT[2] + boss + rides + NUT_H + 1) ceil(l / 5) * 5;
function bolt_end_d() = (BOLT[1] + fit("nut_clear")) / cos(30) + 2 * BOSS_WALL + 0.8;   // wall around the hex pocket

// Crank: a hub ring, a thick arm beyond the knob and a bolt pocket at `throw` from
// the axis: a 1-level bolt is the crank post, its bearing (or the handle's
// spacer) sits on the boss two levels above the gear, so a link on it lines up
// with a link on a pin two levels up. A nut on top keeps it.
module crank(throw = 2 * GRID) {
    assert(throw >= R_FREE + ARM_W / 2, "throw too short for the knob");
    de = max(ARM_W + 2, bolt_end_d());
    difference() {
        union() {
            hub_ring();
            if (JAWS) linear_extrude(HUB_COLLAR) difference() { circle(d = HUB_OD); circle(r = KNOB_D / 2 + 0.6); }
            // thin arm from the hub to the thick part
            linear_extrude(HUB_T) hull() { translate([HUB_OD / 2 - ARM_W / 2, 0]) circle(d = ARM_W); translate([R_FREE + ARM_W / 2, 0]) circle(d = ARM_W); }
            // thick arm to the bolt pocket
            linear_extrude(ARM_T) hull() { translate([R_FREE + ARM_W / 2, 0]) circle(d = ARM_W); translate([throw, 0]) circle(d = de); }
            translate([throw, 0, ARM_T - EPS]) cylinder(d = SPACER_OD, h = CRANK_BOSS + EPS);
        }
        translate([throw, 0, 0]) bolt_pocket(ARM_T, CRANK_BOSS);
        translate([0, 0, -1]) cylinder(d = HUB_ID, h = ARM_T + 2);
        if (JAWS) hub_sockets(JAW_H + 0.3);
    }
}
function crank_top() = ARM_T + CRANK_BOSS;
function crank_bolt(handle = false) = post_bolt(ARM_T, CRANK_BOSS, handle ? HANDLE_H + 1 : BEARING[2]);

// Legacy post: press the stem into an old crank. A bearing (link) or the handle
// rides on the post; the cap pins into the hole on top and keeps it there.
module post(h = GEAR_T + 3) {
    union() {
        translate([0, 0, -STEM_H]) cylinder(d = STEM_D, h = STEM_H + EPS);
        difference() {
            union() {
                cylinder(d = POST_D + 2, h = 1);                     // shoulder: the bearing sits on it
                cylinder(d = POST_D, h = h - 0.5);
                translate([0, 0, h - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
            }
            translate([0, 0, h - 5]) cylinder(d = CAP_D, h = 5 + EPS);
        }
    }
}

// Joint post: joins two links away from any pin. A flange underneath, a bearing
// in each link with a 3 mm spacer between, the cap pinned on top.
module joint() {
    h = 2.5 + 2 * BEARING[2] + SPACER_H - 0.2;   // just under the upper bearing's top: the cap clamps both inner races
    difference() {
        union() {
            cylinder(d = POST_D + 6, h = 1.5);
            cylinder(d = POST_D + 2, h = 2.5);                       // shoulder under the first bearing
            cylinder(d = POST_D, h = h - 0.5);
            translate([0, 0, h - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
        }
        translate([0, 0, h - PIN_L + 1.5 + 0.3]) cylinder(d = CAP_D, h = PIN_L, $fn = 32);
    }
}

// Handle: a grip that spins over a spacer (HANDLE_H + 1 tall) on the crank's
// bolt; the nut clamps the spacer, not the grip.
HANDLE_H = sz(26, 22, 18);
module handle(h = HANDLE_H) {
    difference() {
        union() {
            cylinder(d = SPACER_OD + 7, h = h);
            for (z = [4 : 4 : h - 5]) translate([0, 0, z]) cylinder(d = SPACER_OD + 8.5, h = 1.5);
        }
        translate([0, 0, -EPS]) cylinder(d = SPACER_OD + fit("bore_clear"), h = h + 2 * EPS);
    }
}

// Cap: a disc for the top of a printed post (slider post, legacy posts). A dowel
// pin pressed through its centre hole goes into the post and keys the cap on.
module cap() {
    difference() {
        cylinder(d = POST_D + 3, h = 1.5);
        translate([0, 0, -EPS]) cylinder(d = CAP_D, h = 1.5 + 2 * EPS, $fn = 32);
    }
}

// Pointer: hub ring and a thin arm that runs under the dial knob's disc and
// shows past its rim. Prints hub ring up.
module pointer() {
    reach = DIAL_R + 4;
    w = 3 * MOD;
    difference() {
        union() {
            hub_ring();
            linear_extrude(HUB_T) hull() { translate([HUB_OD / 2 - w, 0]) circle(d = 2 * w); translate([reach, 0]) circle(d = w); }
        }
        translate([0, 0, -1]) cylinder(d = HUB_ID, h = ARM_T + 2);
        if (JAWS) hub_sockets(HUB_T + 1);
    }
}

// Seven-segment digit, height h, centred; d = 0..9.
module digit(d, h = 6) {
    on = [[1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
          [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1]][d];
    s = h / 2; w = h / 6;
    // segments a..g: [x, y, horizontal]
    seg = [[0, s, 1], [s / 2, s / 2, 0], [s / 2, -s / 2, 0], [0, -s, 1], [-s / 2, -s / 2, 0], [-s / 2, s / 2, 0], [0, 0, 1]];
    for (i = [0 : 6]) if (on[i] == 1) translate([seg[i][0], seg[i][1]]) square(seg[i][2] == 1 ? [s - w / 2, w] : [w, s - w / 2], center = true);
}
module number(n, h = 6) {
    digits = n >= 10 ? [floor(n / 10), n % 10] : [n];
    pitch = h * 0.7;
    for (i = [0 : len(digits) - 1]) translate([(i - (len(digits) - 1) / 2) * pitch, 0]) digit(digits[i], h);
}

// Dial knob: the bolt knob with a flat disc under the grip, clock numbers and
// ticks raised on the disc around its rim. It is fixed (it is the knob), the
// pointer turns under it, and the pointer's tip shows past the rim.
module dial_knob() {
    bore = BOLT[0] + fit("bolt_clear");
    af = BOLT[1] + fit("nut_clear");
    pocket = BOLT[2] + 0.2;
    z0 = DIAL_Z0;
    h = KNOB_H + z0 - KNOB_BOSS_H;
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = z0 + EPS);
            translate([0, 0, z0]) cylinder(r = DIAL_R, h = DIAL_T);
            translate([0, 0, z0 + DIAL_T - EPS]) cylinder(d = KNOB_D, h = h - z0 - DIAL_T + EPS);
            translate([0, 0, z0 + DIAL_T - EPS]) linear_extrude(0.6 + EPS) {
                for (k = [0 : 59]) rotate(90 - k * 6) translate([DIAL_R - (k % 5 == 0 ? 3 : 1.6), -0.3]) square([k % 5 == 0 ? 2.6 : 1.2, 0.6]);
                for (k = [0 : 11]) rotate(90 - k * 30) translate([DIAL_R - 6, 0]) rotate(-90 + k * 30) number(k == 0 ? 12 : k, 3.4);
            }
        }
        translate([0, 0, -EPS]) cylinder(d = bore, h = h + 2 * EPS);
        translate([0, 0, h - pocket]) cylinder(d = af / cos(30), h = pocket + EPS, $fn = 6);
        for (i = [0 : 11]) rotate(i * 30) translate([KNOB_D / 2 + 0.6, 0, z0 + DIAL_T + 1])
            cylinder(r = 1.6 * KNOB_D / 20, h = h, $fn = 24);
    }
}

// Pulley: a flanged wheel with a round groove for a rubber band, on the gear
// hub. `n` is its size as tooth-count equivalent: diameter MOD * n, so a P40
// over a P20 is a 2:1 drive, like the gears.
module pulley(n = 40) {
    d = MOD * n + 2;
    g = 3.2;    // groove width
    difference() {
        union() {
            cylinder(d = d, h = GEAR_T);
            face_jaws(GEAR_T, d / 2 - g / 2 - 0.3);
        }
        rotate_extrude() translate([d / 2, GEAR_T / 2]) hull() { circle(d = g); translate([g, 0]) circle(d = g); }
        bearing_seat();
        face_joints(GEAR_T, d / 2 - g - 1, d / 2 - g / 2 - 0.3);
        face_pattern(n, n >= 40 ? "spokes" : "solid");
    }
}

// Link: a bar with n bearing seats on the grid. One level thick, like a gear.
module link(n = 3) {
    w = BEARING[1] + 6;
    L = GRID * (n - 1);
    difference() {
        linear_extrude(GEAR_T) hull() { circle(d = w); translate([L, 0]) circle(d = w); }
        for (i = [0 : n - 1]) translate([GRID * i, 0, 0]) bearing_seat();
        // lighten between the holes
        if (GRID - BEARING[1] > 6) for (i = [0 : n - 2]) translate([GRID * i + GRID / 2, 0, -EPS]) cylinder(d = GRID - BEARING[1] - 4, h = GEAR_T + 2 * EPS);
    }
}

// Ratchet wheel: 12 sawtooth teeth, tip radius a grid step less 2.5 mm, so a
// pawl on a pin two sockets away reaches it and a 20T gear two sockets away
// on the same level still clears it. Turns freely clockwise (seen
// from above) past a pawl, locks the other way; flip the pawl for the reverse.
RATCHET_N = 12;
RATCHET_R = GRID - 2.5;
RATCHET_DEPTH = 1.6 * MOD;
module ratchet_2d() {
    r0 = RATCHET_R - RATCHET_DEPTH;
    polygon([for (i = [0 : RATCHET_N - 1]) each [
        [RATCHET_R * cos(i * 30), RATCHET_R * sin(i * 30)],
        [r0 * cos(i * 30 + 2), r0 * sin(i * 30 + 2)]]]);
}
module ratchet() {
    assert(SZ < 2, "the ratchet is not made in M1: on a 10 mm grid the 605 bearing fills the wheel");
    difference() {
        linear_extrude(GEAR_T) ratchet_2d();
        bearing_seat();
        face_joints(GEAR_T, 0, RATCHET_R - RATCHET_DEPTH);   // too small for the jaws: it joins with pins
    }
}

// Pawl: clamps on a pin (bore over the bolt, the knob boss and spacer grip it)
// two sockets from the ratchet pin, which is at +x. A rigid stub carries a
// leaf spring whose tooth rides over the ratchet teeth one way and catches
// them the other. `flip` mirrors it for the opposite direction.
module pawl(flip = false) {
    assert(SZ < 2, "the pawl is not made in M1 (no ratchet wheel fits the 10 mm grid)");
    bore = BOLT[0] + fit("bolt_clear");
    hub = 9 * MOD;
    leaf_t = 0.6 * MOD;
    C = [2 * GRID, 0];
    r_leaf = RATCHET_R + leaf_t / 2 + 0.2;       // the leaf passes just outside the tooth tips
    tip = C + r_leaf * [cos(150), sin(150)];     // leaf end; the tooth hangs inward from here
    A = [0.6 * GRID, -0.6 * GRID];               // leaf root, so the leaf runs along the wheel's tangent
    depth = RATCHET_DEPTH + leaf_t / 2 - 0.4;    // tooth reach toward the root circle
    mirror(flip ? [0, 1, 0] : [0, 0, 0])
    difference() {
        linear_extrude(GEAR_T) union() {
            circle(d = hub);
            hull() { circle(d = hub * 0.6); translate(A) circle(d = 2 * leaf_t + 2); }   // rigid stub
            hull() { translate(A) circle(d = leaf_t); translate(tip) circle(d = leaf_t); }  // leaf
            // tooth at the leaf end: local -x points into the wheel, +y back along the leaf.
            // The flat face (y = -leaf_t/2) catches the steep tooth face when the wheel
            // turns counter-clockwise; the ramp lets it ride over the teeth clockwise.
            translate(tip) rotate(150) polygon([[leaf_t / 2, -leaf_t / 2], [-depth, -leaf_t / 2], [leaf_t / 2, -leaf_t / 2 + 1.3 * depth]]);
        }
        translate([0, 0, -EPS]) cylinder(d = bore, h = GEAR_T + 2 * EPS);
    }
}
