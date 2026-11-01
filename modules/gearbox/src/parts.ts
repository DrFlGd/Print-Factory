// What the generator knows about each part kind: the parameters gearbox.scad accepts,
// their ranges, and how to name the output file. The catalog (catalog/parts.json)
// supplies the ready-made parts and kits. Ported from GearBox (app/src/parts.ts); the
// form in params.json is derived from PART_KINDS (see tests/params.test.ts).
import catalogJson from "../catalog/parts.json";
import tolerancesSource from "../scad/lib/tolerances.scad?raw";

export type ParamValue = string | number;
export type Params = Record<string, ParamValue>;

export type ParamDef = {
  key: string;
  label: string;
  help?: string;
} & ({ type: "select"; options: { value: ParamValue; label: string }[] } | { type: "number"; min: number; max: number; step: number });

export type PartKind = {
  id: string;
  title: string;
  group: string;
  blurb: string;
  params: ParamDef[];
  defaults: Params;
  /** Catalog-style short name for a set of params, e.g. G40, B4x4-M8. */
  name(p: Params): string;
  /** The sizes it is made in, when not all of them. */
  sizes?: readonly Size[];
};
/** Too big for M1's 10 mm grid and 605 bearing (see the asserts in the library). */
const NOT_M1 = ["M2", "M1.5"] as const;

const toothOptions = [20, 30, 40, 50, 60, 70, 80].map(t => ({ value: t, label: `${t} teeth` }));
const NUT_FIT_OPTIONS = [{ value: "press", label: "Press fit (crush ribs)" }, { value: "slip", label: "Slip fit" }];
const faceOptions = ["solid", "spokes", "cross", "holes", "spiral"].map(v => ({ value: v, label: v }));
const tileCount = (key: string, label: string): ParamDef => ({ key, label, type: "number", min: 2, max: 8, step: 1, help: "bolt sockets along this edge, one grid step each" });
const faceSuffix = (p: Params) => (p.face && p.face !== "solid" ? `-${p.face}` : "");
const flipOption = (ready: string): ParamDef => ({ key: "flip", label: "Orientation", type: "select", options: [{ value: "true", label: ready }, { value: "false", label: "As used" }] });

/** Kits with an assembly view (scad/lib/assembly.scad), in menu order. */
export const ASSEMBLY_KITS: [string, string][] = [
  ["joint", "Joining two gears"], ["crank", "Hand crank"], ["pointer", "Pointer and dial"], ["motor", "N20 motor"], ["nema17", "NEMA 17 motor"],
  ["ratchet", "Ratchet and pawl"], ["linkage", "Crank-rocker linkage"], ["rack", "Rack and pinion"], ["yoke", "Scotch yoke"], ["slider", "Crank slider"], ["cam", "Cam and follower"],
  ["geneva", "Geneva drive"], ["quickreturn", "Quick return"], ["escapement", "Escapement"], ["spring", "Wind-up spring"], ["winch", "Winch"], ["planetary", "Planetary set"],
  ["shaft", "Shaft bracket, bevel pair and worm"], ["flywheel", "Flywheel"], ["maggear", "Magnetic gears"], ["magcouple", "Magnetic face coupling"], ["hexsleeve", "Hex sleeve stack"], ["jaws", "Straight jaw gear stack (M2 test)"],
];

