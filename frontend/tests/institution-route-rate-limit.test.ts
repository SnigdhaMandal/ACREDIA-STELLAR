/// <reference types="vitest/globals" />
import { GET as credentialsGET } from '@/app/api/institution/credentials/route';
import { GET as analyticsGET } from '@/app/api/institution/analytics/route';
import { GET as exportGET } from '@/app/api/institution/export/route';
import { resetRateLimitStore } from '@/lib/rateLimit';

// ─── serverAuth mock ──────────────────────────────────────────────────────────
// All three routes call requireAuthenticatedRequest; we return a valid session
// with a stable userId so per-user quota tests work predictably.

vi.mock('@/lib/serverAuth', () => ({
    requireAuthenticatedRequest: vi.fn().mockResolvedValue({
        ok: true,
        userId: 'user-inst-test',
        user: { id: 'user-inst-test' },
        accessToken: 'tok',
    }),
    hasServiceRoleEnv: () => true,
    getServiceRoleClient: () => supabaseStub(),
}));

// ─── Supabase stub ────────────────────────────────────────────────────────────
// Returns the minimal fluent chain each route needs without hitting the network.

function supabaseStub() {
    const credentialsRow = {
        id: 'cred-1',
        token_id: 'tok-1',
        issued_at: new Date().toISOString(),
        revoked: false,
        metadata: { credentialData: { credentialType: 'Degree', studentName: 'Alice' } },
    };

    const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { id: 'inst-1' }, error: null }),
        order: () => chain,
        range: () => chain,
        gte: () => chain,
        lte: () => chain,
        or: () => chain,
        in: () => chain,
        // Called by credentials route (count variant)
        then: undefined as unknown,
    };

    // Credentials route uses { count: 'exact' } select and awaits the query directly.
    const countChain = {
        ...chain,
        // Vitest awaits the object via its promise interface if we add then().
        // Instead we make the chain itself thenable so `await query` works.
        // The route destructures { data, error, count } from the resolved value.
        [Symbol.asyncIterator]: undefined,
    };

    return {
        from: (table: string) => {
            if (table === 'institutions') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { id: 'inst-1' }, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'credentials') {
                // Return a promise-like so `await query` resolves with { data, error, count }
                const credQuery = {
                    select: () => credQuery,
                    eq: () => credQuery,
                    order: () => credQuery,
                    range: () => credQuery,
                    gte: () => credQuery,
                    lte: () => credQuery,
                    or: () => credQuery,
                    then(resolve: (v: unknown) => void) {
                        resolve({ data: [credentialsRow], error: null, count: 1 });
                    },
                };
                return credQuery;
            }
            if (table === 'verification_logs') {
                return {
                    select: () => ({
                        in: async () => ({ data: [], error: null }),
                    }),
                };
            }
            return chain;
        },
    };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRequest(path: string, ip = '203.0.113.20'): Request {
    return new Request(`http://localhost${path}`, {
        headers: { 'x-forwarded-for': ip },
    });
}

type RouteHandler = (req: Request) => Promise<Response>;

async function assertRateLimitEnforced(
    handler: RouteHandler,
    requestFactory: () => Request,
    allowedCount: number,
) {
    for (let i = 0; i < allowedCount; i++) {
        const res = await handler(requestFactory());
        expect(res.status, `request ${i + 1} should succeed`).not.toBe(429);
    }

    const blocked = await handler(requestFactory());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    await expect(blocked.json()).resolves.toEqual({
        success: false,
        error: 'Too many requests',
    });
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

const ENV_OVERRIDES: Record<string, string> = {
    // Reduce limits to small numbers so tests run in milliseconds.
    RATE_LIMIT_INSTITUTION_CREDENTIALS_IP_MAX_REQUESTS: '3',
    RATE_LIMIT_INSTITUTION_CREDENTIALS_USER_MAX_REQUESTS: '3',
    RATE_LIMIT_INSTITUTION_ANALYTICS_IP_MAX_REQUESTS: '3',
    RATE_LIMIT_INSTITUTION_ANALYTICS_USER_MAX_REQUESTS: '3',
    RATE_LIMIT_INSTITUTION_EXPORT_IP_MAX_REQUESTS: '3',
    RATE_LIMIT_INSTITUTION_EXPORT_USER_MAX_REQUESTS: '3',
};

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    for (const k of Object.keys(ENV_OVERRIDES)) savedEnv[k] = process.env[k];
    Object.assign(process.env, ENV_OVERRIDES);
    resetRateLimitStore();
});

afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
        if (typeof v === 'undefined') delete process.env[k];
        else process.env[k] = v;
    }
});

