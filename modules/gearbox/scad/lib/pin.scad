// pin.scad - what goes on a bolt: knob, spacers, bushing.
//
// A pin is a hex bolt (M8 for the M2 kit, M6 for the M1.5 kit) dropped through
// the gear stack into the captive nut under the tile, tightened by hand with a
// printed knob. Spacers between bearing inner races keep every gear free.

// Needs standard.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

// Knob for a hex head bolt (DIN 933). The bolt drops in from the top; the hex
// pocket turns it, the boss underneath presses only the bearing inner race.
module knob() {
    bore = BOLT[0] + fit("bolt_clear");
    af = BOLT[1] + fit("nut_clear");
    pocket = BOLT[2] + 0.2;
    difference() {
        union() {
            cylinder(d = SPACER_OD, h = KNOB_BOSS_H + EPS);
            translate([0, 0, KNOB_BOSS_H]) cylinder(d = KNOB_D, h = KNOB_H - KNOB_BOSS_H);
        }
        translate([0, 0, -EPS]) cylinder(d = bore, h = KNOB_H + 2 * EPS);
        translate([0, 0, KNOB_H - pocket]) cylinder(d = af / cos(30), h = pocket + EPS, $fn = 6);
        for (i = [0 : 11]) rotate(i * 30) translate([KNOB_D / 2 + 0.6, 0, KNOB_BOSS_H + 1])
            cylinder(r = 1.6 * KNOB_D / 20, h = KNOB_H, $fn = 24);
    }
}

// Spacer between two bearing inner races (SPACER_H = one level minus one bearing).
module spacer(h = SPACER_H) {
    id = BOLT[0] + fit("bore_clear");
    difference() {
        cylinder(d = SPACER_OD, h = h);
        translate([0, 0, -EPS]) cylinder(d = id, h = h + 2 * EPS);
    }
}

// Base spacer: sits on the plate under the first bearing, lifts the gear 1 mm clear.
module base_spacer() { spacer(h = BASE_SPACER_H); }

// Plain printed bushing that replaces a bearing (cheap kit, or a gear that
// only turns now and then).
module bushing() {
    difference() {
        cylinder(d = BEARING[1] - 0.1, h = BEARING[2]);
        translate([0, 0, -EPS]) cylinder(d = BOLT[0] + fit("bolt_clear"), h = BEARING[2] + 2 * EPS);
    }
}
