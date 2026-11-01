// gear.scad - spur gears on the GearBox standard.
//
// Every gear has a bearing seat in the hub and a face joint on both faces
// (jaws.scad): by default tapered jaws on top and pockets underneath, or with
// joint = "pins" / "bolts" the legacy dowel pin holes (plus a screw clamp).
// Tooth counts in multiples of 10 land on the grid; two gears mesh when their
// tooth counts add up to a multiple of 20. Gears print flat, bottom face down.

// Needs standard.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).
include <BOSL2/std.scad>
include <BOSL2/gears.scad>

// Plain gear blank with teeth. z = 0 is the bottom face.
module gear_blank(teeth, thickness = GEAR_T) {
    spur_gear(mod = MOD, teeth = teeth, thickness = thickness, pressure_angle = PA,
              backlash = fit("backlash"), anchor = BOTTOM);
}

// Bearing seat: the bearing sits on a 1 mm ledge at the bottom of the seat.
// The ledge opening touches only the outer race.
module bearing_seat(ledge_at_bottom = true) {
    d = BEARING;
    bore = bearing_bore();
    ledge_id = d[1] - 2;
    if (ledge_at_bottom) {
        translate([0, 0, -EPS]) cylinder(d = ledge_id, h = 1 + 2 * EPS);
        translate([0, 0, 1]) cylinder(d = bore, h = d[2] + 1);
    } else {
        // mirrored: bearing inserted from below, ledge on top
        translate([0, 0, -1]) cylinder(d = bore, h = d[2] + 1);
        translate([0, 0, d[2] - EPS]) cylinder(d = ledge_id, h = 1 + 2 * EPS);
    }
}
// Two seats one level apart on a part LEVEL + GEAR_T - 1 tall (compound gear, Geneva
// driver, winch): bottom bearing from below, top bearing from above. The two ledges
// meet in one 2 mm wall, open through the middle so the bolt passes.
module double_bearing_seat() {
    bearing_seat(ledge_at_bottom = false);
    translate([0, 0, LEVEL - 1]) bearing_seat();
    translate([0, 0, BEARING[2]]) cylinder(d = BEARING[1] - 2, h = LEVEL - BEARING[2]);
}

// Pin holes in a face: a slip fit for the dowel pins. z = 0 is the face, holes go
// down to -PIN_DEPTH.
// r_outer: how far the body reaches; no holes when it is too small for them (M1 20T).
module pin_holes(r_outer = undef) if (is_undef(r_outer) || has_pins(r_outer)) {
    d = PIN_D + fit("pin_slip");
    translate([0, 0, -PIN_DEPTH])
        for (i = [0 : PIN_N - 1]) rotate(i * 360 / PIN_N) translate([PIN_R, 0, 0]) cylinder(d = d, h = PIN_DEPTH + EPS, $fn = 32);
}
module peg_holes() { pin_holes(); }   // old name

