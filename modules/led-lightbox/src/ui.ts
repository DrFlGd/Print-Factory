import type { ModuleUI } from '@pf/core';
import { imageInput } from '@pf/shell';

export function ui(api: ModuleUI): () => void {
  return imageInput(api, {
    panelTitle: 'Picture',
    title: 'Prepare the picture',
    maxColors: 6,
    hint: 'PNG, JPG or WebP. The outside shape becomes the box; up to six colours are inlaid in the cover.',
  });
}
