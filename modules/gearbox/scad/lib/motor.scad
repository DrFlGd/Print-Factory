// motor.scad - the N20 gearmotor mount and its pinion.
//
// The mount is a bridge: two legs bolt into the sockets at [-1, 2] and [1, 2]
// grid steps from the motor socket, joined by a wall; a block from the wall
// reaches toward the motor and a short tongue (a 17 mm bridge in the print)
// carries the cradle. The motor sits in the cradle upside down with its shaft
// pointing down through the tongue into a 20T pinion at `level`. Everything
// around the pinion stays outside its 22 mm tip radius, so the pinion meshes
// with a gear on any socket except the two between the legs. Prints legs down.
//
// N20 "micro metal gearmotor": 12 x 10 mm body, 3 mm D shaft 10 mm long, two
// M1.6 holes 9 mm apart on the gearbox face. Pick a 100:1 or 300:1 ratio.

// Needs standard.scad, gear.scad, jaws.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

NEMA_SHAFT_D = 5;
N20_W = 12; N20_H = 10; N20_HOLE_PITCH = 9; N20_SHAFT_D = 3; N20_SHAFT_L = 10;
N20_WALL = 1.6;
MOUNT_PLATE_T = 2.5;
MOUNT_GAP = 1.5;                                  // between the pinion top and the plate
LEG_D = BOLT[1] + 2 * 2.5;                        // leg around the bolt hole, knob boss sits on top
function mount_h(level) = BASE_SPACER_H + (level - 1) * LEVEL + GEAR_T + MOUNT_GAP + MOUNT_PLATE_T;

MOUNT_LEGS = [[-1, 2], [1, 2]];                   // leg sockets, in grid steps from the motor socket
function mount_clear() = gear_or(20) + 0.5;       // nothing below the plate inside this radius

module motor_mount(level = 1) {
    assert(level >= 1 && level <= 3, "level 1..3");
    H = mount_h(level);
    bolt = BOLT[0] + fit("bolt_clear");
    pocket = [N20_W + 0.4, N20_H + 0.4];
    cradle = [pocket[0] + 2 * N20_WALL, pocket[1] + 2 * N20_WALL];
    wall = 3;
    y_wall = 2 * GRID;
    y_block = mount_clear() + 0.5;               // the solid block starts here
    difference() {
        union() {
            for (p = MOUNT_LEGS) translate([p[0] * GRID, p[1] * GRID, 0]) cylinder(d = LEG_D, h = H);
            // wall between the legs, block toward the motor: both full height
            translate([-GRID, y_wall - wall / 2, 0]) cube([2 * GRID, wall, H]);
            translate([-cradle[0] / 2, y_block, 0]) cube([cradle[0], y_wall - y_block, H]);
            // tongue to the cradle (bridges over the pinion) and the cradle walls
            translate([-cradle[0] / 2, -cradle[1] / 2, H - MOUNT_PLATE_T]) cube([cradle[0], y_block - (-cradle[1] / 2) + EPS, MOUNT_PLATE_T]);
            translate([-cradle[0] / 2, -cradle[1] / 2, H - EPS]) cube([cradle[0], cradle[1], N20_WALL + 8]);
        }
        for (p = MOUNT_LEGS) translate([p[0] * GRID, p[1] * GRID, -EPS]) cylinder(d = bolt, h = H + 2 * EPS);
        translate([-pocket[0] / 2, -pocket[1] / 2, H]) cube([pocket[0], pocket[1], 20]);
        // shaft and screw holes through the tongue
        translate([0, 0, H - MOUNT_PLATE_T - EPS]) cylinder(d = N20_SHAFT_D + 1.5, h = MOUNT_PLATE_T + 2 * EPS, $fn = 24);
        for (x = [-1, 1]) translate([x * N20_HOLE_PITCH / 2, 0, H - MOUNT_PLATE_T - EPS]) cylinder(d = 1.8, h = MOUNT_PLATE_T + 2 * EPS, $fn = 16);
        // a slot each side of the cradle for a zip tie or the motor leads
        translate([-cradle[0] / 2 - 1, -1.5, H + 3]) cube([cradle[0] + 2, 3, 20]);
    }
}

// 20T pinion with a D bore for the 3 mm motor shaft, no bearing.
module pinion(teeth = 20, shaft = "n20") {
    nema = shaft == "nema17";
    d = (nema ? NEMA_SHAFT_D : N20_SHAFT_D) + 0.15;
    flat = nema ? 2.0 + 0.1 : 1.25 + 0.1;   // NEMA 17: 0.5 mm flat on a 5 mm shaft; N20: 0.25 on 3 mm
    difference() {
        gear_blank(teeth);   // no jaws: the motor mount's plate is right above it
        translate([0, 0, -EPS]) linear_extrude(GEAR_T + 2 * EPS) intersection() {
            circle(d = d, $fn = 32);
            translate([-d, -d]) square([2 * d, d + flat]);
        }
        translate([0, 0, GEAR_T]) top_cut();
    }
}
