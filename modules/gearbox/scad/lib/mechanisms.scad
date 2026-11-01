// mechanisms.scad - phase 4b: linear and intermittent motion.
//
//   rail(n)                 channel bolted along a row of n sockets, carriages slide on its ridge
//   carriage()              plain carriage with a plug pocket on top: the yoke or the slider post plugs in
//   rack_carriage(len, lv)  carriage with rack teeth at level `lv`; a gear on the next rows drives it
//   yoke(lv, throw, reach)  scotch yoke: tower and arm with a slot that the crank bolt's bearing rides in
//   slider_post(lv)         post on the carriage: a link from a crank bolt makes a crank slider
//   cam(kind)               eccentric, heart or snail cam disc on the gear hub
//   follower()              rocker arm on a pin two sockets from the cam, nose rides the cam, output post on the tail
//   geneva_driver(n)        40T gear with a locking crescent and drive post on top
//   geneva_wheel(n)         n slot wheel three sockets away, one level above the driver gear
//   partial_gear(t, keep)   gear with teeth on half or a quarter of its rim
//   qr_lever(d, throw)      slotted lever: the crank bolt's bearing in the slot makes a quick return
//   escape_wheel()          15 tooth escape wheel
//   anchor(cw)              recoil anchor with a balance bar on a pin two sockets away
//   spring_gear(t)          gear with a wall on its top face: the spiral spring winds inside it
//   spring()                printed spiral spring, hub clamped on the bolt by the knob
//   winch(), winch_flange() two level drum with a press-on top flange; hook() for the string
//
// Levels: a part at level k has its bottom at lvl_z(k) above the plate top.

// Needs standard.scad, gear.scad, addons.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

function lvl_z(k) = BASE_SPACER_H + (k - 1) * LEVEL;

// Rail and carriages ------------------------------------------------------------
RAIL_W   = GRID - 4;                 // 16 / 11
RAIL_T   = sz(3, 2.5, 2);          // base plate
RIDGE    = [3 * MOD, 3 * MOD + 2, sz(2.5, 2, 1.6)];  // dovetail ridge: neck, head, height
TAB_D    = BOLT[1] + 5;              // bolt tab on the next row, knob boss presses it
CAR_L    = 2 * GRID;                 // plain carriage length
BASE_TOP = BASE_SPACER_H + LEVEL - 2;  // carriage top stays under level 2
PLUG_W   = RAIL_W - 4;               // square plug of a tower or post
PLUG_D   = sz(2.5, 2, 1.6);

module ridge_2d(grow = 0) {
    n = RIDGE[0] + 2 * grow; t = RIDGE[1] + 2 * grow; h = RIDGE[2] + grow;
    polygon([[-n / 2, -grow - EPS], [n / 2, -grow - EPS], [t / 2, h], [-t / 2, h]]);
}
// ridge or slot along x from x0 to x1, standing on z = 0
module ridge_along(x0, x1, grow = 0) { translate([x0, 0, 0]) rotate([90, 0, 90]) linear_extrude(x1 - x0) ridge_2d(grow); }

// Rail over n sockets in a row (the sockets stay empty under it). Bolt tabs at both
// ends reach the next row (+y); two 1-level bolts with knobs hold it. The rack's
// teeth face -y, so the pinion goes on the rows below.
module rail(n = 4) {
    assert(n >= 2 && n <= 8, "rail: 2 to 8 sockets");
    L = (n - 1) * GRID;
    c = fit("slot_clear");
    bolt = BOLT[0] + fit("bolt_clear");
    difference() {
        union() {
            linear_extrude(RAIL_T) hull() { circle(d = RAIL_W); translate([L, 0]) circle(d = RAIL_W); }
            translate([0, 0, RAIL_T - EPS]) ridge_along(-RAIL_W / 2 + 1, L + RAIL_W / 2 - 1, -c / 2);
            for (x = [0, L]) linear_extrude(RAIL_T) hull() { translate([x, 0]) circle(d = RAIL_W); translate([x, GRID]) circle(d = TAB_D); }
        }
        for (x = [0, L]) translate([x, GRID, -1]) cylinder(d = bolt, h = RAIL_T + 2);
    }
}

