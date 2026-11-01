// tolerances.scad - every fit and clearance in the kit, by print profile.
//
// Pick a profile with `profile`, or pass single overrides as [["key", value], ...]
// (the web app writes custom profiles this way). The fit test coupon prints every
// one of these fits in a single small part so a new printer is dialed in once.

// `profile` and `overrides` are set by gearbox.scad (or -D on the command line).
// Without them: PETG, no overrides.
_profile = is_undef(profile) ? "PETG" : profile;
_overrides = is_undef(overrides) ? [] : overrides;

// key                   PLA     PETG    ABS     what it sets
_tol = [
    ["bearing_bore_d",   22.10,  22.15,  22.20],  // gear seat for a 608 outer race (22.00), light press
    ["bearing606_bore_d",17.10,  17.15,  17.20],  // gear seat for a 606 outer race (17.00), light press
    ["bearing605_bore_d",14.10,  14.15,  14.20],  // gear seat for a 605 outer race (14.00), light press
    ["bore_clear",        0.30,   0.35,   0.35],  // added to a printed bore that slides over a bolt
    ["bolt_clear",        0.40,   0.40,   0.45],  // added to a bolt's nominal diameter for a through hole
    ["nut_clear",         0.20,   0.25,   0.30],  // added across flats of a captive nut or bolt head pocket
    ["slot_clear",        0.30,   0.35,   0.35],  // carriage ridge, the jaws' radial faces and the legacy coupler's peg holes
    ["key_clear",         0.10,   0.12,   0.15],  // each side of a tile's dovetail key to its slot; the key's crush ribs take up the rest
    ["nut_press",         0.05,   0.05,   0.10],  // added across flats of a press-fit nut pocket; its three crush ribs stand 0.25 mm proud of the flats
    ["jaw_flank",         0.08,   0.10,   0.12],  // each tapered jaw flank to its pocket, at full engagement
    ["backlash",          0.20,   0.20,   0.25],  // gear backlash passed to BOSL2
    ["post_fit",          0.05,   0.10,   0.10],  // added to a press-fit socket for a printed stem (slider post plug, legacy posts)
    ["pin_slip",          0.25,   0.30,   0.30],  // added to a dowel pin's diameter for the holes it slides into (gear faces)
    ["pin_press",         0.10,   0.15,   0.15],  // added to a dowel pin's diameter for the hole it is pressed into (hub rings, caps)
    ["magnet_fit",        0.15,   0.20,   0.20],  // added to a disc magnet's diameter and height for its pocket
];

function _profile_col() = _profile == "PLA" ? 1 : _profile == "ABS" ? 3 : 2;

function fit(key) =
    let(ov = [for (o = _overrides) if (o[0] == key) o[1]])
    len(ov) > 0 ? ov[0]
    : let(row = [for (r = _tol) if (r[0] == key) r])
      assert(len(row) == 1, str("unknown fit key: ", key))
      row[0][_profile_col()];
