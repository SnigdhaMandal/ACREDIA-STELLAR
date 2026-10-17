import { getConfiguredSiteOrigin } from '@/lib/siteUrl';
import { verifyWidgetResponse } from '@/lib/widget/verifyWidget';

/**
 * Serves major version 1 of the embeddable verify widget (ACREDIA-STELLAR#305).
 *
 * The URL partners should embed. Only backwards-compatible changes ever ship
 * here; a breaking change gets a new `/widget/v2.js` route instead. See
 * docs/integrations/verify-widget.md for the full policy.
 */
export const dynamic = 'force-static';

export function GET(): Response {
    return verifyWidgetResponse(getConfiguredSiteOrigin());
}
