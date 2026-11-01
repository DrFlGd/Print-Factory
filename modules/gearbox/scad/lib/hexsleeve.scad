// hexsleeve.scad - an experiment in stacking without pins: the hex sleeve.
//
// A printed hex tube rides the pin's bolt on two small bearings, one pressed
// into each end (688 for M2, 686 for M1.5, 685 for M1), with a printed core tube
// between their inner races so the bolt clamps races, not the sleeve. Gears, spacer rings and
// levers with a hex bore slide onto it and turn together with it; nothing to pin,
// screw or glue, and a stack is rebuilt by sliding parts off the top. The pin
// stays as it is: base spacer under the sleeve, the knob's boss on top.
//
//   hex_sleeve(levels)   the sleeve for 1 to 4 levels; prints standing
//   hex_core(levels)     the tube between the sleeve's two inner races
//   hex_gear(teeth)      a gear with a hex bore, one level, teeth GEAR_T - 1 tall
//   hex_spacer(levels)   ring between two hex parts: 0 = the 3 mm gap of the next
//                        level, 1 = an empty level as well
//   hex_lever(holes)     a link with a hex hole at one end and flush bearing seats
//                        (a standard bearing, pressed in) on the grid steps clear
//                        of the hex, to drive a link or a slot from a stack
//
// Heights match the standard levels: a hex gear's teeth run from 1 mm above a
// standard gear's bottom to its top, so it meshes with a standard gear on the
// next pin over 7 of its 8 mm (M2).

// Needs standard.scad, gear.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

HEX_BEARING = sz([8, 16, 5], [6, 13, 5], [5, 11, 5]);   // 688, 686, 685: [bore, outside, width]
HEX_BEARING_NAME = sz("688", "686", "685");
HEX_RACE_D = sz(10, 8, 6.6);                          // inner race land: the core presses only that
HEX_WALL = 1.8;                                       // around the bearing at the flats
HEX_AF   = ceil(HEX_BEARING[1] + 0.15 + 2 * HEX_WALL);  // across flats: 20 / 17 / 15
HEX_CLEAR = fit("slot_clear");                        // a hex bore slides over the sleeve
HEX_FLANGE = 1;                                       // the sleeve's bottom flange carries the stack
function hex_r(af) = af / 2 / cos(30);                // corner radius
HEX_GEAR_T = GEAR_T - 1;
HEX_GAP = LEVEL - HEX_GEAR_T;                         // between two hex gears one level apart: 3 mm
// The sleeve's bottom is where a standard gear's bottom is (1 mm above the base
// spacer): its 1 mm flange rings the base spacer and its bottom bearing, pressed
// in from below 1 mm deeper, sits on the spacer like a standard gear's bearing. Its top is where the top standard bearing's
// top would be, under the knob's boss. Hex part k sits on level k from the
// flange top up: 1 + (k - 1) * LEVEL above the sleeve's bottom.
function hex_sleeve_h(levels) = GEAR_T + (levels - 1) * LEVEL;
// smallest gear whose root circle clears the hex corners with a wall
function hex_gear_ok(teeth) = gear_rr(teeth) >= hex_r(HEX_AF + HEX_CLEAR) + 2;

module hex_bore(h) translate([0, 0, -EPS]) rotate(30) cylinder(r = hex_r(HEX_AF + HEX_CLEAR), h = h + 2 * EPS, $fn = 6);

// Seats for the sleeve's small bearings, pressed in from each end against a
// shoulder; the bore between them clears the core tube.
HEX_MID_D = HEX_BEARING[1] - 3;
module hex_bearing_seats(h) {
    b = HEX_BEARING; bore = b[1] + 0.15; step = (bore + HEX_MID_D) / 2;
    translate([0, 0, -EPS]) cylinder(d = bore, h = HEX_FLANGE + b[2] + EPS);
    translate([0, 0, HEX_FLANGE + b[2] - EPS]) cylinder(d1 = step, d2 = HEX_MID_D, h = (step - HEX_MID_D) / 2 + EPS);   // shoulder, chamfered to print
    translate([0, 0, h - b[2]]) cylinder(d = bore, h = b[2] + 1);
    cylinder(d = HEX_MID_D, h = h);
}
function hex_core_h(levels) = hex_sleeve_h(levels) - HEX_FLANGE - 2 * HEX_BEARING[2];

