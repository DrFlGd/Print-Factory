// board.scad - interlocking board tiles.
//
// A tile is nx by ny bolt sockets on the grid: a flat plate with plain holes
// on top, a rib skirt underneath with a captive nut pocket under every hole.
// Print it top face down: the flat top gets the bed finish and every pocket,
// rib and dovetail grows straight up with no support. Nuts push into the
// pockets from below; the bolt comes down through the gear stack into them.
// Edges carry vertical dovetail keys that alternate male and female so any
// two tiles drop together on any edge; crush ribs on the male keys take up the
// print clearance so the joint has no play. The nut pockets are a press fit on
// crush ribs too (nut_fit = "press"), or a plain slip fit.

// Needs standard.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

// `nut_fit` is set by gearbox.scad (or -D nut_fit="slip"); press when nothing sets it.
NUT_PRESS = is_undef(nut_fit) ? true : nut_fit == "press";

// Everything removed from the tile for one socket, centred on the origin,
// z = 0 at the plate underside, z = PLATE_T at the plate top.
// turn = true turns the nut pocket 30 degrees (see NUT_STAGGER).
// press = true cuts the pocket for the press fit: nut_ribs() adds its ribs after.
module socket_cut(turn = false, press = NUT_PRESS) {
    bolt = BOLT[0] + fit("bolt_clear");
    af = BOLT[1] + fit(press ? "nut_press" : "nut_clear");
    translate([0, 0, -SKIRT_H - EPS]) cylinder(d = bolt, h = TILE_H + 2 * EPS);
    // nut pocket: open at the skirt bottom, ceiling is the plate underside
    translate([0, 0, -SKIRT_H - EPS]) rotate(turn ? 30 : 0) cylinder(d = af / cos(30), h = SKIRT_H + EPS, $fn = 6);
}

// Three crush ribs on alternate flats of a press-fit nut pocket, added to the
// tile after socket_cut(). Each is a rounded ridge NUT_RIB[1] proud of its flat,
// the full pocket height, tapered over the last 0.5 mm at the mouth so the nut
// finds them. The nut flattens them as it is pushed in and sits on the three
// opposite flats; a rod down the bolt hole pushes it out again.
module nut_ribs(turn = false) {
    af = BOLT[1] + fit("nut_press");
    for (a = [30, 150, 270]) rotate(a + (turn ? 30 : 0))
        translate([af / 2 + NUT_RIB[0] / 2 - NUT_RIB[1], 0, -SKIRT_H]) {
            cylinder(d1 = 0.1, d2 = NUT_RIB[0], h = 0.5, $fn = 16);
            translate([0, 0, 0.5]) cylinder(d = NUT_RIB[0], h = SKIRT_H - 0.5 + EPS, $fn = 16);
        }
}

// Boss under the plate that carries a nut pocket.
module socket_boss() {
    af = BOLT[1] + fit("nut_clear");
    translate([0, 0, -SKIRT_H]) cylinder(d = af / cos(30) + 2 * BOSS_WALL, h = SKIRT_H + EPS, $fn = 24);
}

// Dovetail key profile in XY: neck on the tile edge (y = 0), tail at y = depth.
// grow: added all round for the female cut (negative for a male key). The slot
// grows by half of key_clear and the key shrinks by the same, so the key clears
// the slot by key_clear on every side. A male key (grow < 0) also gets a root
// from inside the tile out to its neck, so the key is one solid with the tile
// and not a loose piece standing off its edge.
KEY_ROOT = 0.6;   // how far a male key's root reaches into the tile
module dovetail_2d(grow = 0) {
    n = DOVETAIL[0] + 2 * grow; t = DOVETAIL[1] + 2 * grow; d = DOVETAIL[2] + grow;
    polygon([[-n / 2, -grow - EPS], [n / 2, -grow - EPS], [t / 2, d], [-t / 2, d]]);
    if (grow < 0) translate([-n / 2, -KEY_ROOT]) square([n, KEY_ROOT - grow + EPS]);
}

// A male key standing on z = 0 in the dovetail_2d frame, full tile height, with
// a chamfer on its bottom end so it slides into the slot, and one crush rib down
// the middle of each tail flank. The ribs stand KEY_RIB[1] proud of the flank,
// more than the key_clear gap, so the first assembly flattens them against the
// slot and the joint is preloaded: no pull-apart, no slide along the edge. They
// start above the chamfer with a 0.5 mm taper.
module male_key() {
    c = fit("key_clear");
    translate([0, 0, 0.6]) linear_extrude(TILE_H - 0.6) dovetail_2d(-c / 2);
    translate([0, 0, 0.6]) mirror([0, 0, 1]) linear_extrude(0.6, scale = 0.9) dovetail_2d(-c / 2);
    n = DOVETAIL[0] - c; t = DOVETAIL[1] - c; d = DOVETAIL[2] - c / 2;
    flank = [(t - n) / 2, d];                      // neck corner to tail corner, +x side
    nrm = [flank[1], -flank[0]] / norm(flank);     // its outward normal
    for (s = [1, -1]) {
        mid = [s * (n + t) / 4, d / 2];
        at = mid + [s * nrm[0], nrm[1]] * (KEY_RIB[1] - KEY_RIB[0] / 2);
        translate([at[0], at[1], 0.6]) {
            cylinder(d1 = 0.1, d2 = KEY_RIB[0], h = 0.5, $fn = 16);
            translate([0, 0, 0.5]) cylinder(d = KEY_RIB[0], h = TILE_H - 1.1, $fn = 16);
        }
    }
}

