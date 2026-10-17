/**
 * The embeddable "Verify with Acredia" widget (ACREDIA-STELLAR#304).
 *
 * Served to third-party sites at `/widget.js` by `src/app/widget.js/route.ts`.
 * It is the least controllable code Acredia ships — it runs on pages we do not
 * own and cannot update once a partner has copied the tag — so it is built to
 * fail closed:
 *
 *  - No origin is hardcoded. The build injects the canonical origin from
 *    `getConfiguredSiteOrigin()` (src/lib/siteUrl.ts), the same source as
 *    every other absolute URL the app produces. Only when the deployment has
 *    no origin configured does the widget fall back to the origin it was
 *    actually loaded from (`document.currentScript`).
 *  - If neither yields a trustworthy origin, it renders nothing and logs an
 *    error. It never guesses a host: a guessed host that is later reassigned
 *    would turn every partner embed into a phishing link.
 *
 * Partner usage (see /docs/api#embeddable-widget):
 *
 *     <script src="https://<acredia-host>/widget.js" async></script>
 *     <div id="acredia-verify-widget" data-token="42"></div>
 */

/** Design-system values the widget defaults to; partners override them via CSS custom properties. */
export const WIDGET_THEME_DEFAULTS = {
    /** `--primary` in src/app/globals.css. */
    background: '#0a2540',
    /** `--primary-foreground` in src/app/globals.css. */
    foreground: '#ffffff',
    /** `--radius-md` in src/app/globals.css (`calc(var(--radius) - 2px)`). */
    radius: 'calc(0.75rem - 2px)',
} as const;

/** The CSS custom properties a partner page can set to theme the button. */
export const WIDGET_THEME_PROPERTIES = [
    '--acredia-widget-bg',
    '--acredia-widget-bg-hover',
    '--acredia-widget-fg',
    '--acredia-widget-radius',
    '--acredia-widget-font',
] as const;

export interface VerifyWidgetConfig {
    /** Canonical Acredia origin injected by the build, or null when none is configured. */
    canonicalOrigin: string | null;
    /** The widget's stylesheet. */
    css: string;
}

/**
 * The widget stylesheet, scoped to the widget's shadow root.
 *
 * `all: initial` on the host stops the partner's own styles from leaking in;
 * custom properties are exempt from `all`, which is what lets the documented
 * `--acredia-widget-*` hooks through.
 */
export function buildVerifyWidgetCss(): string {
    const { background, foreground, radius } = WIDGET_THEME_DEFAULTS;

    return [
        ':host { all: initial; display: inline-block; }',
        '.acredia-verify-button {',
        `  --acredia-widget-bg-resolved: var(--acredia-widget-bg, ${background});`,
        '  box-sizing: border-box;',
        '  display: inline-flex;',
        '  align-items: center;',
        '  gap: 8px;',
        '  padding: 10px 20px;',
        '  border: 0;',
        `  border-radius: var(--acredia-widget-radius, ${radius});`,
        '  background-color: var(--acredia-widget-bg-resolved);',
        `  color: var(--acredia-widget-fg, ${foreground});`,
        '  font: 600 14px/1.25 var(--acredia-widget-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);',
        '  text-decoration: none;',
        '  cursor: pointer;',
        '  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);',
        '  transition: background-color 0.2s;',
        '}',
        '.acredia-verify-button:hover { background-color: var(--acredia-widget-bg-hover, var(--acredia-widget-bg-resolved)); }',
        // Mirrors the app's `hover:bg-primary/90`, where color-mix() exists.
        '@supports (background-color: color-mix(in srgb, red 50%, white)) {',
        '  .acredia-verify-button:hover { background-color: var(--acredia-widget-bg-hover, color-mix(in srgb, var(--acredia-widget-bg-resolved) 85%, #ffffff)); }',
        '}',
        '.acredia-verify-button:focus-visible { outline: 2px solid var(--acredia-widget-bg-resolved); outline-offset: 2px; }',
        '.acredia-verify-button svg { flex: none; }',
        '@media (prefers-reduced-motion: reduce) { .acredia-verify-button { transition: none; } }',
    ].join('\n');
}

/**
 * The widget's browser code.
 *
 * Served by stringifying this function, so it must stay self-contained: it
 * may use only its parameters and browser globals, never anything else from
 * this module. `tests/verifyWidget.test.ts` runs the served string in
 * isolation to hold that line. Stick to syntax every browser with shadow DOM
 * and `URL` already runs natively (no classes, spread, `?.` or async), so no
 * compiler ever needs to inject a helper into it.
 */
