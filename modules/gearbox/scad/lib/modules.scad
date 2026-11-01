// modules.scad - magnetic module plates (test). A module plate is a standalone
// n x n base for one mechanism. Plates sit loose on a table and snap together
// edge to edge with magnets, so a mechanism is built once on its plate and then
// plugged into other mechanisms without moving a bolt.
//
// The rule that makes modules plug together: a gear is a PORT when its pitch
// circle touches the plate's edge (its centre is one pitch radius in from the
// edge). Two ports facing each other across a joint then always mesh, whatever
// their tooth counts. On the grid the sockets sit G/2, 3G/2, 5G/2 ... from an
// edge, so the ports are the odd gears: 30T one socket in, 50T two in, 70T three
// in. The centre socket of an odd plate is a port on all four edges for the gear
// of n x 10 teeth (MOD3: 30T, MOD5: 50T, MOD7: 70T), so any two of these hub
// modules mesh when one is centred on an edge of the other. No gear may cross an
// edge, so the outer ring of sockets is left out: only the inner sockets have a
// bolt hole and a nut pocket.
//
// Edges: every grid step along every edge carries the same pattern, mirrored
// about the step's centre, so any edge meets any edge, either way round and
// shifted along the joint by whole sockets:
//   - two disc magnets standing on edge behind a 0.6 mm skin, a quarter step
//     either side of the step centre: north outward on the left one (the one with
//     the dot behind it), south outward on the right one, counting along the
//     edge anticlockwise seen from above. Facing magnets are always opposite.
//     The slot nearest each corner is left out (it would run into the next
//     edge's slot); a missing magnet only weakens a joint, it never repels.
//   - in the plate (above the magnets) a vertical ridge an eighth of a step after
//     the step boundary and a matching groove an eighth before the next one. The
//     ridge drops into the neighbour's groove and holds the joint against the
//     sideways push of the gear teeth; the magnets hold it shut.
// Prints top face down like a tile: magnet slots, ridges and grooves all grow
// straight up from the bed.

// Needs standard.scad, gear.scad (MAGNET) and board.scad (socket_cut,
// socket_boss, nut_ribs): gearbox.scad includes each library file once.

// `mod_magnets` is set by gearbox.scad; all when nothing sets it.
MOD_ALL_MAGNETS = is_undef(mod_magnets) ? true : mod_magnets == "all";

MOD_SKIN  = 0.6;                                   // plastic between a magnet and the edge face
MOD_BACK  = 1.6;                                   // wall behind a magnet slot (carries the dot)
MOD_SLOT  = [MAGNET[0] + fit("magnet_fit"), MAGNET[1] + fit("magnet_fit")];   // slot: along the edge, into the plate
MOD_BAND  = MOD_SKIN + MOD_SLOT[1] + MOD_BACK;     // solid band inside the skirt wall that holds the magnets
MOD_RIDGE = max(0.6, GRID / 20);                   // ridge height; its base is 3x, its tip 1x this
function mod_size(n) = n * GRID;

// Which steps along an edge of n steps carry a magnet pair: all of them, or
// ("centre") every other step counted from the middle one, which keeps every
// joint between two odd plates centred on each other (the hub layouts) and needs
// less than two thirds of the magnets.
function mod_mag_step(k, n) = MOD_ALL_MAGNETS || ((k - (n - 1) / 2) % 2 == 0);
// slot s (1: north out, 3: south out) of step k, less the two next to the corners
function mod_mag(k, s, n) = mod_mag_step(k, n) && !(k == 0 && s == 1) && !(k == n - 1 && s == 3);
function mod_magnet_count(n) = 4 * len([for (k = [0 : n - 1], s = [1, 3]) if (mod_mag(k, s, n)) k]);
MOD_CORNER = 1.2;                                  // corner chamfer: no thin fin beside the last groove

// The ridge in XY: base on the edge face (y = 0), standing out to +y.
// grow > 0 gives the groove that takes it.
module mod_ridge_2d(grow = 0) {
    h = MOD_RIDGE + grow; b = 3 * MOD_RIDGE + 2 * grow; t = MOD_RIDGE + 2 * grow;
    polygon([[-b / 2, -EPS - (grow > 0 ? 0 : 0.4)], [b / 2, -EPS - (grow > 0 ? 0 : 0.4)], [t / 2, h], [-t / 2, h]]);
}