export const PART_KINDS: PartKind[] = [
  {
    id: "gear", title: "Gear", group: "Gears",
    blurb: "Spur gear with a bearing seat in the hub and a joint in both faces (Settings, Gear joints). With jaws: three tapered jaws stand on the top face and three pockets are cut underneath, so the gear above drops onto the jaws and the two turn as one, with no hardware; cranks and pointers drop over the jaws too. A free gear that must turn on its own above a jaw gear takes a groove underneath instead of pockets. With pins: six dowel pin holes in each face (three pins join two gears); pins + screws adds a screw clamp on gears with room. Two gears mesh when their tooth counts add up to a multiple of 20.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions, help: "patterns only appear when the rim is wide enough (40 teeth and up)" },
      { key: "magnets", label: "Magnet pockets", type: "select", options: [{ value: "none", label: "None" }, { value: "top", label: "Top face (lower gear of a magnetic coupling)" }, { value: "bottom", label: "Bottom face (upper gear)" }], help: "six disc magnets for a magnetic slip coupling between two gears on one pin; 40 teeth and up" },
      { key: "joint_top", label: "Top face (jaws)", type: "select", options: [{ value: "auto", label: "Jaws" }, { value: "flat", label: "Flat" }], help: "with the jaws joint: flat when nothing joins onto this gear" },
      { key: "joint_bottom", label: "Bottom face (jaws)", type: "select", options: [{ value: "auto", label: "Pockets (joined to the gear below)" }, { value: "groove", label: "Groove (free above a jaw gear)" }] },
    ],
    defaults: { teeth: 40, face: "spokes", magnets: "none", joint_top: "auto", joint_bottom: "auto" },
    name: p => `G${p.teeth}${p.joint_bottom === "groove" ? "F" : ""}${faceSuffix(p)}${p.magnets === "top" ? "-MT" : p.magnets === "bottom" ? "-MB" : ""}${p.joint_top === "flat" ? "-FT" : ""}`,
  },
  {
    id: "compound", title: "Compound gear", group: "Gears",
    blurb: "Two gears in one part: a large gear below and a small one on top, one bearing in each. Stack it on a pin for a reduction without a joint; the faces carry the same joints as a gear (jaws on the small gear's top, pockets under the large one).",
    params: [
      { key: "teeth", label: "Lower teeth", type: "select", options: toothOptions },
      { key: "teeth_upper", label: "Upper teeth", type: "select", options: toothOptions, help: "must be smaller than the lower gear" },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions },
    ],
    defaults: { teeth: 60, teeth_upper: 20, face: "spokes" },
    name: p => `G${p.teeth}-${p.teeth_upper}${faceSuffix(p)}`,
  },
  {
    id: "tile", title: "Board tile", group: "Board and pins",
    blurb: "Interlocking pegboard tile: a flat top with a plain bolt hole at every grid point, a captive nut pocket under each hole, and dovetail keys on every edge. Crush ribs on the male keys take up the print clearance so joined tiles have no play. Prints top face down with no supports.",
    params: [
      tileCount("tile_nx", "Sockets across"),
      tileCount("tile_ny", "Sockets down"),
      { key: "nut_fit", label: "Nut pockets", type: "select", options: NUT_FIT_OPTIONS, help: "press: the nut pushes in over three crush ribs and stays put; a rod down the bolt hole pushes it out again" },
      { key: "flip", label: "Orientation", type: "select", options: [{ value: "true", label: "Print-ready (top face down)" }, { value: "false", label: "As used (top face up)" }] },
    ],
    defaults: { tile_nx: 4, tile_ny: 4, nut_fit: "press", flip: "true" },
    name: p => `B${p.tile_nx}x${p.tile_ny}${p.nut_fit === "slip" ? "-SN" : ""}`,
  },
  {
    id: "knob", title: "Bolt knob", group: "Board and pins",
    blurb: "Printed knob that grips the hex head of the bolt so pins are tightened by hand. Its boss is the last spacer and presses only the bearing inner race.",
    params: [], defaults: {}, name: () => "K",
  },
  {
    id: "spacer", title: "Spacer", group: "Board and pins",
    blurb: "Sits between bearing inner races so stacked gears turn freely. 3 mm fills the gap between levels; 10 mm skips a level.",
    params: [{ key: "spacer_h", label: "Height (mm)", type: "number", min: 1, max: 10, step: 0.5 }],
    defaults: { spacer_h: 3 },
    name: p => `S${String(p.spacer_h).replace(".", "_")}`,
  },
  {
    id: "base_spacer", title: "Base spacer", group: "Board and pins",
    blurb: "2 mm ring on the plate under the first bearing, so the bottom gear clears the tile.",
    params: [], defaults: {}, name: () => "BS",
  },
  {
    id: "joint_ring", title: "Joint ring", group: "Board and pins",
    blurb: "For the pins + screws joint: a 1.8 mm ring that fills the gap between two screwed gears, with holes for the three screws and the three dowel pins. Turn the upper gear 60 degrees so its counterbores sit over the lower gear's nut pockets.",
    params: [], defaults: {}, name: () => "JRING",
  },
  {
    id: "coupler", title: "Coupler half (legacy)", group: "Legacy and test",
    blurb: "The old printed peg coupler, kept for gears printed with pin holes (before v0.8.0, or with the pins joint). Steel dowel pins replace it: three pins in the face holes join two gears.",
    params: [], defaults: {}, name: () => "CPL",
  },
  {
    id: "bushing", title: "Bushing", group: "Board and pins",
    blurb: "Plain printed ring in place of a bearing, for a gear that only turns now and then.",
    params: [], defaults: {}, name: () => "BSH",
  },
  {
    id: "crank", title: "Crank", group: "Add-ons",
    blurb: "Hub ring on any gear's top face under the knob, with a thick arm and a hex pocket at the throw. With jaws the ring and a collar drop over the gear's three jaws; with pins three short steel dowel pins pressed into the ring key it. A kit bolt dropped in from below is the crank post: a long spacer, the handle and a nut make a hand crank; a bearing and a nut carry a link for a crank-rocker, a yoke or a quick-return lever. Prints upside down.",
    params: [
      { key: "throw", label: "Throw (mm)", type: "select", options: [20, 30, 40, 50, 60, 70, 80].map(v => ({ value: v, label: `${v} mm` })) },
      flipOption("Print-ready (hub ring up)"),
    ],
    defaults: { throw: 40, flip: "true" },
    name: p => `CRANK${p.throw}`,
  },
  {
    id: "post", title: "Crank post (legacy)", group: "Legacy and test",
    blurb: "The old printed crank post for cranks printed before v0.8.0; a kit bolt is the crank post now.",
    params: [{ key: "post_h", label: "Height (mm)", type: "number", min: 8, max: 40, step: 1 }],
    defaults: { post_h: 11 },
    name: p => (Number(p.post_h) === 11 ? "POST" : Number(p.post_h) === 28 ? "POSTH" : `POST${p.post_h}`),
  },
  { id: "joint", title: "Joint post", group: "Add-ons", blurb: "Flanged post that joins two links to each other away from any pin: a bearing in each link, a 3 mm spacer between, the cap pinned on top.", params: [], defaults: {}, name: () => "JOINT" },
  { id: "handle", title: "Handle grip", group: "Add-ons", blurb: "Free-spinning grip over the handle spacer on the crank bolt; the nut clamps the spacer, so the grip turns.", params: [], defaults: {}, name: () => "HANDLE" },
  { id: "handle_spacer", title: "Handle spacer", group: "Add-ons", blurb: "The long spacer the handle grip turns on: it sits on the crank's boss and the nut clamps it.", params: [], defaults: {}, name: () => "SH" },
  { id: "cap", title: "Post cap", group: "Add-ons", blurb: "Disc that sits on the bearing at the top of a printed post (slider post, joint post, planet posts). A steel dowel pin pressed through it into the post keeps it on.", params: [], defaults: {}, name: () => "CAP" },
  {
    id: "pointer", title: "Pointer", group: "Add-ons",
    blurb: "Hub ring on a gear's top face (it drops over the jaws, or with pins three short steel dowel pins key it), with a thin arm that runs under the dial knob and shows past its rim. Prints upside down.",
    params: [flipOption("Print-ready (hub ring up)")], defaults: { flip: "true" }, name: () => "PTR",
  },
  {
    id: "dial_knob", title: "Dial knob", group: "Add-ons",
    blurb: "The bolt knob with a numbered disc under the grip: clock numbers and 60 ticks raised around its rim. It replaces the knob on a pin that carries a pointer. With jaws its disc sits higher, over the jaw tops, so its pin takes the dial bolt length.",
    params: [], defaults: {}, name: () => "DIALK",
  },
  {
    id: "pulley", title: "Pulley", group: "Add-ons",
    blurb: "Grooved wheel for a rubber band on the same hub as a gear (bearing seat, the same joints). Its size is a tooth-count equivalent, so a P40 driving a P20 is 2:1 like the gears. Any centre distance works; cross the band to reverse.",
    params: [{ key: "pulley_n", label: "Size", type: "select", options: toothOptions.map(o => ({ value: o.value, label: `${o.value} (${o.value} mm at M1 scale)` })) }],
    defaults: { pulley_n: 40 },
    name: p => `P${p.pulley_n}`,
  },
  {
    id: "link", title: "Link", group: "Add-ons",
    blurb: "Bar with bearing seats one grid step apart, one level thick. Pivots on a pin or a crank post; two links and a crank make a crank-rocker.",
    params: [{ key: "holes", label: "Holes", type: "number", min: 2, max: 6, step: 1 }],
    defaults: { holes: 3 },
    name: p => `L${p.holes}`,
  },
  {
    sizes: NOT_M1,
    id: "ratchet", title: "Ratchet wheel", group: "Add-ons",
    blurb: "Twelve sawtooth teeth on the gear hub; joins to a gear with three dowel pins (it is too small for the jaws, so it keeps pin holes in every joint mode). Turns clockwise past the pawl and locks the other way.",
    params: [], defaults: {}, name: () => "RATCHET",
  },
  {
    sizes: NOT_M1,
    id: "pawl", title: "Pawl", group: "Add-ons",
    blurb: "Clamps on a pin two sockets from the ratchet (the knob boss and the spacer grip it). A printed leaf spring carries the tooth. Flip it for a ratchet that must lock clockwise.",
    params: [{ key: "flip_pawl", label: "Direction", type: "select", options: [{ value: "false", label: "Locks counter-clockwise" }, { value: "true", label: "Locks clockwise" }] }],
    defaults: { flip_pawl: "false" },
    name: p => (p.flip_pawl === "true" ? "PAWL-L" : "PAWL"),
  },
  {
    id: "motor_mount", title: "N20 motor mount", group: "Motors",
    blurb: "Bridge that bolts into the two sockets at (-1, 2) and (1, 2) from the motor socket and holds an N20 gearmotor upside down over it, shaft down into the pinion. Two knobs and two 1-level bolts hold it. Prints legs down.",
    params: [{ key: "level", label: "Pinion level", type: "select", options: [1, 2, 3].map(v => ({ value: v, label: `level ${v}` })) }],
    defaults: { level: 1 },
    name: p => (Number(p.level) === 1 ? "MOTOR" : `MOTOR${p.level}`),
  },
  {
    id: "pinion", title: "Motor pinion", group: "Motors",
    blurb: "20T gear with a D bore for the motor shaft instead of a bearing: 3 mm for an N20, 5 mm for a NEMA 17.",
    params: [{ key: "shaft", label: "Shaft", type: "select", options: [{ value: "n20", label: "N20, 3 mm D" }, { value: "nema17", label: "NEMA 17, 5 mm D" }] }],
    defaults: { shaft: "n20" },
    name: p => (p.shaft === "nema17" ? "PINION5" : "PINION"),
  },
  {
    sizes: NOT_M1,
    id: "nema_mount", title: "NEMA 17 motor mount", group: "Motors",
    blurb: "Two legs bolt into the sockets at (-2, 0) and (2, 0) from the motor socket and carry a plate the stepper screws onto from below, shaft down into the PINION5 at level 1, 2 or 3. Prints legs down.",
    params: [{ key: "level", label: "Pinion level", type: "select", options: [1, 2, 3].map(v => ({ value: v, label: `level ${v}` })) }],
    defaults: { level: 1 },
    name: p => (Number(p.level) === 1 ? "NEMA17" : `NEMA17-L${p.level}`),
  },
  {
    id: "ring", title: "Planetary ring gear", group: "Drives",
    blurb: "60T internal gear on two legs that bolt in four sockets away on either side of the sun's pin; it sits over the planets, one level above the carrier. Prints upside down (legs up).",
    params: [{ key: "level", label: "Planets on level", type: "select", options: [2, 3].map(v => ({ value: v, label: `level ${v}` })) }, flipOption("Print-ready (legs up)")],
    defaults: { level: 2, flip: "true" },
    name: p => `RING-L${p.level}`,
  },
  {
    id: "carrier", title: "Planet carrier", group: "Drives",
    blurb: "A 60T gear with four posts on its top face for 20T planets on bearings (two are enough), each kept on by a cap pinned into the post. A plain 20T sun on the pin above it drives the planets inside the ring: sun in, carrier out, 4:1.",
    params: [], defaults: {}, name: () => "CARRIER",
  },
  {
    id: "bracket", title: "Shaft bracket", group: "Drives",
    blurb: "A bar along a socket row with a bearing housing at each end; the bolt through the bearings is a horizontal shaft at the middle of level 4. The bar's bolt heads sit flush in hex pockets (tighten with a socket). Prints flat.",
    params: [{ key: "span", label: "Housings apart (sockets)", type: "number", min: 2, max: 4, step: 1 }],
    defaults: { span: 4 },
    name: p => (Number(p.span) === 4 ? "BRACKET" : `BRACKET${p.span}`),
  },
  {
    id: "bevel", title: "Bevel gear on a pin", group: "Drives",
    blurb: "A 20T or 40T spur gear with a tall hub and a 20T bevel on top; it fills its pin on level 1, and its mate on the bracket's shaft sits two sockets away. Prints teeth up.",
    params: [{ key: "teeth", label: "Spur teeth", type: "select", options: [20, 40].map(v => ({ value: v, label: `${v} teeth` })) }],
    defaults: { teeth: 20 },
    name: p => (Number(p.teeth) === 40 ? "BEVEL40" : "BEVEL"),
  },
  { id: "bevel_shaft", title: "Bevel gear on the shaft", group: "Drives", blurb: "The mate, with a hub back to the first housing and a nut pocket that keys and clamps it to the shaft bolt. Prints hub down.", params: [], defaults: {}, name: () => "BEVEL-S" },
  {
    id: "worm", title: "Worm", group: "Drives",
    blurb: "Single-start worm the length of the gap between the housings, keyed to the shaft by a nut in its hub. Turns a 20T worm gear two rows from the shaft or a 40T three rows out, one tooth per turn. Prints standing; slow with cooling.",
    params: [{ key: "span", label: "Housings apart (sockets)", type: "number", min: 2, max: 4, step: 1 }],
    defaults: { span: 4 },
    name: p => (Number(p.span) === 4 ? "WORM" : `WORM${p.span}`),
  },
  {
    id: "worm_gear", title: "Worm gear", group: "Drives",
    blurb: "Throated gear for the worm, on the usual hub, on level 4 beside the middle of the bracket.",
    params: [{ key: "teeth", label: "Teeth", type: "select", options: [20, 40].map(v => ({ value: v, label: `${v} teeth` })) }],
    defaults: { teeth: 40 },
    name: p => `WG${p.teeth}`,
  },
  {
    id: "mag_gear", title: "Magnetic gear", group: "Magnets",
    blurb: "A disc with disc magnets standing in slots around its rim, north and south outward in turn (a dot marks north). Two of them on the grid turn each other through a 1 mm air gap like gears of 2.5 teeth per pole, with no contact: 16 poles behave as a 40T, so two MG16 sit four sockets apart. They slip instead of jamming, a built-in torque limiter.",
    params: [{ key: "poles", label: "Poles (magnets)", type: "select", options: [12, 16, 20, 24].map(v => ({ value: v, label: `${v} magnets, like a ${2.5 * v}T` })) }],
    defaults: { poles: 16 },
    name: p => `MG${p.poles}`,
  },
  { id: "barrier", title: "Coupling barrier", group: "Magnets", blurb: "A 3 mm spacer with a 0.8 mm flange that fills the gap between the two gears of a magnetic face coupling. It is clamped between the bearings' inner races, so it stands still while both gears turn: torque through a wall.", params: [], defaults: {}, name: () => "MAGB" },
  {
    sizes: ["M2"],
    id: "jaw_gear", title: "Straight jaw gear (test)", group: "Legacy and test",
    blurb: "The first jaw test (v0.10.0, M2): three crescent jaws with straight flanks on the top face and matching pockets underneath. Kept for a rock test against the tapered jaws every gear now has: the straight jaw needs the full slot clearance on both flanks, about 2.8 degrees of play against about 0.8.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions.filter(o => o.value === "solid" || o.value === "spokes") },
    ],
    defaults: { teeth: 40, face: "spokes" },
    name: p => `JG${p.teeth}${faceSuffix(p)}`,
  },
  {
    id: "hex_sleeve", title: "Hex sleeve", group: "Legacy and test",
    blurb: "A printed hex tube that turns on the pin's bolt on two small bearings pressed into its ends (688 for M2, 686 for M1.5, 685 for M1), with the core tube between their inner races. Hex-bore gears, spacers and levers slide onto it and turn together: no pins or screws, and a stack comes apart by sliding parts off the top. Base spacer below, knob on top, as on any pin. Prints standing.",
    params: [{ key: "hex_levels", label: "Levels", type: "select", options: [1, 2, 3, 4].map(v => ({ value: v, label: `${v} level${v > 1 ? "s" : ""}` })) }],
    defaults: { hex_levels: 2 },
    name: p => `HXS${p.hex_levels}`,
  },
  {
    id: "hex_core", title: "Hex sleeve core", group: "Legacy and test",
    blurb: "The thin tube inside a hex sleeve, between its two bearings' inner races, so the bolt clamps the races and not the sleeve. Make it for the same number of levels as the sleeve.",
    params: [{ key: "hex_levels", label: "Levels", type: "select", options: [1, 2, 3, 4].map(v => ({ value: v, label: `${v} level${v > 1 ? "s" : ""}` })) }],
    defaults: { hex_levels: 2 },
    name: p => `HXC${p.hex_levels}`,
  },
  {
    id: "hex_gear", title: "Hex-bore gear", group: "Legacy and test",
    blurb: "A gear with a hex bore that slides onto the hex sleeve, 1 mm thinner than a standard gear so a 3 mm gap is left to the next level. It meshes with standard gears on the next pin like any gear of its size.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions.filter(o => o.value === "solid" || o.value === "spokes") },
    ],
    defaults: { teeth: 40, face: "spokes" },
    name: p => `HG${p.teeth}${faceSuffix(p)}`,
  },
  {
    id: "hex_spacer", title: "Hex spacer", group: "Legacy and test",
    blurb: "A hex-bore ring between two parts on the sleeve: the 3 mm gap to the next level, or that plus one or two empty levels.",
    params: [{ key: "hex_levels", label: "Empty levels", type: "select", options: [0, 1, 2].map(v => ({ value: v, label: v ? `skips ${v} level${v > 1 ? "s" : ""}` : "next level" })) }],
    defaults: { hex_levels: 0 },
    name: p => `HSP${p.hex_levels}`,
  },
  {
    id: "hex_lever", title: "Hex lever", group: "Legacy and test",
    blurb: "A lever one level thick with a hex hole at the hub end and flush seats for standard bearings from two grid steps out (the first step is too close to the hex), to drive a link or a slot from a stack.",
    params: [{ key: "holes", label: "Holes", type: "select", options: [3, 4, 5, 6].map(v => ({ value: v, label: `${v} holes, ${v - 2} bearing seat${v > 3 ? "s" : ""}` })) }],
    defaults: { holes: 4 },
    name: p => `HL${p.holes}`,
  },
  { id: "flywheel", title: "Flywheel", group: "Drives", blurb: "A disc on the gear hub with eight nut pockets around the rim: drop in nuts for the mass. Smooths a crank's or an escapement's drive.", params: [], defaults: {}, name: () => "FLYWHEEL" },
  {
    id: "rail", title: "Slider rail", group: "Rail and sliders",
    blurb: "Dovetail rail that bolts into the sockets at both ends of the row beside it; carriages slide along it. Prints flat.",
    params: [{ key: "rail_n", label: "Sockets spanned", type: "number", min: 2, max: 8, step: 1 }],
    defaults: { rail_n: 4 },
    name: p => `RAIL${p.rail_n}`,
  },
  {
    id: "carriage", title: "Carriage", group: "Rail and sliders",
    blurb: "Slides on the rail; a square pocket on top takes the scotch yoke's tower or the slider post. Prints upside down.",
    params: [flipOption("Print-ready (upside down)")], defaults: { flip: "true" }, name: () => "CARRIAGE",
  },
  {
    id: "rack", title: "Rack carriage", group: "Rail and sliders",
    blurb: "Carriage with a toothed bar along one side; a gear on the level of the teeth drives it back and forth. The pitch line is one grid step from the rail, so a 20T sits two rows away and a 40T three. Prints upside down.",
    params: [
      { key: "rack_len", label: "Length (grid steps)", type: "number", min: 2, max: 4, step: 1 },
      { key: "level", label: "Teeth at level", type: "select", options: [1, 2].map(v => ({ value: v, label: `level ${v}` })) },
      flipOption("Print-ready (upside down)"),
    ],
    defaults: { rack_len: 2, level: 1, flip: "true" },
    name: p => `RACK${p.rack_len}${Number(p.level) > 1 ? `-L${p.level}` : ""}`,
  },
  {
    id: "yoke", title: "Scotch yoke", group: "Rail and sliders",
    blurb: "Tower that plugs into the carriage and carries a slotted plate two levels above the crank's gear; the crank post's bearing rides in the slot and the carriage reciprocates with a pure sine motion. Prints upside down.",
    params: [
      { key: "level", label: "Crank gear on level", type: "select", options: [1, 2].map(v => ({ value: v, label: `level ${v}` })) },
      { key: "throw", label: "Crank throw (mm)", type: "select", options: [20, 30, 40].map(v => ({ value: v, label: `${v} mm` })) },
      { key: "reach", label: "Reach (grid steps)", type: "number", min: 2, max: 6, step: 1 },
      flipOption("Print-ready (upside down)"),
    ],
    defaults: { level: 1, throw: 20, reach: 3, flip: "true" },
    name: p => `YOKE${p.throw}R${p.reach}${Number(p.level) > 1 ? `-L${p.level}` : ""}`,
  },
  {
    id: "slider_post", title: "Slider post", group: "Rail and sliders",
    blurb: "Column that plugs into the carriage with a post on top at the crank's link level; a link from the crank post makes a crank slider.",
    params: [{ key: "level", label: "Crank gear on level", type: "select", options: [1, 2].map(v => ({ value: v, label: `level ${v}` })) }],
    defaults: { level: 1 },
    name: p => `SLPOST${Number(p.level) > 1 ? `-L${p.level}` : ""}`,
  },
  {
    id: "cam", title: "Cam", group: "Mechanisms",
    blurb: "Disc cam on a bearing, one level thick, lifting the follower by half a grid step: an eccentric for a smooth sine, a heart for an even rise and fall, a snail for a slow rise and a drop.",
    params: [{ key: "cam", label: "Profile", type: "select", options: [{ value: "eccentric", label: "Eccentric" }, { value: "heart", label: "Heart" }, { value: "snail", label: "Snail" }] }],
    defaults: { cam: "eccentric" },
    name: p => `CAM-${String(p.cam).slice(0, 1).toUpperCase()}`,
  },
  { id: "follower", title: "Cam follower", group: "Mechanisms", blurb: "Arm on a pin two sockets from the cam with a round nose that rides the cam's edge. The tail carries an output post (a bolt with a bearing one level up) for a link to a rocker, pointer or flag, and a hole for the rubber band that holds the nose on the cam.", params: [], defaults: {}, name: () => "FOLLOWER" },
  {
    id: "geneva_driver", title: "Geneva driver", group: "Mechanisms",
    blurb: "A 40T gear with a drive post and a locking crescent one level up: it turns the wheel one slot per turn and locks it in between. Takes two bearings.",
    params: [{ key: "slots", label: "Wheel slots", type: "select", options: [6, 8].map(v => ({ value: v, label: `${v}` })) }],
    defaults: { slots: 6 },
    name: p => `GENEVA${p.slots}-D`,
  },
  {
    id: "geneva_wheel", title: "Geneva wheel", group: "Mechanisms",
    blurb: "Slotted wheel on a pin three sockets from its driver, one level above it. Dwells while the crescent holds it.",
    params: [{ key: "slots", label: "Slots", type: "select", options: [6, 8].map(v => ({ value: v, label: `${v}` })) }],
    defaults: { slots: 6 },
    name: p => `GENEVA${p.slots}`,
  },
  {
    id: "partial", title: "Partial gear", group: "Gears",
    blurb: "Gear with teeth on only half or a quarter of its rim: whatever it meshes with turns in bursts and rests between them.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "keep", label: "Toothed rim", type: "select", options: [{ value: "half", label: "Half" }, { value: "quarter", label: "Quarter" }] },
    ],
    defaults: { teeth: 40, keep: "half" },
    name: p => `G${p.teeth}${p.keep === "quarter" ? "Q" : "H"}`,
  },
  {
    id: "qr_lever", title: "Quick-return lever", group: "Mechanisms",
    blurb: "Slotted lever on a pin a few sockets from a crank; the crank post's bearing rides in the slot, so the lever swings slowly one way and quickly back. A post socket at the far end takes a link.",
    params: [
      { key: "d_steps", label: "Pivot distance (grid steps)", type: "number", min: 2, max: 4, step: 1 },
      { key: "throw", label: "Crank throw (mm)", type: "select", options: [20, 30, 40].map(v => ({ value: v, label: `${v} mm` })) },
    ],
    defaults: { d_steps: 3, throw: 20 },
    name: p => `QR${p.d_steps}-${p.throw}`,
  },
  { sizes: NOT_M1, id: "escape_wheel", title: "Escape wheel", group: "Mechanisms", blurb: "15 tooth ratchet-shaped wheel for the anchor escapement; it steps one tooth per swing of the anchor.", params: [], defaults: {}, name: () => "ESCWHEEL" },
  {
    sizes: NOT_M1,
    id: "anchor", title: "Anchor", group: "Mechanisms",
    blurb: "Recoil anchor on a pin two sockets from the escape wheel, with a balance bar that sets the beat. Clamps on the pin with its nut.",
    params: [{ key: "cw", label: "Wheel runs", type: "select", options: [{ value: "true", label: "clockwise (standard)" }, { value: "false", label: "counter-clockwise (mirrored)" }] }],
    defaults: { cw: "true" },
    name: p => (p.cw === "false" ? "ANCHOR-L" : "ANCHOR"),
  },
  {
    id: "spring_gear", title: "Spring gear", group: "Spring and winch",
    blurb: "Gear with a wall on its top face for the wind-up spring; the spring's outer hook catches a notch in the wall.",
    params: [{ key: "teeth", label: "Teeth", type: "select", options: toothOptions.filter(o => Number(o.value) >= 30) }],
    defaults: { teeth: 40 },
    name: p => `SG${p.teeth}`,
  },
  { id: "spring", title: "Wind-up spring", group: "Spring and winch", blurb: "Printed spiral spring (PETG works best): its boss grips the bearing's inner race on a pin held by its knob, the hook catches the spring gear's wall. Wind the knob, let the train run down.", params: [], defaults: {}, name: () => "SPRING" },
  { id: "winch", title: "Winch drum", group: "Spring and winch", blurb: "Two-level drum with a bottom flange on two bearings; a string winds on it. The top flange presses on.", params: [], defaults: {}, name: () => "WINCH" },
  { id: "winch_flange", title: "Winch flange", group: "Spring and winch", blurb: "Press-on top flange for the winch drum.", params: [], defaults: {}, name: () => "WFLANGE" },
  { id: "hook", title: "Hook", group: "Spring and winch", blurb: "Small hook for the end of the winch string.", params: [], defaults: {}, name: () => "HOOK" },
  {
    id: "assembly", title: "Kit assembly", group: "Kits",
    blurb: "A kit put together on a board tile: every printed part in the print colour and the hardware (bolts, nuts, bearings, magnets, motors, and with the pin joints dowel pins and screws) in steel grey. Exploded pulls everything apart along its bolt in the order it goes on. This is a picture to build from, not a part to print: the Kits tab downloads the parts.",
    params: [
      { key: "kit", label: "Kit", type: "select", options: ASSEMBLY_KITS.map(([value, label]) => ({ value, label })) },
      { key: "explode", label: "View", type: "select", options: [{ value: 0, label: "Assembled" }, { value: 1, label: "Exploded" }] },
    ],
    defaults: { kit: "joint", explode: 0 },
    name: p => `ASM-${p.kit}${Number(p.explode) ? "-x" : ""}`,
  },
  {
    id: "coupon", title: "Fit test coupon", group: "Legacy and test",
    blurb: "One small print that checks every fit in the kit: bolt holes, nut pockets (one press fit on crush ribs, one slip), a dovetail pair with the key's crush ribs (two coupons chain key to slot), the bearing seat, a magnet pocket and the face joint: with jaws, three jaws on the bearing block for a gear's pockets to drop over (M2 and M1.5; M1's block takes pin holes); with pins, the dowel pin holes (slip fit in the bearing block's face, press fit in the strip). Print this first and tune the profile.",
    params: [], defaults: {}, name: () => "COUPON",
  },
  {
    id: "module_plate", title: "Magnetic module plate (test)", group: "Legacy and test",
    blurb: "A standalone base for one mechanism that snaps to other module plates on any edge with magnets, so a mechanism is built once and plugged into others without moving a bolt. Every grid step of every edge carries a north-out and a south-out disc magnet (the dot marks north out) and a ridge and groove, so any edge mates any edge, turned any way and shifted by whole sockets. Ports: a gear whose pitch circle touches the edge meshes with the port opposite it; the centre of a 3x3, 5x5 or 7x7 plate takes a 30T, 50T or 70T hub that touches all four edges. The outer ring has no sockets: no gear may cross an edge.",
    params: [
      { key: "mod_n", label: "Size", type: "select", options: [3, 5, 7, 9].map(n => ({ value: n, label: `${n} x ${n} sockets (hub port ${n * 10}T)` })) },
      { key: "mod_magnets", label: "Magnets", type: "select", options: [{ value: "all", label: "Every step" }, { value: "centre", label: "Every other step from the middle (centred joints only)" }] },
      { key: "flip", label: "Orientation", type: "select", options: [{ value: "true", label: "Print-ready (top face down)" }, { value: "false", label: "As used (top face up)" }] },
    ],
    defaults: { mod_n: 5, mod_magnets: "all", flip: "true" },
    name: p => `MOD${p.mod_n}${p.mod_magnets === "centre" ? "-C" : ""}`,
  },
];

