import { expect, test, type Page } from '@playwright/test';

/**
 * The embeddable verify widget on a real third-party page (ACREDIA-STELLAR#304).
 *
 * The partner page is fulfilled by Playwright and never reaches the server,
 * so the widget is loaded cross-origin from the Acredia dev server exactly as
 * a partner site would load it — including under a strict partner CSP.
 *
 * The partner lives on `localhost` while the app is on `127.0.0.1`: different
 * origins, both secure contexts. Chromium's Local Network Access rules still
 * gate any cross-origin load from a loopback address, so the permission is
 * granted here — an artefact of the dev server being local; partners load
 * the widget from Acredia's public host and never hit it.
 */

test.use({ permissions: ['local-network-access'] });

function partnerUrl(baseURL: string): string {
    const url = new URL('/__partner-fixture', baseURL);
    url.hostname = 'localhost';
    return url.toString();
}

/** The origin the served widget will link to: the injected one, else its own. */
async function expectedOrigin(page: Page, baseURL: string): Promise<string> {
    const body = await (await page.request.get('/widget.js')).text();
    const injected = body.match(/"canonicalOrigin":(null|"[^"]*")/)?.[1];
    expect(injected, 'served widget must carry a canonicalOrigin field').toBeDefined();
    return injected === 'null' ? new URL(baseURL).origin : JSON.parse(injected as string);
}

async function openPartnerPage(
    page: Page,
    baseURL: string,
    { body, csp, head = '' }: { body: string; csp?: string; head?: string },
) {
    const url = partnerUrl(baseURL);
    await page.route(url, (route) =>
        route.fulfill({
            contentType: 'text/html',
            headers: csp ? { 'Content-Security-Policy': csp } : {},
            body: `<!doctype html><html><head><title>Partner</title>${head}</head><body>${body}</body></html>`,
        }),
    );
    await page.goto(url);
}

test.describe('embeddable verify widget', () => {
    test('serves JavaScript that any site may load', async ({ page }) => {
        const response = await page.request.get('/widget.js');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/javascript');
        expect(response.headers()['cross-origin-resource-policy']).toBe('cross-origin');
        expect(await response.text()).not.toMatch(/vercel\.app|acredia\.example/);
    });

    test('renders a styled link to /verify on a partner page', async ({ page, baseURL }) => {
        const origin = await expectedOrigin(page, baseURL!);
        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget" data-token="42"></div><script src="${baseURL}/widget.js" async></script>`,
        });

        const link = page.getByRole('link', { name: 'Verify with Acredia (opens in a new window)' });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', `${origin}/verify?token=42`);
        await expect(link).toHaveCSS('background-color', 'rgb(10, 37, 64)');
        await expect(page.locator('#acredia-verify-widget')).toHaveAttribute('data-acredia-widget', 'ready');
    });

    test('opens the verification page in a popup', async ({ page, baseURL }) => {
        const origin = await expectedOrigin(page, baseURL!);
        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget" data-token="42"></div><script src="${baseURL}/widget.js"></script>`,
        });

        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            page.getByRole('link', { name: /Verify with Acredia/ }).click(),
        ]);
        await popup.waitForURL(`${origin}/verify?token=42`);

        // The popup cannot reach back into the partner page.
        expect(await popup.evaluate(() => window.opener)).toBeNull();
    });

    test('stays styled under a partner CSP that forbids inline styles', async ({ page, baseURL }) => {
        await openPartnerPage(page, baseURL!, {
            csp: `default-src 'none'; script-src ${new URL(baseURL!).origin}`,
            body: `<div id="acredia-verify-widget"></div><script src="${baseURL}/widget.js"></script>`,
        });

        const link = page.getByRole('link', { name: /Verify with Acredia/ });
        await expect(link).toBeVisible();
        await expect(link).toHaveCSS('background-color', 'rgb(10, 37, 64)');
        await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
    });

    test('takes the partner theme through the documented custom properties', async ({ page, baseURL }) => {
        await openPartnerPage(page, baseURL!, {
            head: '<style>#acredia-verify-widget { --acredia-widget-bg: rgb(200, 0, 0); } a { color: lime !important; }</style>',
            body: `<div id="acredia-verify-widget"></div><script src="${baseURL}/widget.js"></script>`,
        });

        const link = page.getByRole('link', { name: /Verify with Acredia/ });
        await expect(link).toHaveCSS('background-color', 'rgb(200, 0, 0)');
        // The partner's own global link styles do not leak into the widget.
        await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
    });

    test('fails closed when it cannot determine the Acredia origin', async ({ page, baseURL }) => {
        // Inlined into the page (as a bundler would) from a build with no
        // configured origin: there is no script URL to derive one from.
        const body = (await (await page.request.get('/widget.js')).text()).replace(
            /"canonicalOrigin":(null|"[^"]*")/,
            '"canonicalOrigin":null',
        );
        const errors: string[] = [];
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });

        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget" data-token="42"></div><script>${body}</script>`,
        });

        await expect(page.locator('#acredia-verify-widget')).toHaveAttribute('data-acredia-widget', 'error');
        await expect(page.getByRole('link')).toHaveCount(0);
        expect(errors.join('\n')).toMatch(/could not determine the acredia origin/i);
    });
});
