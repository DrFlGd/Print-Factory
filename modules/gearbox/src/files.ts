/**
 * Every .scad file the engine needs, embedded at build time: the GearBox library under
 * scad/ and the 34 BOSL2 files that std.scad and gears.scad pull in (lib/BOSL2, BSD-2-Clause).
 * Only the worker imports this, so the page does not carry 3.5 MB of source.
 */
import { LIB_DIR, WORK_DIR } from '@pf/engine-openscad';

const kit = import.meta.glob('../scad/**/*.scad', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const bosl2 = import.meta.glob('../lib/BOSL2/*.scad', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const files: Record<string, string> = {};
for (const [k, v] of Object.entries(kit)) files[`${WORK_DIR}/${k.replace(/^.*\/scad\//, '')}`] = v;
for (const [k, v] of Object.entries(bosl2)) files[`${LIB_DIR}/BOSL2/${k.replace(/^.*\//, '')}`] = v;