export const partKind = (id: string) => PART_KINDS.find(k => k.id === id);

/** Part groups in list order. Kit assemblies live in the Kits tab; the legacy and test parts in Settings. */
export const LEGACY_GROUP = "Legacy and test";
export const PART_GROUPS = ["Gears", "Board and pins", "Add-ons", "Motors", "Drives", "Rail and sliders", "Mechanisms", "Spring and winch", "Magnets"];
export const isLegacyKind = (id: string) => partKind(id)?.group === LEGACY_GROUP;

/** Kits in the Kits tab, by group. The legacy and test kits are reached from Settings. */
export const KIT_GROUPS: [string, string[]][] = [
  ["Basics", ["starter", "joint", "crank", "pointer"]],
  ["Motors", ["motor", "nema17"]],
  ["Mechanisms", ["ratchet", "linkage", "rack", "yoke", "slider", "cam", "geneva", "quickreturn", "escapement", "spring", "winch"]],
  ["Drives", ["planetary", "shaft", "flywheel"]],
  ["Magnets", ["maggear", "magcouple"]],
];
export const LEGACY_KITS = ["coupon", "hexsleeve", "jaws"];
export const kitGroup = (kitId: string) => KIT_GROUPS.find(([, ids]) => ids.includes(kitId))?.[0] ?? LEGACY_GROUP;
/** Kits that have an assembled view in scad/lib/assembly.scad. */
export const hasAssembly = (kitId: string) => ASSEMBLY_KITS.some(([id]) => id === kitId);