export function installVerifyWidget(win: Window, doc: Document, config: VerifyWidgetConfig): void {
    'use strict';

    const CONTAINER_ID = 'acredia-verify-widget';
    const STATE_ATTRIBUTE = 'data-acredia-widget';
    const LOG_PREFIX = '[Acredia verify widget] ';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    /** The origin of `value` if it is a URL we would send a verifier to, else null. */
    function trustedOrigin(value: unknown): string | null {
        if (typeof value !== 'string' || !value) return null;
        let url: URL;
        try {
            url = new URL(value);
        } catch (error) {
            return null;
        }
        if (url.protocol === 'https:') return url.origin;
        // Plain http only for a local development server, never the open web.
        const isLocal =
            url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
        return url.protocol === 'http:' && isLocal ? url.origin : null;
    }

    // Read now, not when the DOM is ready: `currentScript` is only set while
    // this script is first executing, and is null by DOMContentLoaded.
    const currentScript = doc.currentScript as HTMLScriptElement | null;
    const scriptOrigin = currentScript ? trustedOrigin(currentScript.src) : null;
    const origin = trustedOrigin(config.canonicalOrigin) || scriptOrigin;

    function applyStyles(root: ShadowRoot | HTMLElement, isShadow: boolean) {
        // Constructable stylesheets are CSSOM, so a partner CSP that forbids
        // inline <style> does not block them.
        const SheetConstructor = (win as unknown as { CSSStyleSheet?: typeof CSSStyleSheet }).CSSStyleSheet;
        if (
            isShadow &&
            'adoptedStyleSheets' in root &&
            typeof SheetConstructor === 'function' &&
            typeof SheetConstructor.prototype.replaceSync === 'function'
        ) {
            try {
                const sheet = new SheetConstructor();
                sheet.replaceSync(config.css);
                (root as ShadowRoot).adoptedStyleSheets = [sheet];
                return;
            } catch (error) {
                // Fall through to a <style> element.
            }
        }
        const style = doc.createElement('style');
        style.textContent = config.css;
        root.appendChild(style);
    }

    function shieldIcon(): Element {
        const svg = doc.createElementNS(SVG_NS, 'svg');
        const attributes: Array<[string, string]> = [
            ['width', '16'],
            ['height', '16'],
            ['viewBox', '0 0 24 24'],
            ['fill', 'none'],
            ['stroke', 'currentColor'],
            ['stroke-width', '2'],
            ['stroke-linecap', 'round'],
            ['stroke-linejoin', 'round'],
            ['aria-hidden', 'true'],
            ['focusable', 'false'],
        ];
        for (let i = 0; i < attributes.length; i++) {
            svg.setAttribute(attributes[i][0], attributes[i][1]);
        }
        const path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
        svg.appendChild(path);
        return svg;
    }

    /** Opens the centred verification popup; returns false if it was blocked. */
    function openPopup(url: string): boolean {
        const width = 600;
        const height = 750;
        const left = (win.screenX || 0) + Math.max(0, ((win.outerWidth || width) - width) / 2);
        const top = (win.screenY || 0) + Math.max(0, ((win.outerHeight || height) - height) / 2);
        let popup: Window | null;
        try {
            popup = win.open(
                url,
                'AcrediaVerify',
                'width=' + width + ',height=' + height + ',left=' + Math.round(left) +
                    ',top=' + Math.round(top) + ',toolbar=no,menubar=no,scrollbars=yes,resizable=yes',
            );
        } catch (error) {
            return false;
        }
        if (!popup) return false;
        // Sever the back-reference to the partner's page.
        try {
            popup.opener = null;
        } catch (error) {
            // Cross-origin access can throw in some browsers; nothing to do.
        }
        return true;
    }

    function render() {
        const container = doc.getElementById(CONTAINER_ID);
        if (!container) {
            // eslint-disable-next-line no-console -- deliberate: the partner's console is the only place a broken embed can be reported.
            console.warn(
                LOG_PREFIX + 'No element with id="' + CONTAINER_ID + '" was found, so no button was rendered.',
            );
            return;
        }
        // Script included twice: the first copy already rendered.
        if (container.getAttribute(STATE_ATTRIBUTE)) return;

        if (!origin) {
            container.setAttribute(STATE_ATTRIBUTE, 'error');
            // eslint-disable-next-line no-console -- deliberate: failing closed must be visible to the partner (ACREDIA-STELLAR#304).
            console.error(
                LOG_PREFIX +
                    'Could not determine the Acredia origin to send verifiers to, so the verify ' +
                    'button was not rendered. Load this script with a plain <script src="…/widget.js"> ' +
                    'tag pointing at your Acredia deployment, or set NEXT_PUBLIC_SITE_URL on that deployment.',
            );
            return;
        }

        const target = new URL('/verify', origin);
        const token = (container.getAttribute('data-token') || '').trim();
        if (token) target.searchParams.set('token', token);
        const href = target.toString();

        let isShadow = typeof container.attachShadow === 'function';
        let root: ShadowRoot | HTMLElement = container;
        if (isShadow) {
            try {
                root = container.attachShadow({ mode: 'open' });
            } catch (error) {
                isShadow = false;
            }
        }
        applyStyles(root, isShadow);

        // A link, not a button: it navigates, so it keeps link semantics
        // (middle-click, "open in new tab") and still works if the popup is blocked.
        const link = doc.createElement('a');
        link.className = 'acredia-verify-button';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', 'Verify with Acredia (opens in a new window)');
        link.appendChild(shieldIcon());
        link.appendChild(doc.createTextNode('Verify with Acredia'));
        link.addEventListener('click', function (event: MouseEvent) {
            // Modified clicks keep the browser's own behaviour (new tab, etc.).
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }
            // Popup blocked: let the link open a new tab instead.
            if (openPopup(href)) event.preventDefault();
        });

        root.appendChild(link);
        container.setAttribute(STATE_ATTRIBUTE, 'ready');
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
}

/**
 * The complete `/widget.js` source, with the canonical origin baked in.
 *
 * `canonicalOrigin` is null when the deployment has none configured; the
 * script then relies on the origin it is served from.
 */
export function buildVerifyWidgetScript(canonicalOrigin: string | null): string {
    const config: VerifyWidgetConfig = { canonicalOrigin, css: buildVerifyWidgetCss() };
    // U+2028/U+2029 are valid in JSON but were line terminators in pre-ES2019 JS.
    const serializedConfig = JSON.stringify(config)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    return [
        '/*! Acredia verify widget — https://github.com/soumen0818/ACREDIA-STELLAR */',
        `;(${installVerifyWidget.toString()})(window, document, ${serializedConfig});`,
        '',
    ].join('\n');
}
