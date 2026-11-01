// jaws.scad - the face joint between stacked parts, in three kinds (`joint`):
//
//   jaws   (default) three tapered crescent jaws stand on a part's top face and
//          three matching pockets are cut in its bottom face. The upper part's
//          pockets drop over the lower part's jaws across the 2 mm gap between
//          levels. The jaws' two end flanks lean in 20 degrees, so the upper part
//          seats on the wedge with about 0.1 mm per side to spare instead of the
//          full slot clearance; the radial faces stay straight (the bearings
//          centre the parts). No hardware.
//   pins   the legacy joint: six dowel pin holes in each face, three steel pins
//          join two parts (the printed CPL coupler fits the same holes).
//   bolts  the pins plus a screw clamp: six screw holes, three counterbored from
//          the top, three with a nut pocket underneath (M3 for M2, M2.5 for
//          M1.5, M2 for M1), and the joint ring in the gap.
//
// Each face can be set apart from `joint` (the layout tester's kit export does
// this per level): joint_top = jaws, flat or pins; joint_bottom = pockets,
// groove, flat or pins. A groove is a full ring the jaws of the part below turn
// in, for a free part above a jaw part. "auto" follows `joint`.
//
// The jaws sit on one band per size so any part stacks on any other: M2 between
// the bearing seat and a 20T's root, M1.5 on the pin-hole circle as a thin jaw
// (a 20T keeps its joint), M1 on a 30T's band (an M1 20T has no joint). A part
// whose body is too small for the band gets no jaws or pockets (has_jaws).
//
// Everything prints face down without supports: the jaws narrow as they rise,
// and the pockets' flanks lean 20 degrees in from the bottom face.

// Needs standard.scad, gear.scad: gearbox.scad includes each library file once (a nested
// include would parse BOSL2 again for every file that pulls it in).

JOINT = is_undef(joint) ? "jaws" : joint;
assert(JOINT == "jaws" || JOINT == "pins" || JOINT == "bolts", str("unknown joint: ", JOINT));
JAWS = JOINT == "jaws";
// A module call can set a face for its part with $joint_top / $joint_bottom.
$joint_top = is_undef(joint_top) ? "auto" : joint_top;          // auto, jaws, flat, pins
$joint_bottom = is_undef(joint_bottom) ? "auto" : joint_bottom; // auto, pockets, groove, flat, pins
function top_kind() = $joint_top == "auto" ? (JAWS ? "jaws" : "pins") : $joint_top;
function bottom_kind() = $joint_bottom == "auto" || ($joint_bottom == "groove" && !JAWS) ? (JAWS ? "pockets" : "pins") : $joint_bottom;   // a free gear needs no groove without jaws

JAW_N       = 3;
JAW_ARC     = 40;                                // degrees of arc per jaw at its root
JAW_TAPER   = 20;                                // flank lean from vertical, degrees
JAW_R       = sz([12.6, 16.0], [10.0, 11.6], [8.6, 12.25]);   // jaw band: inner and outer radius
JAW_GAP     = LEVEL - GEAR_T;                    // 2 mm between stacked parts
JAW_ENGAGE  = sz(2.5, 2.0, 2.0);                 // how far a jaw reaches into the pocket above
JAW_H       = JAW_GAP + JAW_ENGAGE;              // above the top face: 4.5 / 4 / 4
JAW_POCKET  = JAW_ENGAGE + sz(0.5, 0.4, 0.4);    // pocket depth: a jaw never bottoms out
JAW_CHAMFER = 0.4;                               // jaw top edges and pocket mouths
JAW_SLOT    = fit("slot_clear");                 // radial clearance each side
JAW_FLANK   = fit("jaw_flank");                  // flank clearance each side at full engagement
// Room for the band: a fixed clearance, so the same parts get jaws in every profile.
JAW_OUT     = JAW_R[1] + 0.35;                   // pocket outer radius
function has_jaws(r_outer) = r_outer >= JAW_OUT + 0.8;   // M2 17.15, M1.5 12.75, M1 13.4: a 20T, a 20T, a 30T
function jaw_w(z) = z * tan(JAW_TAPER);          // how far each flank has moved in at height z

// Outline of one jaw with its flanks moved in by w and its radial faces out by dr.
// The flanks are the jaw's 40 degree edges shifted parallel, so a taper is the
// same width at every radius. Counter-clockwise, centred on +x.
function jaw_outline(w, dr, n = 8) = let(
    ri = JAW_R[0] - dr, ro = JAW_R[1] + dr,
    ao = JAW_ARC / 2 - asin(w / ro), ai = JAW_ARC / 2 - asin(w / ri))
    assert(ao > 1 && ai > 1, "jaw too narrow at the top")
    concat([for (i = [0 : n]) let(a = -ao + 2 * ao * i / n) ro * [cos(a), sin(a)]],
           [for (i = [0 : n]) let(a = ai - 2 * ai * i / n) ri * [cos(a), sin(a)]]);

// A solid lofted through outlines with the same point count: rings = [[z, outline], ...].
module loft(rings) {
    n = len(rings[0][1]); k = len(rings);
    pts = [for (r = rings) for (p = r[1]) [p[0], p[1], r[0]]];
    faces = concat(
        [[for (i = [0 : n - 1]) i]],
        [[for (i = [n - 1 : -1 : 0]) (k - 1) * n + i]],
        [for (j = [0 : k - 2]) for (i = [0 : n - 1]) each let(a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n) [[a, c, d], [a, d, b]]]);
    polyhedron(pts, faces, convexity = 4);
}

