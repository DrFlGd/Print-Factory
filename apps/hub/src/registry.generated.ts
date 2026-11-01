// Written by tools/gen-registry.mjs. Do not edit; run `pnpm gen`.
import type { ModuleEntry } from '@pf/hub';

export const modules: ModuleEntry[] = [
  {
    manifest: {"id":"bubble-pop","name":"Bubble Pop Fidget","summary":"A snap-through pop fidget in any shape or picture outline, with as many pop buttons as fit, printed in one go with the buttons in place.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"puzzles-games","tags":["fidget","pop","toy","picture","print-in-place"],"exports":["3mf","stl","obj","zip"],"supersedes":["bubble-pop"],"credits":"Feature set after the Vostok Labs Bubble Pop Fidget Generator; the pop mechanism and shapes are modelled for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/bubble-pop/src/index'),
  },
  {
    manifest: {"id":"house-number","name":"House Number","summary":"House and office number signs: one or two lines at their own sizes, plates, bands, frames, inlaid or raised numbers, and hidden keyhole mounts.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"signs-text","tags":["sign","house number","door","plaque","text"],"exports":["3mf","stl","obj","zip"],"supersedes":["house-number"],"credits":"Feature set after the Vostok Labs House & Office Number Generator; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/house-number/src/index'),
  },
  {
    manifest: {"id":"keycap","name":"Custom Keycap","summary":"Keycaps from 1u to a 6.5u spacebar with an icon, logo or letters inlaid, engraved or shine-through, on MX or Choc stems, with a stem fit test.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"customizers","tags":["keycap","keyboard","mx","choc","legend","shine-through"],"exports":["3mf","stl","obj","zip"],"supersedes":["keycap"],"credits":"Feature set after the Vostok Labs Keycap Legend Generator; caps and geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/keycap/src/index'),
  },
  {
    manifest: {"id":"keychain-carabiner","name":"Keychain Carabiner Set","summary":"A snap-hook clip with a spring gate, a chain (open links or printed already linked), connector rings and a charm, in any shape, printed flat in one job.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"keychains","tags":["carabiner","clip","chain","charm","swivel","print-in-place"],"exports":["3mf","stl","obj","zip"],"supersedes":["keychain-carabiner"],"credits":"Feature set after the Vostok Labs Keychain Carabiner Set; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/keychain-carabiner/src/index'),
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
