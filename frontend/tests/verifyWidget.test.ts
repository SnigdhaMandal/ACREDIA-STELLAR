import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildVerifyWidgetScript,
    WIDGET_THEME_DEFAULTS,
    WIDGET_THEME_PROPERTIES,
} from '../src/lib/widget/verifyWidget';
import { getConfiguredSiteOrigin, PLACEHOLDER_SITE_URL } from '../src/lib/siteUrl';

/**
 * The embeddable verify widget (ACREDIA-STELLAR#304).
 *
 * Every behavioural test below runs the *served* `/widget.js` string, not the
 * imported function, so they also prove the stringified code is
 * self-contained — a stray reference to anything outside it would only fail
 * on partner sites.
 */

// ── A DOM just large enough for the widget ────────────────────────────────────

type Listener = (event: unknown) => void;

class FakeNode {
    children: FakeNode[] = [];
    textContent = '';

    appendChild<T extends FakeNode>(child: T): T {
        this.children.push(child);
        return child;
    }
}

class FakeElement extends FakeNode {
    attributes = new Map<string, string>();
    listeners = new Map<string, Listener[]>();
    shadowRoot: FakeShadowRoot | null = null;
    className = '';
    href = '';
    target = '';
    rel = '';

    constructor(
        readonly tagName: string,
        readonly namespace: string | null = null,
    ) {
        super();
    }

    setAttribute(name: string, value: string) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    attachShadow(): FakeShadowRoot {
        if (this.shadowRoot) throw new Error('Shadow root cannot be created on a host which already hosts a shadow tree.');
        this.shadowRoot = new FakeShadowRoot();
        return this.shadowRoot;
    }
}

class FakeShadowRoot extends FakeNode {
    adoptedStyleSheets: FakeStyleSheet[] = [];
}

class FakeStyleSheet {
    cssText = '';
    replaceSync(text: string) {
        this.cssText = text;
    }
}

interface FakeDomOptions {
    scriptSrc?: string | null;
    readyState?: DocumentReadyState;
    container?: boolean;
    token?: string;
    shadowDom?: boolean;
    constructableSheets?: boolean;
    popup?: 'opens' | 'blocked';
}

function createDom({
    scriptSrc = null,
    readyState = 'complete',
    container = true,
    token,
    shadowDom = true,
    constructableSheets = true,
    popup = 'opens',
}: FakeDomOptions = {}) {
    const host = new FakeElement('div');
    if (token !== undefined) host.setAttribute('data-token', token);
    if (!shadowDom) (host as { attachShadow?: unknown }).attachShadow = undefined;

    const docListeners = new Map<string, Listener[]>();
    const openedPopup = { opener: {} as unknown };
    const open = vi.fn(() => (popup === 'opens' ? openedPopup : null));

    const doc = {
        readyState,
        currentScript: scriptSrc === null ? null : { src: scriptSrc },
        getElementById: (id: string) => (container && id === 'acredia-verify-widget' ? host : null),
        createElement: (tag: string) => new FakeElement(tag),
        createElementNS: (ns: string, tag: string) => new FakeElement(tag, ns),
        createTextNode: (text: string) => Object.assign(new FakeNode(), { textContent: text }),
        addEventListener: (type: string, listener: Listener) =>
            docListeners.set(type, [...(docListeners.get(type) ?? []), listener]),
    };

    const win = {
        open,
        screenX: 100,
        screenY: 50,
        outerWidth: 1400,
        outerHeight: 900,
        CSSStyleSheet: constructableSheets ? FakeStyleSheet : undefined,
    };

    return {
        host,
        doc,
        win,
        open,
        openedPopup,
        fireDomContentLoaded() {
            for (const listener of docListeners.get('DOMContentLoaded') ?? []) listener({});
        },
        /** The rendered link, wherever it was rendered. */
        link(): FakeElement | undefined {
            const root: FakeNode = host.shadowRoot ?? host;
            return root.children.find(
                (child): child is FakeElement => child instanceof FakeElement && child.tagName === 'a',
            );
        },
    };
}

type Dom = ReturnType<typeof createDom>;

/** Executes the served script against a fake DOM, exactly as a partner page would. */
function runWidget(canonicalOrigin: string | null, dom: Dom) {
    const script = buildVerifyWidgetScript(canonicalOrigin);
    new Function('window', 'document', script)(dom.win, dom.doc);
    return dom;
}

