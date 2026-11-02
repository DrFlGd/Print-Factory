/** Every design, in the order the Design menu shows them. */
import { minimal, monogram, split, windowCard } from './templates-clean';
import { band, framed, half, logoTile, tall, texture } from './templates-patterns';
import { cornerQr, scanBack, tap } from './templates-qr';
import { dots, orbit, sash, splitName, swoosh } from './templates-shapes';
import type { Template } from './tpl';

export const TEMPLATES: Template[] = [minimal, split, windowCard, monogram, swoosh, orbit, sash, dots, splitName, band, half, framed, tall, logoTile, texture, cornerQr, tap, scanBack];

export const templateById = (id: string): Template => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
