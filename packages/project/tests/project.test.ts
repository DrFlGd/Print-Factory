import type { ModuleDefinition } from '@pf/core';
import { defaults } from '@pf/core';
import { describe, expect, it } from 'vitest';
import { decodeSettings, encodeSettings, History, loadAutosave, makeProject, memoryStore, projectValues, readProject, saveAutosave, saveUserPreset, userPresets } from '../src/index';

const def: ModuleDefinition = {
  manifest: { id: 'tag', name: 'Tag', summary: 's', version: '1.1.0', engine: 'manifold', process: '3d-print', exports: ['3mf'] },
  params: {
    parameters: [
      { name: 'width', type: 'number', default: 40, min: 10, max: 100 },
      { name: 'label', type: 'string', default: 'Hi' },
    ],
  },
  createWorker: () => {
    throw new Error('not in tests');
  },
  migrate: (v, from) => (from === '1.0.0' && 'w' in v ? { ...v, width: v.w } : v),
};

describe('project files', () => {
  it('round-trips only what differs, and migrates old versions', () => {
    const values = { ...defaults(def.params), width: 55 };
    const file = makeProject(def, values);
    expect(file.values).toEqual({ width: 55 });
    const back = readProject(JSON.stringify(file), def);
    expect(projectValues(def, back)).toEqual(values);
    expect(projectValues(def, { moduleVersion: '1.0.0', values: { w: 70 } as never }).width).toBe(70);
  });

  it('rejects other files with a reason', () => {
    expect(() => readProject('nope')).toThrow(/not JSON/);
    expect(() => readProject('{}')).toThrow(/not a Print Factory/);
    const other = { ...makeProject(def, defaults(def.params)), module: 'box' };
    expect(() => readProject(JSON.stringify(other), def)).toThrow(/made with “box”/);
  });
});

describe('share links', () => {
  it('encodes to a URL-safe token and back, clamping on the way in', () => {
    const t = encodeSettings(def, { ...defaults(def.params), width: 99, label: 'Ünïcode ✓' });
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSettings(def, t)).toEqual({ width: 99, label: 'Ünïcode ✓' });
    expect(encodeSettings(def, defaults(def.params))).toBe('');
    expect(() => decodeSettings(def, 'garbage!')).toThrow(/damaged/);
  });
});

describe('storage', () => {
  it('autosaves and keeps user presets', async () => {
    const s = memoryStore();
    expect(await loadAutosave(s, def)).toBeNull();
    await saveAutosave(s, def, { width: 30, label: 'x' }, { img: [1, 2] });
    expect(await loadAutosave(s, def)).toEqual({ values: { width: 30, label: 'x' }, inputs: { img: [1, 2] } });
    await saveUserPreset(s, def, 'Small', { width: 20, label: 'Hi' });
    await saveUserPreset(s, def, 'Small', { width: 22, label: 'Hi' });
    const list = await userPresets(s, 'tag');
    expect(list.length).toBe(1);
    expect(list[0]!.values).toEqual({ width: 22 });
  });
});

describe('history', () => {
  it('merges rapid changes and undoes and redoes', () => {
    const h = new History(1);
    h.push(2, 1000);
    h.push(3, 1100); // merged with 2
    h.push(4, 5000);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(1);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(3);
    h.push(9, 9000);
    expect(h.canRedo).toBe(false);
  });
});