// one jaw standing on z = 0, its top edges chamfered so the pocket finds it
module jaw() loft([
    [-EPS, jaw_outline(0, 0)],
    [JAW_H - JAW_CHAMFER, jaw_outline(jaw_w(JAW_H - JAW_CHAMFER), 0)],
    [JAW_H, jaw_outline(jaw_w(JAW_H) + JAW_CHAMFER, -JAW_CHAMFER)]]);

// one pocket cut up from z = 0 (a part's bottom face), matching the top of a jaw
// that stands JAW_GAP below, its mouth chamfered against the first layer's squish
module jaw_pocket() loft([
    [-EPS, jaw_outline(jaw_w(JAW_GAP) - JAW_FLANK - JAW_CHAMFER, JAW_SLOT + JAW_CHAMFER)],
    [JAW_CHAMFER, jaw_outline(jaw_w(JAW_GAP + JAW_CHAMFER) - JAW_FLANK, JAW_SLOT)],
    [JAW_POCKET, jaw_outline(jaw_w(JAW_GAP + JAW_POCKET) - JAW_FLANK, JAW_SLOT)]]);

// a socket for a jaw in a part that sits right on the jaw part's top face (a
// crank's or a pointer's hub ring), z = 0 that face, h tall
module jaw_socket(h) loft([
    [-EPS, jaw_outline(-JAW_FLANK, JAW_SLOT)],
    [h, jaw_outline(jaw_w(h) - JAW_FLANK, JAW_SLOT)]]);

// a full ring the jaws of the part below turn in: a free part above a jaw part
module jaw_groove() {
    r0 = JAW_R[0] - JAW_SLOT; r1 = JAW_R[1] + JAW_SLOT; c = JAW_CHAMFER;
    rotate_extrude($fn = 96) polygon([[r0 - c, -EPS], [r1 + c, -EPS], [r1, c], [r1, JAW_POCKET], [r0, JAW_POCKET], [r0, c]]);
}

// the jaws stand at 60, 180 and 300 degrees on every part, so a crank's arm (along +x)
// runs between two of them
module jaws_ring(angle = 60) for (i = [0 : JAW_N - 1]) rotate(angle + i * 360 / JAW_N) children();

// The faces of a part, by kind. z = 0 is the face; r: how far the part's body
// reaches for the pin holes (undef: room for them), r_jaws: at the jaw band. A
// face too small for the jaws (a cam, the ratchet) takes the pin holes instead.
module top_jaws(r_jaws = 1e3) if (top_kind() == "jaws" && has_jaws(r_jaws)) jaws_ring() jaw();   // add on the top face
module top_cut(r = undef, r_jaws = 1e3) {                                                         // cut from the top face
    k = top_kind();
    if (k == "pins" || (k == "jaws" && !has_jaws(r_jaws))) pin_holes(r);
}
module bottom_cut(r = undef, r_jaws = 1e3) {                                                      // cut up from the bottom face
    k = bottom_kind();
    if (k == "pins" || (k == "pockets" && !has_jaws(r_jaws))) mirror([0, 0, 1]) pin_holes(r);
    else if (k == "pockets") jaws_ring() jaw_pocket();
    else if (k == "groove" && has_jaws(r_jaws)) jaw_groove();
}
// radius a face pattern must keep solid for the jaw band
function jaw_hub_r(r) = JAWS && has_jaws(r) ? JAW_OUT + 1 : 0;

// Legacy straight-flank jaw gear (v0.10.0 test, M2 only): the jaws as first
// printed, for a rock test against the tapered ones.
JG_ARC = 40; JG_R_IN = bearing_bore() / 2 + 1.5; JG_R_OUT = gear_rr(20) - 1.5; JG_ENGAGE = 2.5;
JG_H = (LEVEL - GEAR_T) + JG_ENGAGE; JG_POCKET = JG_ENGAGE + 0.5;
module jg_2d(grow = 0) offset(delta = grow) intersection() {
    difference() { circle(r = JG_R_OUT); circle(r = JG_R_IN); }
    polygon([[0, 0], for (a = [-JG_ARC / 2 : JG_ARC / 8 : JG_ARC / 2]) 2 * JG_R_OUT * [cos(a), sin(a)]]);
}
module jg_steps(c, grow0, steps = 4)
    for (k = [0 : steps - 1]) translate([0, 0, k * c / steps]) linear_extrude(c / steps + EPS) jg_2d(grow0 - c * (k + 1) / steps);
module jaw_gear(teeth = 40, face = "solid") {
    assert(size == "M2", "the straight jaw gears are a test in M2 only");
    assert(teeth % 10 == 0 && teeth >= 20, "teeth must be 20, 30, 40 ... 80");
    c = fit("slot_clear");
    difference() {
        union() {
            gear_blank(teeth);
            for (i = [0 : 2]) rotate(i * 120) translate([0, 0, GEAR_T - EPS]) {
                linear_extrude(JG_H - 0.5) jg_2d();
                translate([0, 0, JG_H - 0.5]) jg_steps(0.5, 0);
            }
        }
        bearing_seat();
        for (i = [0 : 2]) rotate(i * 120) {
            translate([0, 0, -EPS]) linear_extrude(JG_POCKET + EPS) jg_2d(c);
            translate([0, 0, -EPS]) jg_steps(0.5, c + 0.5 + 0.125);
        }
        face_pattern(teeth, face);
    }
}