// Screw clamp (joint = "bolts"), alongside the pins, on gears with room for it:
// six through holes on a second circle outside the pin holes, M3 for M2, M2.5
// for M1.5, M2 for M1. Holes 0, 2, 4 have a flush counterbore for a socket head
// in the top face; holes 1, 3, 5 have a hex nut pocket in the bottom face, the
// nut seated a little up. To join two gears, turn the upper one 60 degrees so
// its counterbored holes sit over the lower one's nut holes, put the joint ring
// in the gap, and drive three screws down.
SCREW_D    = sz(3, 2.5, 2);
SCREW_R    = sz(PIN_R + 4, 12.8, 10.8);          // 18.3 / 12.8 / 10.8: the nut pocket stays clear of the bearing seat
SCREW_HEAD = sz([5.5, 3], [4.5, 2.5], [3.8, 2]); // socket head cap screw: diameter, height
SCREW_NUT  = sz([5.5, 2.4], [5, 2], [4, 1.6]);   // nut: across flats, height
SCREW_NUT_UP = sz(1.0, 1.0, 1.6);                // the nut sits this far above the bottom face
JRING_T    = 1.8;                                // joint ring: fills the 2 mm gap between two screwed gears
SCREW_L    = sz(14, 12, 10);                     // stock length: reaches through the nut, not out of the gear
SCREW_NAME = str(sz("M3", "M2.5", "M2"), " x ", SCREW_L);
// radius the pockets need, with a fixed clearance so the same gears get screws in every print profile
function screw_r_out() = SCREW_R + (SCREW_NUT[0] + 0.3) / cos(30) / 2 + 1;
function has_screws(r_outer) = r_outer >= screw_r_out() + 1.2;   // 23.85 (M2) / 18.1 (M1.5) / 15.5 (M1): 30T, 30T, 40T and up
module screw_holes(thickness = GEAR_T) {   // z = 0 is the bottom face
    nut = (SCREW_NUT[0] + fit("nut_clear")) / cos(30);
    for (i = [0 : 5]) rotate(30 + i * 60) translate([SCREW_R, 0, 0]) {
        translate([0, 0, -1]) cylinder(d = SCREW_D + fit("bolt_clear"), h = thickness + 2, $fn = 24);
        if (i % 2 == 0) translate([0, 0, thickness - SCREW_HEAD[1] - 0.2]) cylinder(d = SCREW_HEAD[0] + fit("nut_clear") + 0.3, h = SCREW_HEAD[1] + 1, $fn = 32);
        else translate([0, 0, -EPS]) rotate(30) cylinder(d = nut, h = SCREW_NUT_UP + SCREW_NUT[1] + 0.2, $fn = 6);
    }
}
// The joints cut into both faces of a part `thickness` tall whose body reaches
// r_outer (r_jaws: how far it reaches at the jaw band, when that differs).
module face_joints(thickness = GEAR_T, r_outer = 0, r_jaws = undef) {
    rp = r_outer > 0 ? r_outer : undef;
    rj = is_undef(r_jaws) ? (r_outer > 0 ? r_outer : 1e3) : r_jaws;
    translate([0, 0, thickness]) top_cut(rp, rj);
    bottom_cut(rp, rj);
    if (JOINT == "bolts" && has_screws(r_outer)) screw_holes(thickness);
}
// The jaws standing on the top face of a part `thickness` tall.
module face_jaws(thickness = GEAR_T, r_jaws = 1e3) translate([0, 0, thickness]) top_jaws(r_jaws);

// Joint ring: the spacer between two screwed gears. Clearance holes for the
// screws and for pins, so pins and screws can share a joint.
module joint_ring() {
    difference() {
        cylinder(r = screw_r_out() + 1.5, h = JRING_T);
        translate([0, 0, -1]) cylinder(d = CPL_ID, h = JRING_T + 2);
        for (i = [0 : 5]) rotate(30 + i * 60) translate([SCREW_R, 0, -1]) cylinder(d = SCREW_D + fit("bolt_clear"), h = JRING_T + 2, $fn = 24);
        for (i = [0 : 5]) rotate(i * 60) translate([PIN_R, 0, -1]) cylinder(d = PIN_D + fit("pin_slip") + 0.2, h = JRING_T + 2, $fn = 24);
    }
}

// Magnet pockets in a face for the magnetic face coupling: six disc magnets on a
// circle outside the pin holes, alternating poles. z = 0 is the face.
MAGNET   = sz([6, 3], [4, 2], [3, 2]); // [diameter, height] of the kit's disc magnets
MAGF_R   = 11 * MOD;                // pocket circle radius: 22 / 16.5, needs a 40T or bigger gear
MAGF_N   = 6;
module magnet_pockets(n = MAGF_N, r = MAGF_R) {
    d = MAGNET[0] + fit("magnet_fit"); h = MAGNET[1] + fit("magnet_fit");
    for (i = [0 : n - 1]) rotate(i * 360 / n) {
        translate([r, 0, -h]) cylinder(d = d, h = h + EPS, $fn = 40);
        if (i % 2 == 0) translate([r - d / 2 - 1.6, 0, -0.6]) cylinder(d = 1.6, h = 0.6 + EPS, $fn = 12);   // dot: north pole up here
    }
}

