import '@pf/shell/styles.css';
import { createHub } from '@pf/hub';
import { modules } from './registry.generated';

const hub = createHub(document.getElementById('app')!, {
  title: 'Print Factory',
  tagline: 'Parametric generators for 3D printing and laser cutting. Everything runs on this device.',
  modules,
  links: [{ label: 'Source', href: 'https://github.com/DrFlGd/Print-Factory' }],
});

// The browser check drives the app through this.
(window as unknown as { __pf: typeof hub }).__pf = hub;