function click(link: FakeElement, init: Partial<MouseEvent> = {}) {
    const event = {
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...init,
        defaultPrevented: false,
        preventDefault() {
            event.defaultPrevented = true;
        },
    };
    for (const listener of link.listeners.get('click') ?? []) listener(event);
    return event;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('served widget source', () => {
    it('contains no hardcoded origin when the deployment has none configured', () => {
        const script = buildVerifyWidgetScript(null);
        const urls = script.match(/https?:\/\/[^\s'"`)]+/g) ?? [];

        // Only the SVG namespace and the attribution comment — no host to send verifiers to.
        expect(urls).toEqual([
            'https://github.com/soumen0818/ACREDIA-STELLAR',
            'http://www.w3.org/2000/svg',
        ]);
        expect(script).not.toMatch(/vercel\.app/);
    });

    it('carries the injected canonical origin as data', () => {
        expect(buildVerifyWidgetScript('https://acredia.io')).toContain('"canonicalOrigin":"https://acredia.io"');
    });

    it('parses as a standalone classic script', () => {
        expect(() => new Function(buildVerifyWidgetScript('https://acredia.io'))).not.toThrow();
    });
});

describe('origin resolution', () => {
    it('links to the canonical origin even when served through another host', () => {
        // A partner proxying or self-hosting the file must not redirect verifiers to themselves.
        const dom = runWidget(
            'https://acredia.io',
            createDom({ scriptSrc: 'https://cdn.partner.example/vendor/widget.js', token: '42' }),
        );

        expect(dom.link()?.href).toBe('https://acredia.io/verify?token=42');
        expect(dom.host.getAttribute('data-acredia-widget')).toBe('ready');
    });

    it('falls back to the origin the script was loaded from when none is configured', () => {
        const dom = runWidget(null, createDom({ scriptSrc: 'https://acredia-preview.vercel.app/widget.js' }));

        expect(dom.link()?.href).toBe('https://acredia-preview.vercel.app/verify');
    });

    it('fails closed — no link, a console error — when no origin can be determined', () => {
        // e.g. bundled into the partner's own JS, or injected without a src.
        const dom = runWidget(null, createDom({ scriptSrc: null }));

        expect(dom.link()).toBeUndefined();
        expect(dom.host.shadowRoot).toBeNull();
        expect(dom.host.getAttribute('data-acredia-widget')).toBe('error');
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/could not determine the acredia origin/i));
    });

    it.each([
        ['plain http on the open web', 'http://acredia.io/widget.js'],
        ['a data: URL', 'data:text/javascript,void 0'],
        ['a blob: URL', 'blob:https://partner.example/0b6e'],
        ['a malformed src', 'not a url'],
    ])('refuses %s as a fallback origin', (_label, scriptSrc) => {
        const dom = runWidget(null, createDom({ scriptSrc }));

        expect(dom.link()).toBeUndefined();
        expect(dom.host.getAttribute('data-acredia-widget')).toBe('error');
    });

    it('refuses an unsafe injected origin rather than trusting it blindly', () => {
        const dom = runWidget('javascript:alert(1)', createDom({ scriptSrc: null }));

        expect(dom.link()).toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
    });

    it('accepts http only for a local development server', () => {
        const dom = runWidget(null, createDom({ scriptSrc: 'http://localhost:3000/widget.js' }));

        expect(dom.link()?.href).toBe('http://localhost:3000/verify');
    });

    it('reads currentScript at load time, before the DOM is ready', () => {
        const dom = createDom({ scriptSrc: 'https://acredia.io/widget.js', readyState: 'loading' });
        runWidget(null, dom);
        expect(dom.link()).toBeUndefined();

        // Browsers clear currentScript once the script has finished executing.
        dom.doc.currentScript = null;
        dom.fireDomContentLoaded();

        expect(dom.link()?.href).toBe('https://acredia.io/verify');
    });
});

describe('verification link', () => {
    it('targets the /verify page with the token as a query parameter', () => {
        // /verify/<token> is not a route; the verify page reads ?token=.
        const dom = runWidget('https://acredia.io', createDom({ token: '  7  ' }));

        expect(dom.link()?.href).toBe('https://acredia.io/verify?token=7');
    });

    it('encodes the token so it cannot alter the URL', () => {
        const dom = runWidget('https://acredia.io', createDom({ token: '1&next=https://evil.example/#x' }));
        const href = new URL(dom.link()!.href);

        expect(href.origin).toBe('https://acredia.io');
        expect(href.pathname).toBe('/verify');
        expect([...href.searchParams.keys()]).toEqual(['token']);
        expect(href.searchParams.get('token')).toBe('1&next=https://evil.example/#x');
    });

    it('omits the token parameter when none is given', () => {
        expect(runWidget('https://acredia.io', createDom()).link()?.href).toBe('https://acredia.io/verify');
    });

    it('is an accessible link that opens safely in a new window', () => {
        const link = runWidget('https://acredia.io', createDom()).link()!;

        expect(link.className).toBe('acredia-verify-button');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(link.getAttribute('aria-label')).toBe('Verify with Acredia (opens in a new window)');
        expect(link.children.map((child) => child.textContent)).toContain('Verify with Acredia');
        const icon = link.children[0] as FakeElement;
        expect(icon.namespace).toBe('http://www.w3.org/2000/svg');
        expect(icon.getAttribute('aria-hidden')).toBe('true');
    });
});

describe('click behaviour', () => {
    it('opens a centred popup and severs its opener', () => {
        const dom = runWidget('https://acredia.io', createDom({ token: '42' }));
        const event = click(dom.link()!);

        expect(dom.open).toHaveBeenCalledWith(
            'https://acredia.io/verify?token=42',
            'AcrediaVerify',
            expect.stringContaining('width=600,height=750,left=500,top=125'),
        );
        expect(event.defaultPrevented).toBe(true);
        expect(dom.openedPopup.opener).toBeNull();
    });

    it('lets the link open a tab when the popup is blocked', () => {
        const dom = runWidget('https://acredia.io', createDom({ popup: 'blocked' }));
        const event = click(dom.link()!);

        expect(dom.open).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }])(
        'leaves modified clicks to the browser (%o)',
        (init) => {
            const dom = runWidget('https://acredia.io', createDom());
            const event = click(dom.link()!, init);

            expect(dom.open).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        },
    );
});