// Web cutouts between the hub and the rim. Only gears with a wide enough rim get one.
// The hub reaches past the screw pockets (and the magnet pockets if the gear has them).
module face_pattern(teeth, face, thickness = GEAR_T, magnets = false) {
    r_hub = max(PIN_R + PIN_D / 2 + 2, has_screws(gear_rr(teeth)) ? screw_r_out() + 1 : 0, magnets ? MAGF_R + MAGNET[0] / 2 + 1.5 : 0, jaw_hub_r(gear_rr(teeth)));
    r_rim = gear_rr(teeth) - 3;
    if (r_rim - r_hub >= 4 * MOD && face != "solid") {
        translate([0, 0, -EPS]) linear_extrude(thickness + 2 * EPS) {
            if (face == "spokes" || face == "cross") {
                n = face == "spokes" ? 6 : 4;
                w = (face == "spokes" ? 5 : 6) * MOD / 2;
                difference() {
                    circle(r = r_rim);
                    circle(r = r_hub);
                    for (i = [0 : n - 1]) rotate(i * 360 / n) translate([0, -w / 2]) square([r_rim, w]);
                }
            } else if (face == "holes") {
                n = teeth >= 60 ? 8 : 6;
                rm = (r_hub + r_rim) / 2;
                dh = min((r_rim - r_hub) * 0.8, 2 * PI * rm / n * 0.65);
                for (i = [0 : n - 1]) rotate(i * 360 / n) translate([rm, 0]) circle(d = dh);
            }
        }
    }
    if (face == "spiral" && gear_rr(teeth) - r_hub > 4) {
        // a shallow engraved spiral on the top face, like the reference prints
        groove = 1.2; depth = 0.6;
        r0 = r_hub; r1 = gear_rr(teeth) - 2;
        turns = floor((r1 - r0) / 3);
        pts = [for (a = [0 : 6 : 360 * turns]) let(r = r0 + (r1 - r0) * a / (360 * turns)) [r * cos(a), r * sin(a)]];
        translate([0, 0, thickness - depth]) linear_extrude(depth + EPS) stroke(pts, width = groove);
    }
}

// A single gear. z = 0 is the bottom face; the bearing seats from the top.
// magnets = "top" or "bottom" adds six magnet pockets to that face: two such gears
// on one pin, pockets facing across the 2 mm gap, make a magnetic slip coupling
// (no jaws on a magnet top face: the coupling's barrier fills the gap).
module gear(teeth, face = "solid", magnets = "none") {
    assert(teeth % 10 == 0 && teeth >= 20, "teeth must be 20, 30, 40 ... 80");
    assert(magnets == "none" || teeth >= 40, "magnet pockets need a 40T or bigger gear");
    difference() {
        union() {
            gear_blank(teeth);
            if (magnets != "top") face_jaws(GEAR_T, gear_rr(teeth));
        }
        bearing_seat();
        face_joints(GEAR_T, gear_rr(teeth));
        if (magnets == "top") translate([0, 0, GEAR_T]) magnet_pockets();
        if (magnets == "bottom") mirror([0, 0, 1]) magnet_pockets();
        face_pattern(teeth, face, magnets = magnets != "none");
    }
}

// Two gears on one hub, one level apart. The lower gear is the larger one.
// Bottom bearing seats from below, top bearing from above; a 2 mm wall sits
// between them. Lower teeth 0..GEAR_T, upper teeth GEAR_T..LEVEL+GEAR_T-1: the upper
// teeth run all the way down onto the lower gear's top face, so nothing overhangs a
// gap too thin for supports (they used to start 1 mm up, over a root-radius bridge).
module compound_gear(teeth_lower, teeth_upper, face = "solid") {
    assert(teeth_lower > teeth_upper, "the lower gear of a compound must be the larger one");
    h_upper = LEVEL + GEAR_T - 1;
    difference() {
        union() {
            gear_blank(teeth_lower);
            translate([0, 0, GEAR_T - EPS]) gear_blank(teeth_upper, h_upper - GEAR_T + EPS);
            face_jaws(h_upper, gear_rr(teeth_upper));
        }
        double_bearing_seat();
        translate([0, 0, h_upper]) top_cut(gear_rr(teeth_upper), gear_rr(teeth_upper));
        bottom_cut(gear_rr(teeth_lower), gear_rr(teeth_lower));
        face_pattern(teeth_lower, face);
    }
}

// Legacy coupler half (before dowel pins): a flat ring with three printed pegs up
// and three holes between them. Print two. Drop one on the lower gear pegs down,
// the other on top of it flipped and turned 60 degrees: each half's pegs pass through the other's
// holes into the gear beyond, and the two gears turn as one.
module coupler_half() {
    c = fit("slot_clear");
    peg_h = CPL_T + PIN_DEPTH - 0.3;
    difference() {
        union() {
            cylinder(d = CPL_OD, h = CPL_T);
            for (i = [0, 2, 4]) rotate(i * 360 / PIN_N) translate([PIN_R, 0, 0]) {
                cylinder(d = PIN_D, h = peg_h - 0.4, $fn = 32);
                translate([0, 0, peg_h - 0.4]) cylinder(d1 = PIN_D, d2 = PIN_D - 0.8, h = 0.4, $fn = 32);
            }
        }
        translate([0, 0, -EPS]) cylinder(d = CPL_ID, h = CPL_T + 2 * EPS);
        for (i = [1, 3, 5]) rotate(i * 360 / PIN_N) translate([PIN_R, 0, -EPS]) cylinder(d = PIN_D + c, h = CPL_T + 2 * EPS, $fn = 32);
    }
}
