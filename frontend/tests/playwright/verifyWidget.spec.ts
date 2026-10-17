import { expect, test, type Page } from '@playwright/test';

/**
 * The embeddable verify widget on a real third-party page
 * (ACREDIA-STELLAR#304, #305). Partner-facing behaviour is documented in
 * docs/integrations/verify-widget.md; these tests hold it to what that
 * document promises.
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

/** Every URL the widget is served at: the versioned one and the legacy alias. */
const SCRIPT_PATHS = ['/widget/v1.js', '/widget.js'] as const;

const LINK_NAME = 'Verify with Acredia (opens in a new window)';

function partnerUrl(baseURL: string): string {
    const url = new URL('/__partner-fixture', baseURL);
    url.hostname = 'localhost';
    return url.toString();
}

/** The origin the served widget will link to: the injected one, else its own. */
async function expectedOrigin(page: Page, baseURL: string): Promise<string> {
    const body = await (await page.request.get('/widget/v1.js')).text();
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

/** Clicks the widget and returns the URL its popup lands on. */
async function popupUrlAfterClick(page: Page, expectedUrl: string): Promise<string> {
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: LINK_NAME }).click()]);
    await popup.waitForURL(expectedUrl);
    return popup.url();
}

/** Console messages and uncaught errors raised on the page. */
function collectPageNoise(page: Page): string[] {
    const noise: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
            noise.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`));
    return noise;
}

test.describe('serving', () => {
    test('both URLs serve the same script, loadable from any site', async ({ page }) => {
        const [versioned, alias] = await Promise.all(SCRIPT_PATHS.map((path) => page.request.get(path)));

        for (const response of [versioned, alias]) {
            expect(response.status()).toBe(200);
            expect(response.headers()['content-type']).toContain('text/javascript');
            expect(response.headers()['cross-origin-resource-policy']).toBe('cross-origin');
            expect(response.headers()['x-acredia-widget-version']).toBe('1');
            // Documented: Acredia sets no cookies when the script loads.
            expect(response.headers()['set-cookie']).toBeUndefined();
        }
        expect(await alias.text()).toBe(await versioned.text());
        expect(await versioned.text()).not.toMatch(/vercel\.app|acredia\.example/);
    });
});

for (const scriptPath of SCRIPT_PATHS) {
    test.describe(`embedded from ${scriptPath}`, () => {
        test('renders the button', async ({ page, baseURL }) => {
            await openPartnerPage(page, baseURL!, {
                body: `<div id="acredia-verify-widget" data-token="42"></div><script src="${baseURL}${scriptPath}" async></script>`,
            });

            const link = page.getByRole('link', { name: LINK_NAME });
            await expect(link).toBeVisible();
            await expect(link).toHaveCSS('background-color', 'rgb(10, 37, 64)');
            await expect(page.locator('#acredia-verify-widget')).toHaveAttribute('data-acredia-widget', 'ready');
        });

        test('opens /verify?token=… in a popup when data-token is set', async ({ page, baseURL }) => {
            const origin = await expectedOrigin(page, baseURL!);
            await openPartnerPage(page, baseURL!, {
                body: `<div id="acredia-verify-widget" data-token="42"></div><script src="${baseURL}${scriptPath}"></script>`,
            });

            await expect(page.getByRole('link', { name: LINK_NAME })).toHaveAttribute('href', `${origin}/verify?token=42`);
            expect(await popupUrlAfterClick(page, `${origin}/verify?token=42`)).toBe(`${origin}/verify?token=42`);
        });

        test('opens the plain /verify page when data-token is absent', async ({ page, baseURL }) => {
            const origin = await expectedOrigin(page, baseURL!);
            await openPartnerPage(page, baseURL!, {
                body: `<div id="acredia-verify-widget"></div><script src="${baseURL}${scriptPath}"></script>`,
            });

            await expect(page.getByRole('link', { name: LINK_NAME })).toHaveAttribute('href', `${origin}/verify`);
            expect(await popupUrlAfterClick(page, `${origin}/verify`)).toBe(`${origin}/verify`);
        });

        test('URL-encodes the token so it cannot change the destination', async ({ page, baseURL }) => {
            const origin = await expectedOrigin(page, baseURL!);
            const token = '7 & next=https://evil.example/?a=b#frag';
            await openPartnerPage(page, baseURL!, {
                body: `<div id="acredia-verify-widget" data-token="${token}"></div><script src="${baseURL}${scriptPath}"></script>`,
            });

            const href = await page.getByRole('link', { name: LINK_NAME }).getAttribute('href');
            const url = new URL(href!);
            expect(url.origin).toBe(origin);
            expect(url.pathname).toBe('/verify');
            expect(url.hash).toBe('');
            expect([...url.searchParams.keys()]).toEqual(['token']);
            expect(url.searchParams.get('token')).toBe(token);

            // The popup lands on that exact URL, not on anything the token describes.
            expect(new URL(await popupUrlAfterClick(page, href!)).origin).toBe(origin);
        });

        test('is a silent no-op without a container', async ({ page, baseURL }) => {
            const noise = collectPageNoise(page);
            // Confirm the script really loaded, so silence means "no-op", not "never ran".
            const scriptResponse = page.waitForResponse(`${baseURL}${scriptPath}`);
            await openPartnerPage(page, baseURL!, {
                body: `<main>No widget on this page.</main><script src="${baseURL}${scriptPath}"></script>`,
            });
            expect((await scriptResponse).status()).toBe(200);
            await page.waitForLoadState('load');

            await expect(page.getByRole('link')).toHaveCount(0);
            expect(noise).toEqual([]);
        });
    });
}

test.describe('integration behaviour', () => {
    test('has the documented size', async ({ page, baseURL }) => {
        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget"></div><script src="${baseURL}/widget/v1.js"></script>`,
        });

        // docs/integrations/verify-widget.md: "about 38px tall and 190px wide".
        const box = await page.getByRole('link', { name: LINK_NAME }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(34);
        expect(box!.height).toBeLessThanOrEqual(42);
        expect(box!.width).toBeGreaterThanOrEqual(160);
        expect(box!.width).toBeLessThanOrEqual(220);
    });

    test('makes no network requests of its own', async ({ page, baseURL }) => {
        const requests: string[] = [];
        page.on('request', (request) => requests.push(request.url()));

        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget" data-token="42"></div><script src="${baseURL}/widget/v1.js"></script>`,
        });
        await expect(page.getByRole('link', { name: LINK_NAME })).toBeVisible();

        expect(requests).toEqual([partnerUrl(baseURL!), `${baseURL}/widget/v1.js`]);
    });

    test('supports single-page apps that mount the container later', async ({ page, baseURL }) => {
        await openPartnerPage(page, baseURL!, { body: '<div id="app"></div>' });

        // What a framework mount effect would do: render, then inject the tag.
        await page.evaluate((src) => {
            document.getElementById('app')!.innerHTML = '<div id="acredia-verify-widget" data-token="9"></div>';
            const script = document.createElement('script');
            script.src = src;
            document.body.appendChild(script);
        }, `${baseURL}/widget/v1.js`);

        await expect(page.getByRole('link', { name: LINK_NAME })).toHaveAttribute('href', /\/verify\?token=9$/);
    });

    test('severs window.opener on the popup', async ({ page, baseURL }) => {
        const origin = await expectedOrigin(page, baseURL!);
        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget" data-token="42"></div><script src="${baseURL}/widget/v1.js"></script>`,
        });

        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            page.getByRole('link', { name: LINK_NAME }).click(),
        ]);
        await popup.waitForURL(`${origin}/verify?token=42`);

        expect(await popup.evaluate(() => window.opener)).toBeNull();
    });

    test('stays styled under a partner CSP of default-src none', async ({ page, baseURL }) => {
        // docs: the only directive a host needs is script-src for the Acredia host.
        await openPartnerPage(page, baseURL!, {
            csp: `default-src 'none'; script-src ${new URL(baseURL!).origin}`,
            body: `<div id="acredia-verify-widget"></div><script src="${baseURL}/widget/v1.js"></script>`,
        });

        const link = page.getByRole('link', { name: LINK_NAME });
        await expect(link).toBeVisible();
        await expect(link).toHaveCSS('background-color', 'rgb(10, 37, 64)');
        await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
    });

    test('takes the partner theme through the documented custom properties', async ({ page, baseURL }) => {
        await openPartnerPage(page, baseURL!, {
            head: '<style>#acredia-verify-widget { --acredia-widget-bg: rgb(200, 0, 0); } a { color: lime !important; }</style>',
            body: `<div id="acredia-verify-widget"></div><script src="${baseURL}/widget/v1.js"></script>`,
        });

        const link = page.getByRole('link', { name: LINK_NAME });
        await expect(link).toHaveCSS('background-color', 'rgb(200, 0, 0)');
        // The partner's own global link styles do not leak into the widget.
        await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
    });

    test('fails closed when it cannot determine the Acredia origin', async ({ page, baseURL }) => {
        // Inlined into the page (as a bundler would) from a build with no
        // configured origin: there is no script URL to derive one from.
        const body = (await (await page.request.get('/widget/v1.js')).text()).replace(
            /"canonicalOrigin":(null|"[^"]*")/,
            '"canonicalOrigin":null',
        );
        const noise = collectPageNoise(page);

        await openPartnerPage(page, baseURL!, {
            body: `<div id="acredia-verify-widget" data-token="42"></div><script>${body}</script>`,
        });

        await expect(page.locator('#acredia-verify-widget')).toHaveAttribute('data-acredia-widget', 'error');
        await expect(page.getByRole('link')).toHaveCount(0);
        expect(noise.join('\n')).toMatch(/\[Acredia verify widget\] Could not determine the Acredia origin/);
    });
});