// Plain carriage: slides on the ridge, a square pocket on top takes a plug. Prints upside down.
module carriage() {
    c = fit("slot_clear");
    difference() {
        translate([-CAR_L / 2, -RAIL_W / 2, RAIL_T]) cube([CAR_L, RAIL_W, BASE_TOP - RAIL_T]);
        translate([0, 0, RAIL_T]) ridge_along(-CAR_L / 2 - 1, CAR_L / 2 + 1, c / 2);
        translate([-(PLUG_W + c) / 2, -(PLUG_W + c) / 2, BASE_TOP - PLUG_D]) cube([PLUG_W + c, PLUG_W + c, PLUG_D + 1]);
    }
}
module plug() { c = fit("slot_clear"); translate([-(PLUG_W - c) / 2, -(PLUG_W - c) / 2, BASE_TOP - PLUG_D]) cube([PLUG_W - c, PLUG_W - c, PLUG_D + EPS]); }

// Rack teeth along x, pointing -y, pitch line at y = -GRID: a 20T pinion on the
// second row below the rail meshes, a 40T on the third.
module rack_teeth_2d(L) {
    p = PI * MOD;
    n = floor((L - 2) / p);
    hw = p / 4 - fit("backlash") / 2;
    yr = -(GRID - 1.25 * MOD); yt = -(GRID + MOD);
    t = tan(PA);
    for (i = [0 : n - 1]) translate([(i - (n - 1) / 2) * p, 0])
        polygon([[-(hw + 1.25 * MOD * t), yr + EPS], [hw + 1.25 * MOD * t, yr + EPS], [hw - MOD * t, yt], [-(hw - MOD * t), yt]]);
}
// Rack carriage `len` grid steps long with its teeth at `level`. Prints upside down.
module rack_carriage(len = 2, level = 1) {
    assert(level >= 1 && level <= 2, "rack: level 1 or 2");
    c = fit("slot_clear");
    Lb = len * GRID; z0 = lvl_z(level); top = z0 + GEAR_T;
    difference() {
        union() {
            translate([-Lb / 2, -RAIL_W / 2, RAIL_T]) cube([Lb, RAIL_W, top - RAIL_T]);
            translate([-Lb / 2, -(GRID - 1.25 * MOD), z0]) cube([Lb, GRID - 1.25 * MOD - RAIL_W / 2 + EPS, GEAR_T]);
            translate([0, 0, z0]) linear_extrude(GEAR_T) rack_teeth_2d(Lb);
        }
        translate([0, 0, RAIL_T]) ridge_along(-Lb / 2 - 1, Lb / 2 + 1, c / 2);
    }
}
function rack_top(level) = lvl_z(level) + GEAR_T;

// Scotch yoke for a crank on a gear at `level`, `throw` mm, on the rail's own row
// `reach` grid steps from the carriage centre. The tower plugs into the carriage;
// the arm runs at level + 2 where the crank post's bearing rides in the slot.
// Prints upside down (arm on the bed).
SLOT_W = BEARING[1] + 0.5;
YOKE_WALL = sz(5, 4.5, 4);          // solid frame around the slot: sides and both ends
function yoke_z(level) = lvl_z(level + 2) + 1;
function yoke_top(level) = yoke_z(level) + GEAR_T + 4;
module yoke(level = 1, throw = 20, reach = 3) {
    assert(level >= 1 && level <= 2, "yoke: crank gear on level 1 or 2");
    za = yoke_z(level); h = GEAR_T + 4;
    SL = 2 * throw + SLOT_W + 1;     // the slot
    AW = SLOT_W + 2 * YOKE_WALL;      // the frame
    FL = SL + 2 * YOKE_WALL;
    X = reach * GRID;
    assert(X - AW / 2 > PLUG_W / 2 + 2, "yoke: reach too short");
    difference() {
        union() {
            plug();
            translate([-PLUG_W / 2, -RAIL_W / 2, BASE_TOP - EPS]) cube([PLUG_W, RAIL_W, za + h - BASE_TOP]);
            translate([-PLUG_W / 2, -RAIL_W / 2, za]) cube([X - AW / 2 + PLUG_W / 2 + EPS, RAIL_W, h]);
            translate([X, 0, za]) linear_extrude(h) offset(r = 2) offset(delta = -2) square([AW, FL], center = true);
        }
        translate([X, 0, za - 1]) linear_extrude(h + 2) hull() { translate([0, -SL / 2 + SLOT_W / 2]) circle(d = SLOT_W); translate([0, SL / 2 - SLOT_W / 2]) circle(d = SLOT_W); }
    }
}