// The matching slot, cut through the full tile height.
module female_slot() {
    c = fit("key_clear");
    translate([0, 0, -EPS]) linear_extrude(TILE_H + 2 * EPS) dovetail_2d(c / 2);
}

// Which key goes at index i of m positions along one edge:
// 1 = male, -1 = female, 0 = none. Two tiles meet edge to edge with one edge
// reversed, so the pattern must be its own complement when reversed:
// key_kind(m - 1 - i) == -key_kind(i). The first half alternates male, female,
// ...; the second half mirrors it with the kinds swapped; an odd middle is
// skipped. (A 2-socket edge has one position, the middle, and gets no key.)
// m = 3: male, none, female.  m = 4: male, female, male, female.
// m = 5: male, female, none, male, female.
function key_kind(i, m) =
    i < floor(m / 2) ? (i % 2 == 0 ? 1 : -1)
    : (m % 2 == 1 && i == (m - 1) / 2) ? 0
    : -key_kind(m - 1 - i, m);

// Positions along the tile edges, walking counter-clockwise: [x, y, angle, kind]
// angle is the outward normal of that edge.
function edge_keys(nx, ny) =
    let(W = tile_size(nx), H = tile_size(ny))
    [
        for (k = [1 : nx - 1]) [GRID * k,     0, -90, key_kind(k - 1, nx - 1)],  // bottom, +x
        for (k = [1 : ny - 1]) [W, GRID * k,       0, key_kind(k - 1, ny - 1)],  // right, +y
        for (k = [1 : nx - 1]) [W - GRID * k, H,  90, key_kind(k - 1, nx - 1)],  // top, -x
        for (k = [1 : ny - 1]) [0, H - GRID * k, 180, key_kind(k - 1, ny - 1)],  // left, -y
    ];

// The tile as used: top face up at z = TILE_H. (Flip it in the slicer, or
// render with `flip = true` to get it print-ready with the top on the bed.)
module tile(nx = 4, ny = 4, flip = false) {
    W = tile_size(nx); H = tile_size(ny);
    keys = edge_keys(nx, ny);
    translate(flip ? [0, H, TILE_H] : [0, 0, 0]) rotate(flip ? [180, 0, 0] : [0, 0, 0])
    union() {
    difference() {
        union() {
            // plate
            translate([0, 0, SKIRT_H]) cube([W, H, PLATE_T]);
            // perimeter wall
            difference() {
                cube([W, H, SKIRT_H + EPS]);
                translate([WALL_T, WALL_T, -EPS]) cube([W - 2 * WALL_T, H - 2 * WALL_T, SKIRT_H + 3 * EPS]);
            }
            // ribs on every interior grid line
            for (k = [1 : nx - 1]) translate([GRID * k - RIB_T / 2, 0, 0]) cube([RIB_T, H, SKIRT_H + EPS]);
            for (k = [1 : ny - 1]) translate([0, GRID * k - RIB_T / 2, 0]) cube([W, RIB_T, SKIRT_H + EPS]);
            // nut pocket bosses
            for (i = [0 : nx - 1], j = [0 : ny - 1])
                translate([hole_pos(i), hole_pos(j), SKIRT_H]) socket_boss();
            // male keys
            for (key = keys) if (key[3] == 1)
                translate([key[0], key[1], 0]) rotate(key[2] - 90) male_key();
        }
        // sockets
        for (i = [0 : nx - 1], j = [0 : ny - 1])
            translate([hole_pos(i), hole_pos(j), SKIRT_H]) socket_cut(NUT_STAGGER && (i + j) % 2 == 1);
        // female keys
        for (key = keys) if (key[3] == -1)
            translate([key[0], key[1], 0]) rotate(key[2] + 90) female_slot();
    }
    // the press-fit pockets' crush ribs, inside the pockets just cut
    if (NUT_PRESS) for (i = [0 : nx - 1], j = [0 : ny - 1])
        translate([hole_pos(i), hole_pos(j), SKIRT_H]) nut_ribs(NUT_STAGGER && (i + j) % 2 == 1);
    }
}
