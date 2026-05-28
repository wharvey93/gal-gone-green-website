// Cloudflare Worker entry point.
// Handles /api/* routes. Everything else falls through to the static assets
// bundle built by Astro (bound as ASSETS via wrangler.jsonc).

import { handleSubmitQuote, type Env as SubmitEnv } from '../functions/api/submit-quote';
import {
  runHealthCheck,
  sendHealthAlert,
  type HealthEnv,
} from '../functions/health-check';

interface WorkerEnv extends SubmitEnv, HealthEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/submit-quote') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      }
      return handleSubmitQuote(request, env);
    }

    if (url.pathname === '/api/health') {
      // On-demand health check. Anyone can hit this — it's read-only and
      // only reports pass/fail per integration, no secrets. Useful for
      // manual verification after a deploy or when debugging.
      const report = await runHealthCheck(env);
      return new Response(JSON.stringify(report, null, 2), {
        status: report.ok ? 200 : 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    // Daily cron — see wrangler.jsonc for schedule.
    const report = await runHealthCheck(env);
    console.log('[health-check]', JSON.stringify(report));
    if (!report.ok) {
      ctx.waitUntil(sendHealthAlert(env, report));
    }
  },
};