// Slider post: plugs into the carriage, its shoulder at level + 2 like a crank bolt's
// boss, so a link joins it to the crank of a gear at `level`. A pinned cap keeps the
// link's bearing on. Prints standing.
module slider_post(level = 1) {
    assert(level >= 1 && level <= 2, "slider: crank gear on level 1 or 2");
    zs = lvl_z(level + 2);                 // the link's bearing sits here, as on a crank bolt
    h = zs + BEARING[2] - 0.2;             // just under the bearing top: the cap clamps the inner race
    difference() {
        union() {
            plug();
            translate([0, 0, BASE_TOP - EPS]) cylinder(d = PLUG_W, h = zs - 1 - BASE_TOP + EPS);
            translate([0, 0, zs - 1 - EPS]) cylinder(d = POST_D + 2, h = 1 + EPS);
            translate([0, 0, zs]) cylinder(d = POST_D, h = h - zs - 0.5);
            translate([0, 0, h - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
        }
        translate([0, 0, h - PIN_L + 1.5 + 0.3]) cylinder(d = CAP_D, h = PIN_L, $fn = 32);   // the cap's pin: 1.5 mm in the cap, the rest in the post
    }
}

// Cams and follower ------------------------------------------------------------
CAM_R0   = BEARING[1] / 2 + 4;       // base circle: 15 / 12.5
CAM_LIFT = GRID / 2;                 // 10 / 7.5
function cam_r(kind, a) =
    kind == "eccentric" ? let(e = CAM_LIFT / 2, R = CAM_R0 + e) e * cos(a) + sqrt(R * R - e * e * sin(a) * sin(a))
    : kind == "heart" ? CAM_R0 + CAM_LIFT * (1 - abs(a - 180) / 180)
    : kind == "snail" ? CAM_R0 + CAM_LIFT * a / 360
    : assert(false, str("unknown cam: ", kind));
module cam(kind = "eccentric") {
    difference() {
        linear_extrude(GEAR_T) polygon([for (a = [0 : 2 : 358]) cam_r(kind, a) * [cos(a), sin(a)]]);
        bearing_seat();
        face_joints(GEAR_T, 0, CAM_R0);   // too small for the jaws: it joins with pins
    }
}
// Follower: pivots on a pin two sockets from the cam, its nose rides the cam (on
// the counter-clockwise side, seen from above). The tail carries an output post: a
// kit bolt dropped in from below, head in a pocket, like a crank post. Its bearing
// sits one level up, so a link on it carries the rocking to a rocker, a pointer or
// a flag on that level. Beside the post, on the nose's side, a hole takes the
// rubber band (to a pin two sockets back and one over) that holds the nose on the cam.
FOLLOWER_A = 1.2 * GRID;
NOSE_R = 1.5 * MOD;
FOLLOWER_POST_D = max(ARM_W + 2, bolt_end_d());
// out past the pin's knob, the thick part included
FOLLOWER_POST = ceil(2 * max(GRID, R_FREE + ARM_W / 2, KNOB_D / 2 + 0.8 + FOLLOWER_POST_D / 2)) / 2;
FOLLOWER_BAND = [-FOLLOWER_POST, FOLLOWER_POST_D / 2 + 2];   // the band hole
FOLLOWER_BOSS = 1.5;                  // the post's bearing lands on the next level; the link clears the arm by 0.5 mm
FOLLOWER_POST_H = LEVEL - 0.5;
function follower_bolt() = post_bolt(FOLLOWER_POST_H, FOLLOWER_BOSS, BEARING[2]);
module follower() {
    w = ARM_W; P = FOLLOWER_POST; de = FOLLOWER_POST_D;
    difference() {
        union() {
            linear_extrude(GEAR_T) union() {
                circle(d = BEARING[1] + 6);
                hull() { circle(d = w); translate([FOLLOWER_A, 0]) circle(r = NOSE_R); }
                hull() { circle(d = w); translate([-P, 0]) circle(d = de); }
                hull() { translate([-P, 0]) circle(d = w); translate(FOLLOWER_BAND) circle(d = 6); }
            }
            // the post's thick part rises toward the next level, clear of the pin's knob
            linear_extrude(FOLLOWER_POST_H) hull() { translate([-(R_FREE + w / 2), 0]) circle(d = w); translate([-P, 0]) circle(d = de); }
            translate([-P, 0, FOLLOWER_POST_H - EPS]) cylinder(d = SPACER_OD, h = FOLLOWER_BOSS + EPS);
        }
        bearing_seat();
        translate([-P, 0, 0]) bolt_pocket(FOLLOWER_POST_H, FOLLOWER_BOSS);
        translate([FOLLOWER_BAND[0], FOLLOWER_BAND[1], -1]) cylinder(d = 2.5, h = GEAR_T + 2, $fn = 16);
    }
}

// Geneva drive -------------------------------------------------------------------
// Driver and wheel three sockets apart. n slots: drive post radius a = C sin(180/n),
// wheel radius b = C cos(180/n); the locking disc radius stays inside a so it
// clears the slot mouths and locks the wheel between indexes.
GEN_C = 3 * GRID;
function gen_a(n) = GEN_C * sin(180 / n);
function gen_b(n) = GEN_C * cos(180 / n);
function gen_lock(n) = gen_a(n) - POST_D / 2 - 3.5;   // leaves a wall beside each slot; the notch (b + 0.6) then frees the wheel just as the post leaves a slot
module geneva_driver(n = 6) {
    assert(n == 6 || n == 8, "geneva: 6 or 8 slots");
    a = gen_a(n); b = gen_b(n); rl = gen_lock(n);
    h_upper = LEVEL + GEAR_T - 1;
    difference() {
        union() {
            gear_blank(40);
            translate([0, 0, GEAR_T]) cylinder(r = rl, h = 1 + EPS);
            translate([0, 0, GEAR_T + 1]) linear_extrude(h_upper - GEAR_T - 1) difference() { circle(r = rl); translate([GEN_C, 0]) circle(r = b + 0.6); }
            translate([a, 0, GEAR_T - EPS]) cylinder(d = POST_D, h = h_upper - GEAR_T - 0.5 + EPS);   // no base collar: it caught the wheel when the post leans
            translate([a, 0, h_upper - 0.5]) cylinder(d1 = POST_D, d2 = POST_D - 1, h = 0.5);
        }
        double_bearing_seat();
        bottom_cut(undef, gear_rr(40));
        rotate(30) face_pattern(40, "holes");   // between the holes, the post has solid material under it
    }
}
module geneva_wheel(n = 6) {
    assert(n == 6 || n == 8, "geneva: 6 or 8 slots");
    a = gen_a(n); b = gen_b(n); rl = gen_lock(n);
    sw = POST_D + 0.6;
    r_in = GEN_C - a - POST_D / 2 - 1.2;
    difference() {
        union() {
            linear_extrude(GEAR_T) difference() {
            circle(r = b);
            for (i = [0 : n - 1]) rotate(i * 360 / n) hull() { translate([r_in + sw / 2, 0]) circle(d = sw); translate([b + 1, 0]) circle(d = sw); }
            for (i = [0 : n - 1]) rotate(i * 360 / n + 180 / n) translate([GEN_C, 0]) circle(r = rl + 0.4);
            }
            face_jaws(GEAR_T, r_in);
        }
        bearing_seat();
        face_joints(GEAR_T, 0, r_in);
    }
}

// Intermittent gear: teeth on `keep` of the rim (0.5 or 0.25), centred on +x.
module partial_gear(teeth = 40, keep = 0.5) {
    rr = gear_rr(teeth) - 0.3;
    difference() {
        gear(teeth, face = teeth >= 40 ? "spokes" : "solid");
        translate([0, 0, -1]) linear_extrude(GEAR_T + 2) difference() {
            circle(r = gear_or(teeth) + 2);
            circle(r = rr);
            polygon(concat([[0, 0]], [for (a = [-keep * 180 : 5 : keep * 180]) (gear_or(teeth) + 3) * [cos(a), sin(a)]]));
        }
    }
}

// Quick return: slotted lever pivoting on a pin `d` grid steps from a crank; the
// crank bolt's bearing rides in the slot. A bolt pocket at the far end takes a
// 1-level bolt as the post for a link one level up.
module qr_lever(d = 3, throw = 20) {
    D = d * GRID;
    r1 = D - throw - SLOT_W / 2 - 1; r2 = D + throw + SLOT_W / 2 + 1;
    assert(r1 >= BEARING[1] / 2 + 4, "quick return: the crank reaches the lever's pivot, use more distance or less throw");
    w = SLOT_W + 8;
    de = max(w, bolt_end_d());
    rs = r2 + de / 2 + 1;
    difference() {
        union() {
            linear_extrude(GEAR_T) hull() { circle(d = w); translate([rs, 0]) circle(d = de); }
            translate([rs, 0, GEAR_T - EPS]) cylinder(d = SPACER_OD, h = SPACER_H + EPS);
        }
        bearing_seat();
        translate([0, 0, -1]) linear_extrude(GEAR_T + 2) hull() { translate([r1 + SLOT_W / 2, 0]) circle(d = SLOT_W); translate([r2 - SLOT_W / 2, 0]) circle(d = SLOT_W); }
        translate([rs, 0, 0]) bolt_pocket(GEAR_T, SPACER_H);
    }
}

// Escapement ----------------------------------------------------------------------
// 15 tooth wheel, recoil anchor on a pin two sockets away. The pallets sit on the
// tangents from the pivot to the wheel (R = C cos alpha) and span 4.5 teeth; their
// flat impulse faces lean `gamma` from the tangent. Checked in tools/escapement-check.mjs:
// the wheel steps one tooth per swing of up to 5 degrees each way.
ESC_N = 15; ESC_C = 2 * GRID; ESC_ALPHA = 54; ESC_GAMMA = 32;
ESC_R = ESC_C * cos(ESC_ALPHA);
ESC_DEPTH = 0.22 * ESC_R;
ESC_DIP = 0.45 * MOD;               // pallet tip below the tooth tips at rest
ESC_OUT = 0.6 * MOD;                // face reach beyond the tooth tips
ESC_W = 0.3 * 2 * PI * ESC_R / ESC_N;
module escape_wheel() {
    assert(SZ < 2, "the escape wheel is not made in M1: its teeth would cut into the pin holes");
    beta = 360 / ESC_N;
    difference() {
        union() {
            linear_extrude(GEAR_T) polygon([for (i = [0 : ESC_N - 1]) let(p = i * beta) each [
                ESC_R * [cos(p), sin(p)],
                (ESC_R - ESC_DEPTH) * [cos(p + 0.8 * beta), sin(p + 0.8 * beta)],
                (ESC_R - ESC_DEPTH) * [cos(p + 0.96 * beta), sin(p + 0.96 * beta)]]]);
            face_jaws(GEAR_T, ESC_R - ESC_DEPTH);
        }
        bearing_seat();
        face_joints(GEAR_T, 0, ESC_R - ESC_DEPTH);
    }
}
function esc_t(qf, R, r) = let(s = sqrt(max(0, qf * qf - (R * R - r * r))), t1 = -qf + s, t2 = -qf - s) abs(t1) < abs(t2) ? t1 : t2;
// pallet quad in the wheel frame (wheel centre at the origin, pivot at [0, ESC_C]); side -1 entry, +1 exit
function esc_pallet(side) = let(
    a = ESC_ALPHA, g = ESC_GAMMA, R = ESC_R,
    Q = [side * R * sin(a), R * cos(a)],
    v = side < 0 ? [cos(a), sin(a)] : [cos(a), -sin(a)],
    n = side < 0 ? [-sin(a), cos(a)] : [sin(a), cos(a)],
    f = cos(g) * v - sin(g) * n, b = sin(g) * v + cos(g) * n,
    qf = Q * f,
    tin = esc_t(qf, R, R - ESC_DIP), tout = esc_t(qf, R, R + ESC_OUT),
    Qin = Q + tin * f, Qout = Q + tout * f)
    [Qin, Qout, Qout + ESC_W * b, Qin + ESC_W * b];
module anchor(cw = true) {
    assert(SZ < 2, "the anchor is not made in M1 (no escape wheel in M1)");
    bar = 2.5 * GRID; w = ARM_W;
    af = BOLT[1] + fit("nut_clear");
    mirror(cw ? [0, 0, 0] : [1, 0, 0])
    difference() {
        linear_extrude(GEAR_T) translate([0, -ESC_C]) union() {
            translate([0, ESC_C]) circle(d = BEARING[1] + 6);
            for (s = [-1, 1]) { q = esc_pallet(s); polygon(q); hull() { translate([0, ESC_C]) circle(d = 0.6 * w); polygon([q[2], q[3], q[3] + [0.01, 0]]); } }
            hull() { translate([0, ESC_C]) circle(d = w); translate([0, ESC_C + bar]) circle(d = w); }
            translate([0, ESC_C + bar - af / 2 - 2]) circle(d = af / cos(30) + 2 * BOSS_WALL);
        }
        bearing_seat();
        translate([0, bar - af / 2 - 2, -1]) cylinder(d = af / cos(30), h = GEAR_T + 2, $fn = 6);   // a nut as the balance weight
        translate([0, bar - af - 7, -1]) cylinder(d = 2.5, h = GEAR_T + 2, $fn = 16);               // band hole
    }
}

// Wind-up spring --------------------------------------------------------------------
SPR_T      = sz(1.2, 1.0, 0.8);      // band thickness
SPR_H      = GEAR_T - 1;
SPR_TURNS  = 4.5;
SPR_PITCH  = sz(3.2, 2.5, 2);
SPR_R_IN   = sz(8, 6.5, 5);
SPR_R_OUT  = SPR_R_IN + SPR_TURNS * SPR_PITCH;
SPR_WALL_R = SPR_R_OUT + 2.5;        // wall inner radius: 24.9 / 20.25
SPR_WALL_T = 2;
SPR_WALL_H = 2 + SPR_H + 0.5;
SPR_END_A  = (SPR_TURNS * 360) % 360;
function spr_r(a) = SPR_R_IN + SPR_PITCH * a / 360;
function spring_wall_r() = SPR_WALL_R + SPR_WALL_T;
// Gear with the spring wall on its top face. The pin needs one more level for the spring.
module spring_gear(teeth = 60) {
    assert(gear_rr(teeth) >= spring_wall_r() + 0.5, "the spring wall needs a bigger gear");
    r0 = spring_wall_r() + 2; r1 = gear_rr(teeth) - 3;
    rm = (r0 + r1) / 2; n = 8; dh = min(r1 - r0, 2 * PI * rm / n * 0.65);
    union() {
        difference() {
            gear(teeth, face = "solid", $joint_top = "flat");   // the spring winds on the top face
            if (dh >= 4) for (i = [0 : n - 1]) rotate(i * 360 / n) translate([rm, 0, -1]) cylinder(d = dh, h = GEAR_T + 2);
        }
        translate([0, 0, GEAR_T - EPS]) difference() {
            cylinder(r = spring_wall_r(), h = SPR_WALL_H);
            translate([0, 0, -1]) cylinder(r = SPR_WALL_R, h = SPR_WALL_H + 2);
            rotate(SPR_END_A) translate([SPR_WALL_R - 1, -(SPR_T + 0.5) / 2, 2]) cube([SPR_WALL_T + 2, SPR_T + 0.5, SPR_WALL_H]);
        }
    }
}
// Spiral spring: the boss stands on the bearing's inner race, the knob boss clamps the
// hub, so the inner end is fixed to the bolt; the outer hook sits in the wall's notch.
module spring() {
    bore = BOLT[0] + fit("bolt_clear");
    A = SPR_TURNS * 360;
    pts = concat([for (a = [0 : 4 : A]) (spr_r(a) + SPR_T / 2) * [cos(a), sin(a)]],
                 [for (a = [A : -4 : 0]) (spr_r(a) - SPR_T / 2) * [cos(a), sin(a)]]);
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = 2 + EPS);
            translate([0, 0, 2]) cylinder(r = SPR_R_IN + SPR_T / 2, h = SPR_H);
            translate([0, 0, 2]) linear_extrude(SPR_H) polygon(pts);
            translate([0, 0, 2]) linear_extrude(SPR_H) rotate(SPR_END_A) translate([spr_r(A) - SPR_T / 2, -SPR_T / 2]) square([spring_wall_r() - spr_r(A) + SPR_T / 2 - 0.3, SPR_T]);
        }
        translate([0, 0, -1]) cylinder(d = bore, h = SPR_H + 4);
    }
}