// One edge, in a frame with the edge running along +x from its start corner at
// the origin, the plate on -y and the outward face at y = 0.
// part = "add": the ridges. part = "cut": the grooves, magnet slots and dots.
module mod_edge(n, part) {
    c = fit("key_clear");
    for (k = [0 : n - 1]) {
        x0 = k * GRID;
        if (part == "add")
            translate([x0 + GRID / 8, 0, SKIRT_H]) linear_extrude(PLATE_T) mod_ridge_2d();
        if (part == "cut") {
            translate([x0 + 7 * GRID / 8, 0, SKIRT_H - EPS]) linear_extrude(PLATE_T + 2 * EPS) mirror([0, 1, 0]) mod_ridge_2d(c);
            for (s = [1, 3]) if (mod_mag(k, s, n)) {
                // slot: the magnet stands on edge, its faces parallel to the edge face,
                // pushed in from the skirt bottom
                translate([x0 + s * GRID / 4 - MOD_SLOT[0] / 2, -MOD_SKIN - MOD_SLOT[1], -EPS])
                    cube([MOD_SLOT[0], MOD_SLOT[1], MOD_SLOT[0] + EPS]);
                // dot on the skirt bottom behind the north-out slot
                if (s == 1) translate([x0 + GRID / 4, -MOD_SKIN - MOD_SLOT[1] - MOD_BACK / 2, -EPS])
                    cylinder(d = 1.0, h = 0.4 + EPS, $fn = 12);
            }
        }
        // a crush rib on the back wall of each slot presses the magnet to the skin
        if (part == "rib") for (s = [1, 3]) if (mod_mag(k, s, n))
            translate([x0 + s * GRID / 4, -MOD_SKIN - MOD_SLOT[1] - NUT_RIB[0] / 2 + NUT_RIB[1], 0]) {
                cylinder(d1 = 0.1, d2 = NUT_RIB[0], h = 0.5, $fn = 16);
                translate([0, 0, 0.5]) cylinder(d = NUT_RIB[0], h = MOD_SLOT[0] - 0.5, $fn = 16);
            }
    }
}

// Place children on each of the four edges, walking anticlockwise from (0, 0).
module mod_edges(n) {
    L = mod_size(n);
    // mirror: the edge frame has the plate on -y; walking anticlockwise the plate is on the left (+y)
    for (e = [[0, 0, 0], [L, 0, 90], [L, L, 180], [0, L, 270]])
        translate([e[0], e[1], 0]) rotate(e[2]) mirror([0, 1, 0]) children();
}

module module_plate(n = 5, flip = false) {
    assert(n >= 3 && n <= 9, "module plate: 3 to 9 sockets a side");
    L = mod_size(n);
    inner = [for (i = [1 : n - 2], j = [1 : n - 2]) [i, j]];
    translate(flip ? [0, L, TILE_H] : [0, 0, 0]) rotate(flip ? [180, 0, 0] : [0, 0, 0])
    union() {
        difference() {
            union() {
                translate([0, 0, SKIRT_H]) cube([L, L, PLATE_T]);
                // skirt: the magnet band all round, ribs on the inner grid lines, nut bosses
                difference() {
                    cube([L, L, SKIRT_H + EPS]);
                    translate([MOD_BAND, MOD_BAND, -EPS]) cube([L - 2 * MOD_BAND, L - 2 * MOD_BAND, SKIRT_H + 3 * EPS]);
                }
                for (k = [1 : n - 1]) {
                    translate([GRID * k - RIB_T / 2, 0, 0]) cube([RIB_T, L, SKIRT_H + EPS]);
                    translate([0, GRID * k - RIB_T / 2, 0]) cube([L, RIB_T, SKIRT_H + EPS]);
                }
                for (s = inner) translate([hole_pos(s[0]), hole_pos(s[1]), SKIRT_H]) socket_boss();
                mod_edges(n) mod_edge(n, "add");
            }
            for (s = inner) translate([hole_pos(s[0]), hole_pos(s[1]), SKIRT_H]) socket_cut(NUT_STAGGER && (s[0] + s[1]) % 2 == 1);
            mod_edges(n) mod_edge(n, "cut");
            for (c = [[0, 0], [L, 0], [L, L], [0, L]]) translate([c[0], c[1], -EPS]) rotate(45)
                cube([2 * MOD_CORNER, 2 * MOD_CORNER, 3 * TILE_H], center = true);
        }
        if (NUT_PRESS) for (s = inner) translate([hole_pos(s[0]), hole_pos(s[1]), SKIRT_H]) nut_ribs(NUT_STAGGER && (s[0] + s[1]) % 2 == 1);
        mod_edges(n) mod_edge(n, "rib");
    }
}