export const SIZES = ["M2", "M1.5", "M1"] as const;
export type Size = (typeof SIZES)[number];
export type Standard = { title: string; module: number; grid: number; level: number; gear_thickness: number; bolt: string; bearing: string; nut: string; knob_d: number; dial_r: number; spacer_od: number; tile_h: number; plate_t: number; bolt_lengths: Record<string, number>;
  /** Hardware beyond the bolts: dowel pin sizes, the clamp screw, magnets, post bolt lengths (mm), the pin circle, the smallest
   *  radius that has screw holes and the smallest that has room for the jaws. */
  hardware: { pin: string; pin_hub: string; screw: string; magnet: string; crank_bolt: number; follower_bolt: number; handle_bolt: number; lever_bolt: number; shaft_bolt: number; pin_r: number; screw_min_r: number; jaw_min_r: number };
  /** Bolt lengths for a pin whose dial knob stands over a jaw gear (it is taller than a knob). */
  dial_bolt_lengths: Record<string, number>;
};
export type CatalogPart = { name: string; title: string; group: string; params: Params; sizes?: Size[]; expect?: Partial<Record<Size, number[]>> };
/** A catalog part is made in a size unless its `sizes` list leaves it out. */
export const partInSize = (p: CatalogPart, size: Size) => !p.sizes || p.sizes.includes(size);
/** A kit is made in a size when every part in it is. */
export const kitInSize = (kitId: string, size: Size) => (catalog.kits[kitId]?.parts ?? []).every(n => { const p = catalogPart(n); return !p || partInSize(p, size); });
/** A kit: its parts and hardware with jaws; `parts_bolts` / `hardware_pins` where pins (or pins + screws) differ. */
export type Kit = { title: string; parts: string[]; hardware: string[]; parts_bolts?: string[]; hardware_pins?: string[] };
export type Catalog = { standards: Record<Size, Standard>; mesh_rule: string; profiles: string[]; parts: CatalogPart[]; kits: Record<string, Kit> };
export const catalog = catalogJson as unknown as Catalog;
export const catalogPart = (name: string) => catalog.parts.find(p => p.name === name);
export const kitParts = (kit: Kit, joint: Joint) => (joint === "bolts" && kit.parts_bolts) || kit.parts;
export const kitHardware = (kit: Kit, joint: Joint) => (joint !== "jaws" && kit.hardware_pins) || kit.hardware;

