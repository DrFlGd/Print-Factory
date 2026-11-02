import { serve } from '@pf/engine-manifold/worker';
import { build } from './build';

serve(build);
