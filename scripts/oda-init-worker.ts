/// <reference types="@cloudflare/workers-types" />

import { initializeOdaRtree } from '../src/oda-schema';
import type { Env } from '../src/types';

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const success = await initializeOdaRtree(env);
    return Response.json({
      success,
      message: success ? 'ODA R-tree initialized' : 'ODA R-tree initialization failed',
    });
  },
};