// Winch -------------------------------------------------------------------------------
// Two levels tall like a compound gear: bearing from below and from above. The string
// knots through the hole in the bottom flange; the top flange presses on after winding.
WINCH_FLANGE_R = GRID + 2;
// with jaws the core takes the pockets where it can (M2, M1.5; M1's flange is too small)
WINCH_CORE_R   = let(r = BEARING[1] / 2 + 2.5, rj = JAW_OUT + 1.2) JAWS && rj <= WINCH_FLANGE_R - 3 ? max(r, rj) : r;
WINCH_H        = LEVEL + GEAR_T - 1;
module winch() {
    difference() {
        union() {
            cylinder(r = WINCH_FLANGE_R, h = 1.5);
            cylinder(r = WINCH_CORE_R, h = WINCH_H);
        }
        double_bearing_seat();
        bottom_cut(undef, WINCH_CORE_R);
        translate([min(WINCH_CORE_R + 4, (WINCH_CORE_R + WINCH_FLANGE_R) / 2), 0, -1]) cylinder(d = 2.4, h = 4, $fn = 16);
    }
}
module winch_flange() {
    difference() { cylinder(r = WINCH_FLANGE_R, h = 1.5); translate([0, 0, -1]) cylinder(r = WINCH_CORE_R + 0.1, h = 4); }
}
// String hook: an eye and a J.
module hook() {
    linear_extrude(3) difference() {
        union() {
            circle(d = 8);
            translate([0, -10]) difference() { circle(d = 12); circle(d = 7); translate([-7, 0]) square([7, 7]); }
            translate([-1.5, -6]) square([3, 6]);
        }
        circle(d = 2.6);
    }
}
