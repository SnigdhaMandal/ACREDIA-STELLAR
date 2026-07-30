import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/runtimeConfig', () => ({
    runtimeConfig: {
        isProduction: false,
        supabase: { url: '', anonKey: '' },
        stellar: {},
        contracts: {},
        ipfs: { gatewayUrl: 'https://gateway.pinata.cloud' },
        debug: { enableLogs: false },
    },
    serverRuntimeConfig: {
        admin: { emailAllowlist: [] },
        auth: { serviceRoleKey: '' },
        ipfs: { jwt: 'test-pinata-jwt' },
        pinning: {
            secondaryEndpoint: 'https://secondary.example/api/v1',
            secondaryToken: 'test-secondary-token',
            secondaryProviderName: 'test-secondary',
        },
        verification: { hashSecret: 'test-secret' },
        debug: { enableLogs: false },
    },
}));

const {
    checkPinataPinStatus,
    getSecondaryPinStatus,
    isSecondaryPinningConfigured,
    pinCidToSecondaryProvider,
} = await import('../src/lib/ipfsServer');

describe('checkPinataPinStatus', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('reports pinned when the CID appears in the pin list', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ rows: [{ ipfs_pin_hash: 'cid-123' }] }),
        }) as unknown as typeof fetch;

        await expect(checkPinataPinStatus('cid-123')).resolves.toBe('pinned');
    });

    it('reports missing when the pin list is empty', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ rows: [] }),
        }) as unknown as typeof fetch;

        await expect(checkPinataPinStatus('cid-123')).resolves.toBe('missing');
    });

    it('throws with details when Pinata responds with an error', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'internal error',
        }) as unknown as typeof fetch;

        await expect(checkPinataPinStatus('cid-123')).rejects.toThrow(/500/);
    });

    it('sends the Pinata bearer token and filters by the given CID', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
        globalThis.fetch = mockFetch as unknown as typeof fetch;

        await checkPinataPinStatus('cid-abc');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('hashContains=cid-abc'),
            expect.objectContaining({ headers: { Authorization: 'Bearer test-pinata-jwt' } }),
        );
    });
});

describe('secondary pinning provider (IPFS Pinning Services API)', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('reports configured when both endpoint and token are set', () => {
        expect(isSecondaryPinningConfigured()).toBe(true);
    });

    it('submits a pin-by-CID request and parses the response', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ requestid: 'req-1', status: 'queued' }),
        });
        globalThis.fetch = mockFetch as unknown as typeof fetch;

        await expect(pinCidToSecondaryProvider('cid-123', 'credential-1')).resolves.toEqual({
            requestId: 'req-1',
            status: 'queued',
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://secondary.example/api/v1/pins',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer test-secondary-token' }),
                body: JSON.stringify({ cid: 'cid-123', name: 'credential-1' }),
            }),
        );
    });

    it('throws when the secondary provider rejects the pin request', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => 'bad request',
        }) as unknown as typeof fetch;

        await expect(pinCidToSecondaryProvider('cid-123', 'credential-1')).rejects.toThrow(/400/);
    });

    it('falls back to failed for an unrecognized status value rather than guessing', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ requestid: 'req-1', status: 'something-unexpected' }),
        }) as unknown as typeof fetch;

        await expect(pinCidToSecondaryProvider('cid-123', 'credential-1')).resolves.toEqual({
            requestId: 'req-1',
            status: 'failed',
        });
    });

    it('polls pin status by request id', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ requestid: 'req-1', status: 'pinned' }),
        });
        globalThis.fetch = mockFetch as unknown as typeof fetch;

        await expect(getSecondaryPinStatus('req-1')).resolves.toEqual({ requestId: 'req-1', status: 'pinned' });
        expect(mockFetch).toHaveBeenCalledWith(
            'https://secondary.example/api/v1/pins/req-1',
            expect.objectContaining({ headers: { Authorization: 'Bearer test-secondary-token' } }),
        );
    });

    it('reports failed for a request id the provider no longer recognizes', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

        await expect(getSecondaryPinStatus('req-missing')).resolves.toEqual({
            requestId: 'req-missing',
            status: 'failed',
        });
    });
});
