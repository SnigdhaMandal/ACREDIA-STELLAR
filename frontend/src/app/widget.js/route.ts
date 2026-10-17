import { getConfiguredSiteOrigin } from '@/lib/siteUrl';
import { buildVerifyWidgetScript } from '@/lib/widget/verifyWidget';

/**
 * Serves the embeddable verify widget (ACREDIA-STELLAR#304).
 *
 * Generated rather than shipped from `public/` so the canonical origin comes
 * from `src/lib/siteUrl.ts` — one source of truth, no host literal in a static
 * file. Rendered once at build time, which is when NEXT_PUBLIC_SITE_URL /
 * VERCEL_URL are known.
 */
export const dynamic = 'force-static';

export function GET(): Response {
    return new Response(buildVerifyWidgetScript(getConfiguredSiteOrigin()), {
        headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            // Partners embed this URL permanently; keep the cache short so a
            // fix reaches every embed within the hour.
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            // Explicitly loadable from any site, including ones that send
            // Cross-Origin-Embedder-Policy or use crossorigin="anonymous".
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