describe('rendering', () => {
    it('renders once even if the script is included twice', () => {
        const dom = createDom();
        runWidget('https://acredia.io', dom);
        runWidget('https://acredia.io', dom);

        expect(dom.host.shadowRoot?.children.filter((child) => child instanceof FakeElement)).toHaveLength(1);
    });

    it('warns, without throwing, when the container is missing', () => {
        expect(() => runWidget('https://acredia.io', createDom({ container: false }))).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id="acredia-verify-widget"'));
    });

    it('styles through a constructable stylesheet in a shadow root', () => {
        const dom = runWidget('https://acredia.io', createDom());

        const [sheet] = dom.host.shadowRoot!.adoptedStyleSheets;
        expect(sheet.cssText).toContain('.acredia-verify-button');
        // No inline style assignments, and no <style> element needed.
        expect(dom.host.shadowRoot!.children.some((child) => (child as FakeElement).tagName === 'style')).toBe(false);
    });

    it('falls back to a <style> element where constructable sheets are unsupported', () => {
        const dom = runWidget('https://acredia.io', createDom({ constructableSheets: false }));
        const style = dom.host.shadowRoot!.children.find((child) => (child as FakeElement).tagName === 'style');

        expect(style?.textContent).toContain('.acredia-verify-button');
        expect(dom.link()).toBeDefined();
    });

    it('still renders in browsers without shadow DOM', () => {
        const dom = runWidget('https://acredia.io', createDom({ shadowDom: false }));

        expect(dom.host.shadowRoot).toBeNull();
        expect(dom.link()?.href).toBe('https://acredia.io/verify');
    });
});

describe('theming', () => {
    function renderedCss(): string {
        const dom = runWidget('https://acredia.io', createDom());
        return dom.host.shadowRoot!.adoptedStyleSheets[0].cssText;
    }

    it('exposes every documented theming hook', () => {
        const css = renderedCss();
        for (const property of WIDGET_THEME_PROPERTIES) {
            expect(css).toContain(`var(${property}`);
        }
    });

    it('defaults to the design-system tokens in globals.css', () => {
        // The widget cannot read the app's stylesheet on a partner site, so the
        // defaults are copies; this keeps them from drifting.
        const globals = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');
        const rootBlock = globals.slice(globals.indexOf(':root {'));
        const token = (name: string) => rootBlock.match(new RegExp(`\\s${name}:\\s*([^;]+);`))?.[1].trim();

        expect(WIDGET_THEME_DEFAULTS.background).toBe(token('--primary'));
        expect(WIDGET_THEME_DEFAULTS.foreground).toBe(token('--primary-foreground'));
        expect(WIDGET_THEME_DEFAULTS.radius).toBe(`calc(${token('--radius')} - 2px)`);
        expect(renderedCss()).toContain(WIDGET_THEME_DEFAULTS.background);
    });
});

describe('getConfiguredSiteOrigin', () => {
    it('returns the origin of NEXT_PUBLIC_SITE_URL', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://acredia.io/some/path/');
        expect(getConfiguredSiteOrigin()).toBe('https://acredia.io');
    });

    it('accepts a bare host, as getSiteUrl does', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'acredia.io');
        expect(getConfiguredSiteOrigin()).toBe('https://acredia.io');
    });

    it('falls back to VERCEL_URL', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
        vi.stubEnv('VERCEL_URL', 'acredia-git-main.vercel.app');
        expect(getConfiguredSiteOrigin()).toBe('https://acredia-git-main.vercel.app');
    });

    it('returns null instead of the reserved placeholder', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
        vi.stubEnv('VERCEL_URL', '');
        expect(getConfiguredSiteOrigin()).toBeNull();
        expect(PLACEHOLDER_SITE_URL).toBe('https://acredia.example');
    });
});

describe('GET /widget.js', () => {
    async function fetchWidget() {
        vi.resetModules();
        const { GET, dynamic } = await import('../src/app/widget.js/route');
        return { response: GET(), dynamic };
    }

    it('serves JavaScript with the configured origin baked in', async () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://acredia.io');
        const { response, dynamic } = await fetchWidget();
        const body = await response.text();

        expect(dynamic).toBe('force-static');
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
        expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
        expect(response.headers.get('cache-control')).toContain('max-age=3600');
        expect(body).toContain('"canonicalOrigin":"https://acredia.io"');
    });

    it('serves a script that relies on its own origin when none is configured', async () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
        vi.stubEnv('VERCEL_URL', '');
        const body = await (await fetchWidget()).response.text();

        expect(body).toContain('"canonicalOrigin":null');
        expect(body).not.toContain('acredia.example');
    });
});
