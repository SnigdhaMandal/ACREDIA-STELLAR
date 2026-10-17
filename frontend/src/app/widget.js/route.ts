import { getConfiguredSiteOrigin } from '@/lib/siteUrl';
import { verifyWidgetResponse } from '@/lib/widget/verifyWidget';

/**
 * Serves the embeddable verify widget at its original, unversioned URL
 * (ACREDIA-STELLAR#304, #305).
 *
 * A permanent alias of `/widget/v1.js`: partners embedded this URL before
 * versioning existed, so it stays on v1 forever — a future v2 ships at
 * `/widget/v2.js` and never here. See docs/integrations/verify-widget.md.
 *
 * Generated rather than shipped from `public/` so the canonical origin comes
 * from `src/lib/siteUrl.ts`. Rendered once at build time, which is when
 * NEXT_PUBLIC_SITE_URL / VERCEL_URL are known.
 */
export const dynamic = 'force-static';

export function GET(): Response {
    return verifyWidgetResponse(getConfiguredSiteOrigin());
}