module hex_sleeve(levels = 2) {
    assert(levels >= 1 && levels <= 4, "hex sleeve: 1 to 4 levels");
    h = hex_sleeve_h(levels);
    difference() {
        union() {
            cylinder(r = hex_r(HEX_AF) + 2, h = HEX_FLANGE);                     // flange under the first part
            rotate(30) cylinder(r = hex_r(HEX_AF), h = h, $fn = 6);
        }
        hex_bearing_seats(h);
        // chamfer the top corners so parts find the hex
        translate([0, 0, h - 0.8]) difference() { cylinder(r = hex_r(HEX_AF) + 1, h = 1); cylinder(r1 = hex_r(HEX_AF) + 0.2, r2 = hex_r(HEX_AF) - 0.8, h = 1, $fn = 6); }
    }
}

module hex_core(levels = 2) {
    difference() {
        cylinder(d = HEX_RACE_D, h = hex_core_h(levels));
        translate([0, 0, -EPS]) cylinder(d = BOLT[0] + fit("bore_clear"), h = hex_core_h(levels) + 2 * EPS);
    }
}

module hex_gear(teeth = 40, face = "solid") {
    assert(teeth % 10 == 0 && teeth >= 20, "teeth must be 20, 30, 40 ... 80");
    assert(hex_gear_ok(teeth), str("a ", teeth, "T gear is too small for the hex bore in ", size));
    difference() {
        gear_blank(teeth, HEX_GEAR_T);
        hex_bore(HEX_GEAR_T);
        // lighten like a standard gear; the hub keeps a wall around the hex
        r_hub = hex_r(HEX_AF + HEX_CLEAR) + 3;
        r_rim = gear_rr(teeth) - 3;
        if (face == "spokes" && r_rim - r_hub >= 4 * MOD) translate([0, 0, -EPS]) linear_extrude(HEX_GEAR_T + 2 * EPS) difference() {
            circle(r = r_rim); circle(r = r_hub);
            for (i = [0 : 5]) rotate(i * 60) translate([0, -5 * MOD / 4]) square([r_rim, 5 * MOD / 2]);
        }
    }
}

module hex_spacer(levels = 0) {
    h = HEX_GAP + levels * LEVEL;
    difference() {
        cylinder(r = hex_r(HEX_AF + HEX_CLEAR) + 2, h = h);
        hex_bore(h);
    }
}

// A lever on the stack: one level thick like a gear, a hex hole at the hub end,
// bearing seats from the first grid step clear of the hex (step 2 in every size)
// out to step holes - 1.
function hex_lever_first() = ceil((hex_r(HEX_AF + HEX_CLEAR) + 1.5 + bearing_bore() / 2) / GRID);
module hex_lever(holes = 3) {
    f = hex_lever_first();
    assert(holes > f && holes <= 6, str("hex lever: ", f + 1, " to 6 holes"));
    w_hub = 2 * hex_r(HEX_AF + HEX_CLEAR) + 5;
    w = BEARING[1] + 6;
    L = GRID * (holes - 1);
    difference() {
        linear_extrude(HEX_GEAR_T) hull() { circle(d = w_hub); translate([L, 0]) circle(d = w); }
        hex_bore(HEX_GEAR_T);
        for (i = [f : holes - 1]) translate([GRID * i, 0, -EPS]) cylinder(d = bearing_bore(), h = HEX_GEAR_T + 2 * EPS);   // the bearing is as wide as the lever is thick
    }
}
