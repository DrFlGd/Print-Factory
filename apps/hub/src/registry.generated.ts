// Written by tools/gen-registry.mjs. Do not edit; run `pnpm gen`.
import type { ModuleEntry } from '@pf/hub';

export const modules: ModuleEntry[] = [
  {
    manifest: {"id":"house-number","name":"House Number","summary":"House and office number signs: one or two lines at their own sizes, plates, bands, frames, inlaid or raised numbers, and hidden keyhole mounts.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"signs-text","tags":["sign","house number","door","plaque","text"],"exports":["3mf","stl","obj","zip"],"supersedes":["house-number"],"credits":"Feature set after the Vostok Labs House & Office Number Generator; geometry written for Print Factory.","license":"MIT"},
    load: () => import('../../../modules/house-number/src/index'),
  },
  {
    manifest: {"id":"led-lightbox","name":"Image LED Lightbox","summary":"Turn a picture into a lightbox: a hollow shell with an LED ledge, and a translucent cover with the picture's colours inlaid in its face.","version":"1.0.0","engine":"manifold","process":"3d-print","category":"vases-lamps","tags":["led","lightbox","image","sign","lamp","multicolour"],"exports":["3mf","stl","obj","zip"],"supersedes":["led-lightbox"],"credits":"Jerred's Image LED Lightbox, ported from Generator-Standalone.","license":"MIT","author":"DrFlGd"},
    load: () => import('../../../modules/led-lightbox/src/index'),
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