// ─── institution/credentials ──────────────────────────────────────────────────

describe('GET /api/institution/credentials rate limiting', () => {
    it('returns 429 with Retry-After after the IP limit is exceeded', async () => {
        // IP limit is 3; all three succeed, fourth is blocked.
        await assertRateLimitEnforced(
            (req) => credentialsGET(req as Parameters<typeof credentialsGET>[0]),
            () => makeRequest('/api/institution/credentials', '10.10.10.1'),
            3,
        );
    });

    it('returns 429 with Retry-After after the per-user limit is exceeded', async () => {
        // Use a unique IP per request so IP limit is never the trigger;
        // the user quota (keyed by userId from the mock) must be the one that fires.
        let ipCounter = 1;
        await assertRateLimitEnforced(
            (req) => credentialsGET(req as Parameters<typeof credentialsGET>[0]),
            () => makeRequest('/api/institution/credentials', `10.20.30.${ipCounter++}`),
            3,
        );
    });

    it('IP limit is scoped per-address and does not bleed into other IPs', async () => {
        // Make 2 requests from IP A (within the 3-request IP limit).
        for (let i = 0; i < 2; i++) {
            const res = await credentialsGET(
                makeRequest('/api/institution/credentials', '10.10.10.2') as Parameters<typeof credentialsGET>[0],
            );
            expect(res.status, `IP-A request ${i + 1} should succeed`).not.toBe(429);
        }
        // Make 1 request from IP B — it has its own fresh IP bucket, so it must succeed
        // (user bucket for the shared test userId is at 2/3 from IP-A above).
        const resB = await credentialsGET(
            makeRequest('/api/institution/credentials', '10.10.10.4') as Parameters<typeof credentialsGET>[0],
        );
        expect(resB.status).not.toBe(429);
    });
});

// ─── institution/analytics ────────────────────────────────────────────────────

describe('GET /api/institution/analytics rate limiting', () => {
    it('returns 429 with Retry-After after the IP limit is exceeded', async () => {
        await assertRateLimitEnforced(
            (req) => analyticsGET(req as Parameters<typeof analyticsGET>[0]),
            () => makeRequest('/api/institution/analytics', '10.10.20.1'),
            3,
        );
    });

    it('returns 429 with Retry-After after the per-user limit is exceeded', async () => {
        let ipCounter = 100;
        await assertRateLimitEnforced(
            (req) => analyticsGET(req as Parameters<typeof analyticsGET>[0]),
            () => makeRequest('/api/institution/analytics', `10.20.40.${ipCounter++}`),
            3,
        );
    });

    it('response body is standard rate limit error shape', async () => {
        for (let i = 0; i < 3; i++) {
            await analyticsGET(
                makeRequest('/api/institution/analytics', '10.10.20.5') as Parameters<typeof analyticsGET>[0],
            );
        }
        const blocked = await analyticsGET(
            makeRequest('/api/institution/analytics', '10.10.20.5') as Parameters<typeof analyticsGET>[0],
        );
        expect(blocked.status).toBe(429);
        await expect(blocked.json()).resolves.toMatchObject({
            success: false,
            error: 'Too many requests',
        });
    });
});

// ─── institution/export ───────────────────────────────────────────────────────

describe('GET /api/institution/export rate limiting', () => {
    it('returns 429 with Retry-After after the IP limit is exceeded', async () => {
        await assertRateLimitEnforced(
            (req) => exportGET(req as Parameters<typeof exportGET>[0]),
            () => makeRequest('/api/institution/export', '10.10.30.1'),
            3,
        );
    });

    it('returns 429 with Retry-After after the per-user limit is exceeded', async () => {
        let ipCounter = 200;
        await assertRateLimitEnforced(
            (req) => exportGET(req as Parameters<typeof exportGET>[0]),
            () => makeRequest('/api/institution/export', `10.20.50.${ipCounter++}`),
            3,
        );
    });

    it('Retry-After header is a positive integer string', async () => {
        for (let i = 0; i < 3; i++) {
            await exportGET(
                makeRequest('/api/institution/export', '10.10.30.9') as Parameters<typeof exportGET>[0],
            );
        }
        const blocked = await exportGET(
            makeRequest('/api/institution/export', '10.10.30.9') as Parameters<typeof exportGET>[0],
        );
        const retryAfter = blocked.headers.get('Retry-After');
        expect(retryAfter).not.toBeNull();
        const parsed = parseInt(retryAfter!, 10);
        expect(Number.isInteger(parsed)).toBe(true);
        expect(parsed).toBeGreaterThanOrEqual(1);
    });
});
