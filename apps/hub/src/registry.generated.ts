// Written by tools/gen-registry.mjs. Do not edit; run `pnpm gen`.
import type { ModuleEntry } from '@pf/hub';

export const modules: ModuleEntry[] = [
  {
    manifest: {"id":"bahtinov-mask","name":"Bahtinov Mask","summary":"A focusing mask for your telescope from its focal length, aperture and tube: three gratings, a collar that slides on, printed or cut flat on a laser.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"mechanical","tags":["astronomy","telescope","focus","bahtinov","laser"],"exports":["3mf","stl","svg","dxf","zip"],"supersedes":["astromar-bahtinov-mask-generator","bahtinov-mask"],"credits":"Written for Print Factory from Pavel Bahtinov's published design.","license":"MIT"},
    load: () => import('../../../modules/bahtinov-mask/src/index'),
  },
  {
    manifest: {"id":"bauble","name":"Bauble Maker","summary":"Christmas and holiday ornaments: hollow baubles that print upright in vase mode with a screw-on cap, in 11 shapes with Japanese, Nordic, Art Deco, Gothic, Halloween, Easter and other patterns in relief or openwork, a name or logo; flat ornaments; and a star tree topper with a push-fit socket.","version":"0.2.0","engine":"manifold","process":"3d-print","category":"gifts","tags":["christmas","bauble","ornament","vase mode","tree topper","halloween","easter","name","multicolour"],"exports":["3mf","stl","zip"],"license":"MIT","credits":"Feature set after DSCMaker's bauble maker (dscmaker.shop); written from scratch."},
    load: () => import('../../../modules/bauble/src/index'),
  },
  {
    manifest: {"id":"bubble-pop","name":"Bubble Pop Fidget","summary":"A snap-through pop fidget in any shape or picture outline, with as many pop buttons as fit, printed in one go with the buttons in place.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"puzzles-games","tags":["fidget","pop","toy","picture","print-in-place"],"exports":["3mf","stl","obj","zip"],"supersedes":["bubble-pop"],"credits":"Feature set after the Vostok Labs Bubble Pop Fidget Generator; the pop mechanism and shapes are modelled for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/bubble-pop/src/index'),
  },
  {
    manifest: {"id":"clicker","name":"Image to Clicker","summary":"A pocket clicker around a real mechanical keyboard switch: your picture or letters on the cap, one key or a row of them, with a keyring loop.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"puzzles-games","tags":["fidget","clicker","switch","mx","picture","keychain"],"exports":["3mf","stl","obj","zip"],"supersedes":["clicker-generator"],"credits":"Feature set after the Vostok Labs Clicker Generator; body, cap and switch fit written for Print Factory from the Cherry MX dimensions.","license":"MIT"},
    load: () => import('../../../modules/clicker/src/index'),
  },
  {
    manifest: {"id":"foldbox","name":"Fold-Up Box","summary":"Glue-free box nets printed flat as a thin sheet with grooved fold lines: mailers, trays and tray-and-lid sets, with a logo, window and hand holes.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"boxes","tags":["box","fold","mailer","tray","packaging","gift box"],"exports":["3mf","stl","obj","zip"],"supersedes":["foldbox"],"credits":"Feature set after the Vostok Labs Fold-Up Box Generator; nets and geometry written for Print Factory from the standard glue-free carton structures.","license":"MIT"},
    load: () => import('../../../modules/foldbox/src/index'),
  },
  {
    manifest: {"id":"gearbox","name":"GearBox Gear Board","summary":"Parts and kits for a modular gear board: spur gears on ball bearings, interlocking pegboard tiles, cranks, motor mounts and mechanisms, in three sizes.","version":"1.0.0","engine":"openscad","process":"3d-print","category":"mechanical","tags":["gears","gear board","mechanism","pegboard","bearings","kit","educational"],"exports":["3mf","stl","obj","zip"],"credits":"GearBox by DrFlGd: its OpenSCAD library, part table and kit catalog, ported directly. Gears by BOSL2 (BSD-2-Clause). Rendered by OpenSCAD (GPL-2.0-or-later), loaded as a separate program.","license":"MIT","author":"DrFlGd"},
    load: () => import('../../../modules/gearbox/src/index'),
  },
  {
    manifest: {"id":"house-number","name":"House Number","summary":"House and office number signs: one or two lines at their own sizes, plates, bands, frames, inlaid or raised numbers, and hidden keyhole mounts.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"signs-text","tags":["sign","house number","door","plaque","text"],"exports":["3mf","stl","obj","zip"],"supersedes":["house-number"],"credits":"Feature set after the Vostok Labs House & Office Number Generator; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/house-number/src/index'),
  },
  {
    manifest: {"id":"keycap","name":"Custom Keycap","summary":"Keycaps from 1u to a 6.5u spacebar with an icon, logo or letters inlaid, engraved or shine-through, on MX or Choc stems, with a stem fit test.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"customizers","tags":["keycap","keyboard","mx","choc","legend","shine-through"],"exports":["3mf","stl","obj","zip"],"supersedes":["keycap-generator"],"credits":"Feature set after the Vostok Labs Keycap Legend Generator; caps and geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/keycap/src/index'),
  },
  {
    manifest: {"id":"keychain-carabiner","name":"Keychain Carabiner Set","summary":"A snap-hook clip with a spring gate, a chain (open links or printed already linked), connector rings and a charm, in any shape, printed flat in one job.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"keychains","tags":["carabiner","clip","chain","charm","swivel","print-in-place"],"exports":["3mf","stl","obj","zip"],"supersedes":["keychain-carabiner"],"credits":"Feature set after the Vostok Labs Keychain Carabiner Set; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/keychain-carabiner/src/index'),
  },
  {
    manifest: {"id":"label","name":"Bin Label","summary":"Gridfinity and drawer labels: a fastener or library icon, one or two lines or a screw drawn to length, a whole drawer at once, raised, inlaid or engraved.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"storage","tags":["label","gridfinity","organizer","screws","multicolour"],"exports":["3mf","stl","zip"],"supersedes":["gridfinity-label-generator"],"credits":"Feature set after CNC Kitchen's Gridfinity Label Generator (MIT); written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/label/src/index'),
  },
  {
    manifest: {"id":"laser-box","name":"Laser Box","summary":"Finger-jointed boxes cut from plywood, MDF, acrylic or board: open trays, lift-off and hinged lids, and chests of drawers, with dividers, flex tabs and patterns, laid out on your sheets.","version":"1.0.0","engine":"manifold","process":"laser","category":"boxes","tags":["box","laser","finger joint","plywood","drawer","hinge","pattern"],"exports":["svg","dxf","zip"],"supersedes":["laser-box"],"credits":"Feature set after the Vostok Labs Laser Box; the joint model, box styles, patterns and packing written for Print Factory.","license":"MIT","view":"3d"},
    load: () => import('../../../modules/laser-box/src/index'),
  },
  {
    manifest: {"id":"laser-studio","name":"Laser Studio","summary":"Pick a design, type your text, download the cut file: keychains, tags, charms, coasters, ornaments, cake toppers, plant stakes, place cards, QR tags and jigsaws, laid out on your sheet.","version":"1.0.0","engine":"manifold","process":"laser","view":"3d","category":"laser","tags":["laser","keychain","tag","ornament","coaster","cake topper","qr","jigsaw","place cards"],"exports":["svg","dxf","zip"],"supersedes":["laser-studio"],"credits":"Feature set after the Vostok Labs Laser Studio; every design written for Print Factory. QR codes by qrcode-generator (Kazuhiko Arase, MIT).","license":"MIT"},
    load: () => import('../../../modules/laser-studio/src/index'),
  },
  {
    manifest: {"id":"led-lightbox","name":"Image LED Lightbox","summary":"Turn a picture into a lightbox: a hollow shell with an LED ledge, and a translucent cover with the picture's colours inlaid in its face.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"vases-lamps","tags":["led","lightbox","image","sign","lamp","multicolour"],"exports":["3mf","stl","obj","zip"],"supersedes":["led-lightbox"],"credits":"Jerred's Image LED Lightbox, ported from Generator-Standalone.","license":"MIT","author":"DrFlGd"},
    load: () => import('../../../modules/led-lightbox/src/index'),
  },
  {
    manifest: {"id":"magnet","name":"Fridge Magnet & Fidget Slider","summary":"A picture or text as a fridge magnet with pockets sized for the magnets you own, or as a two-piece magnetic slider that clicks.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"gifts","tags":["magnet","fridge","fidget","slider","image","multicolour"],"exports":["3mf","stl","obj","zip"],"supersedes":["magnet-generator"],"credits":"Feature set after the Vostok Labs Image to Fridge Magnet Generator; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/magnet/src/index'),
  },
  {
    manifest: {"id":"name-keychain","name":"Name Keychain","summary":"Name keychains and tags in any of 64 fonts: one, two or three colours, raised, inlaid or engraved letters, with or without an AMS.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"keychains","tags":["keychain","name","text","tag","multicolour"],"exports":["3mf","stl","obj","zip"],"supersedes":["name-keychain"],"credits":"Feature set after the Vostok Labs Name Keychain; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/name-keychain/src/index'),
  },
  {
    manifest: {"id":"pen-topper","name":"Pen Topper","summary":"Name toppers that push onto a pen, pencil, stylus, straw or drawstring: a socket sized to what you own, with grip ribs, in any font, with a symbol.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"gifts","tags":["pen","pencil","topper","name","school","gift"],"exports":["3mf","stl","obj","zip"],"supersedes":["pen-topper"],"credits":"Feature set after the Vostok Labs Pen Topper Generator; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/pen-topper/src/index'),
  },
];
