import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonFromIpfs, validatePinataFile, validatePinataJson } from '../src/lib/ipfsServer';

describe('IPFS server validation', () => {
    it('accepts supported file types within the size limit', () => {
        const file = new File([new Uint8Array(1024)], 'credential.pdf', {
            type: 'application/pdf',
        });

        expect(validatePinataFile(file)).toBeNull();
    });

    it('rejects unsupported file types and oversize files', () => {
        const badType = new File([new Uint8Array(1024)], 'credential.txt', {
            type: 'text/plain',
        });
        const largeFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'credential.png', {
            type: 'image/png',
        });

        expect(validatePinataFile(badType)).toContain('Invalid file type');
        expect(validatePinataFile(largeFile)).toContain('less than 10MB');
    });

    it('accepts reasonable JSON payloads and rejects empty or huge payloads', () => {
        expect(validatePinataJson({ credential: 'ok' })).toBeNull();
        expect(validatePinataJson(null)).toContain('cannot be empty');
        expect(validatePinataJson('')).toContain('must be an object');
        expect(validatePinataJson([])).toContain('must be an object');

        const hugePayload = { data: 'x'.repeat(1024 * 1024) };
        expect(validatePinataJson(hugePayload)).toContain('less than 1MB');
    });
});

describe('fetchJsonFromIpfs', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('resolves the parsed JSON content when the gateway responds 200', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ hello: 'world' }),
        }) as unknown as typeof fetch;

        const result = await fetchJsonFromIpfs('ipfs://some-cid');

        expect(result).toEqual({ ok: true, content: { hello: 'world' } });
    });

    it('accepts a bare CID as well as an ipfs:// URI', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
        });
        globalThis.fetch = mockFetch as unknown as typeof fetch;

        await fetchJsonFromIpfs('some-cid/metadata.json');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/ipfs\/some-cid\/metadata\.json$/),
            expect.anything(),
        );
    });

    it('reports not_found for a 404 response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

        await expect(fetchJsonFromIpfs('ipfs://missing-cid')).resolves.toEqual({
            ok: false,
            reason: 'not_found',
        });
    });

    it('reports gateway_error for other non-2xx responses', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;

        await expect(fetchJsonFromIpfs('ipfs://some-cid')).resolves.toEqual({
            ok: false,
            reason: 'gateway_error',
        });
    });

    it('reports invalid_json when the response body is not parseable JSON', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError('Unexpected token');
            },
        }) as unknown as typeof fetch;

        await expect(fetchJsonFromIpfs('ipfs://some-cid')).resolves.toEqual({
            ok: false,
            reason: 'invalid_json',
        });
    });

    it('reports network_error when fetch itself throws', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

        await expect(fetchJsonFromIpfs('ipfs://some-cid')).resolves.toEqual({
            ok: false,
            reason: 'network_error',
        });
    });

    it('reports timeout when the request is aborted', async () => {
        vi.useFakeTimers();
        try {
            globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
                return new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        const abortError = new Error('The operation was aborted');
                        abortError.name = 'AbortError';
                        reject(abortError);
                    });
                });
            }) as unknown as typeof fetch;

            const resultPromise = fetchJsonFromIpfs('ipfs://slow-cid');
            await vi.advanceTimersByTimeAsync(8_000);

            await expect(resultPromise).resolves.toEqual({ ok: false, reason: 'timeout' });
        } finally {
            vi.useRealTimers();
        }
    });
});