export const PROFILES = ["PLA", "PETG", "ABS"] as const;
export type Profile = (typeof PROFILES)[number];

export type ToleranceRow = { key: string; values: Record<Profile, number>; what: string };

/** Parse the `_tol` table out of scad/lib/tolerances.scad so the app and the library never disagree. */
export function parseTolerances(src = tolerancesSource): ToleranceRow[] {
  const rows: ToleranceRow[] = [];
  const re = /\[\s*"(\w+)"\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*,?\s*(?:\/\/\s*(.*))?/g;
  for (const m of src.matchAll(re)) {
    rows.push({ key: m[1]!, values: { PLA: Number(m[2]), PETG: Number(m[3]), ABS: Number(m[4]) }, what: (m[5] ?? "").trim() });
  }
  return rows;
}

export type Overrides = Record<string, number>;

/** How stacked parts join (scad/lib/jaws.scad): tapered jaws (the default), the legacy dowel pins, or pins plus a screw clamp. */
export const JOINTS = ["jaws", "pins", "bolts"] as const;
export type Joint = (typeof JOINTS)[number];
export const JOINT_TITLES: Record<Joint, string> = { jaws: "Jaws", pins: "Dowel pins", bolts: "Pins + screws" };

/** The -D defines for one render. A part's params can set its own joint (the layout export does). */
export function defines(kindId: string, params: Params, size: Size, profile: Profile, overrides: Overrides, joint: Joint = "jaws"): string[] {
  const out = [`part="${kindId}"`, `size="${size}"`, `profile="${profile}"`];
  for (const [k, v] of Object.entries<ParamValue>({ joint, ...params })) out.push(`${k}=${v === "true" || v === "false" || typeof v !== "string" ? v : JSON.stringify(v)}`);
  const ov = Object.entries(overrides).filter(([, v]) => Number.isFinite(v));
  if (ov.length) out.push(`overrides=[${ov.map(([k, v]) => `["${k}",${v}]`).join(",")}]`);
  return out;
}

/** A human-readable problem with the parameters, or null. */
export function validate(kindId: string, p: Params, size?: Size): string | null {
  if (kindId === "compound" && Number(p.teeth_upper) >= Number(p.teeth)) return "The upper gear must have fewer teeth than the lower gear.";
  if (size) {
    const k = partKind(kindId);
    if (k?.sizes && !k.sizes.includes(size)) return `The ${k.title.toLowerCase()} is not made in ${size}: it does not fit the ${catalog.standards[size].grid} mm grid. Pick another size.`;
    if (size === "M1" && kindId === "spring_gear" && Number(p.teeth) < 50) return "In M1 the spring needs a gear of 50 teeth or more.";
    if (size === "M1" && kindId === "mag_gear" && Number(p.poles) < 16) return "In M1 a magnetic gear needs 16 magnets or more.";
    if (size === "M1" && kindId === "hex_gear" && Number(p.teeth) < 30) return "In M1 a hex-bore gear needs 30 teeth or more: a 20T has no wall left around the hex.";
    if (kindId === "assembly" && !kitInSize(String(p.kit), size)) return `This kit is not made in ${size}: some of its parts do not fit the ${catalog.standards[size].grid} mm grid.`;
  }
  return null;
}

/** Which catalog tooth counts mesh with this one (sum is a multiple of 20). */
export const meshesWith = (teeth: number) => toothOptions.map(o => Number(o.value)).filter(t => (t + teeth) % 20 === 0);
