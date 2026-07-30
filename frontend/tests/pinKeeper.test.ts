/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import {
    isRedactedMetadata,
    processPinCandidate,
    runPinKeeperSweep,
    runPinKeeperSweepPure,
    type PinCandidate,
    type PinKeeperDeps,
} from '../src/lib/pinKeeper';

const FIXED_NOW = new Date('2026-06-01T00:00:00.000Z');

function makeDeps(overrides: Partial<PinKeeperDeps> = {}): PinKeeperDeps {
    return {
        checkPinataPinStatus: vi.fn().mockResolvedValue('pinned'),
        pinJsonToPinata: vi.fn().mockResolvedValue('cid-1'),
        isSecondaryPinningConfigured: vi.fn().mockReturnValue(true),
        pinCidToSecondaryProvider: vi.fn().mockResolvedValue({ requestId: 'req-1', status: 'pinned' }),
        getSecondaryPinStatus: vi.fn().mockResolvedValue({ requestId: 'req-1', status: 'pinned' }),
        now: () => FIXED_NOW,
        ...overrides,
    };
}

function pinataCandidate(overrides: Partial<PinCandidate> = {}): PinCandidate {
    return {
        id: 'pin-1',
        credentialId: 'cred-1',
        cid: 'cid-1',
        provider: 'pinata',
        status: 'pending',
        providerRequestId: null,
        metadata: { credentialData: { studentName: 'Alice' } },
        ...overrides,
    };
}

function secondaryCandidate(overrides: Partial<PinCandidate> = {}): PinCandidate {
    return {
        id: 'pin-2',
        credentialId: 'cred-1',
        cid: 'cid-1',
        provider: 'secondary',
        status: 'pending',
        providerRequestId: null,
        metadata: { credentialData: { studentName: 'Alice' } },
        ...overrides,
    };
}

describe('isRedactedMetadata', () => {
    it('recognizes the GDPR erasure sentinel written by process_erasure()', () => {
        expect(isRedactedMetadata({ redacted: true })).toBe(true);
    });

    it('does not flag ordinary metadata', () => {
        expect(isRedactedMetadata({ credentialData: { studentName: 'Alice' } })).toBe(false);
        expect(isRedactedMetadata(null)).toBe(false);
        expect(isRedactedMetadata(undefined)).toBe(false);
        expect(isRedactedMetadata([])).toBe(false);
        expect(isRedactedMetadata({ redacted: false })).toBe(false);
    });
});

describe('processPinCandidate — GDPR erasure', () => {
    it('marks any provider as erased and never attempts repair, regardless of provider', async () => {
        const deps = makeDeps();
        const candidate = pinataCandidate({ status: 'failed', metadata: { redacted: true } });

        const update = await processPinCandidate(candidate, deps, false);

        expect(update.status).toBe('erased');
        expect(deps.checkPinataPinStatus).not.toHaveBeenCalled();
        expect(deps.pinJsonToPinata).not.toHaveBeenCalled();
    });
});

describe('processPinCandidate — pinata', () => {
    it('stays pinned without repairing when already healthy', async () => {
        const deps = makeDeps({ checkPinataPinStatus: vi.fn().mockResolvedValue('pinned') });
        const update = await processPinCandidate(pinataCandidate({ status: 'pinned' }), deps, false);

        expect(update.status).toBe('pinned');
        expect(deps.pinJsonToPinata).not.toHaveBeenCalled();
    });

    it('repairs by re-pinning the DB-stored metadata when missing, and succeeds when the CID matches', async () => {
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockResolvedValue('missing'),
            pinJsonToPinata: vi.fn().mockResolvedValue('cid-1'),
        });
        const candidate = pinataCandidate({ status: 'failed' });

        const update = await processPinCandidate(candidate, deps, false);

        expect(deps.pinJsonToPinata).toHaveBeenCalledWith(candidate.metadata);
        expect(update.status).toBe('pinned');
        expect(update.lastCheckedAt).toBe(FIXED_NOW.toISOString());
    });

    it('flags a serious anomaly instead of silently accepting a mismatched CID after repair', async () => {
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockResolvedValue('missing'),
            pinJsonToPinata: vi.fn().mockResolvedValue('cid-DIFFERENT'),
        });

        const update = await processPinCandidate(pinataCandidate({ status: 'failed' }), deps, false);

        expect(update.status).toBe('failed');
        expect(update.lastError).toMatch(/different CID|cid-DIFFERENT/i);
    });

    it('reports failed with the error message when the status check throws', async () => {
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockRejectedValue(new Error('Pinata API down')),
        });

        const update = await processPinCandidate(pinataCandidate(), deps, false);

        expect(update.status).toBe('failed');
        expect(update.lastError).toBe('Pinata API down');
    });
});

describe('processPinCandidate — secondary provider', () => {
    it('reports not_configured when no secondary provider is set up (not a failure)', async () => {
        const deps = makeDeps({ isSecondaryPinningConfigured: vi.fn().mockReturnValue(false) });

        const update = await processPinCandidate(secondaryCandidate(), deps, true);

        expect(update.status).toBe('not_configured');
        expect(deps.pinCidToSecondaryProvider).not.toHaveBeenCalled();
    });

    it('submits a fresh pin-by-CID request when pinata is healthy this pass', async () => {
        const deps = makeDeps({
            pinCidToSecondaryProvider: vi.fn().mockResolvedValue({ requestId: 'req-9', status: 'queued' }),
        });

        const update = await processPinCandidate(secondaryCandidate(), deps, true);

        expect(deps.pinCidToSecondaryProvider).toHaveBeenCalledWith('cid-1', 'credential-cred-1');
        expect(update.status).toBe('pending');
        expect(update.providerRequestId).toBe('req-9');
    });

    it('defers (does not submit) when pinata is not healthy this pass — nothing to fetch from yet', async () => {
        const deps = makeDeps();

        const update = await processPinCandidate(secondaryCandidate(), deps, false);

        expect(deps.pinCidToSecondaryProvider).not.toHaveBeenCalled();
        expect(update.status).toBe('pending');
    });

    it('polls an existing request id and reports pinned once complete', async () => {
        const deps = makeDeps({
            getSecondaryPinStatus: vi.fn().mockResolvedValue({ requestId: 'req-1', status: 'pinned' }),
        });

        const update = await processPinCandidate(
            secondaryCandidate({ providerRequestId: 'req-1' }),
            deps,
            true,
        );

        expect(deps.getSecondaryPinStatus).toHaveBeenCalledWith('req-1');
        expect(deps.pinCidToSecondaryProvider).not.toHaveBeenCalled();
        expect(update.status).toBe('pinned');
    });

    it('keeps polling (pending) while queued/pinning', async () => {
        const deps = makeDeps({
            getSecondaryPinStatus: vi.fn().mockResolvedValue({ requestId: 'req-1', status: 'pinning' }),
        });

        const update = await processPinCandidate(
            secondaryCandidate({ providerRequestId: 'req-1' }),
            deps,
            true,
        );

        expect(update.status).toBe('pending');
        expect(deps.pinCidToSecondaryProvider).not.toHaveBeenCalled();
    });

    it('re-submits a fresh pin request when the existing one has failed', async () => {
        const deps = makeDeps({
            getSecondaryPinStatus: vi.fn().mockResolvedValue({ requestId: 'req-1', status: 'failed' }),
            pinCidToSecondaryProvider: vi.fn().mockResolvedValue({ requestId: 'req-2', status: 'queued' }),
        });

        const update = await processPinCandidate(
            secondaryCandidate({ providerRequestId: 'req-1' }),
            deps,
            true,
        );

        expect(deps.pinCidToSecondaryProvider).toHaveBeenCalled();
        expect(update.providerRequestId).toBe('req-2');
    });

    it('reports failed with the error message when the provider call throws', async () => {
        const deps = makeDeps({
            pinCidToSecondaryProvider: vi.fn().mockRejectedValue(new Error('network down')),
        });

        const update = await processPinCandidate(secondaryCandidate(), deps, true);

        expect(update.status).toBe('failed');
        expect(update.lastError).toBe('network down');
    });
});

describe('runPinKeeperSweepPure', () => {
    it('processes pinata before secondary so a same-pass repair is discoverable', async () => {
        const callOrder: string[] = [];
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockImplementation(async () => {
                callOrder.push('pinata-check');
                return 'missing';
            }),
            pinJsonToPinata: vi.fn().mockImplementation(async () => {
                callOrder.push('pinata-repair');
                return 'cid-1';
            }),
            pinCidToSecondaryProvider: vi.fn().mockImplementation(async () => {
                callOrder.push('secondary-submit');
                return { requestId: 'req-1', status: 'pinned' };
            }),
        });

        const candidates = [secondaryCandidate(), pinataCandidate({ status: 'failed' })]; // deliberately out of order
        const summary = await runPinKeeperSweepPure(candidates, deps);

        expect(callOrder).toEqual(['pinata-check', 'pinata-repair', 'secondary-submit']);
        expect(summary.healthy).toBe(2);
        expect(summary.repaired).toBe(2); // both started non-pinned and ended pinned
    });

    it('flags a credential as critical only when zero providers end up healthy', async () => {
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockResolvedValue('missing'),
            pinJsonToPinata: vi.fn().mockRejectedValue(new Error('pinata down')),
            isSecondaryPinningConfigured: vi.fn().mockReturnValue(false),
        });

        const candidates = [pinataCandidate({ status: 'failed' }), secondaryCandidate({ status: 'failed' })];
        const summary = await runPinKeeperSweepPure(candidates, deps);

        expect(summary.criticalCredentialIds).toEqual(['cred-1']);
        expect(summary.stillFailing).toBe(1); // pinata failed; secondary is not_configured, not "failed"
    });

    it('does not flag critical when at least one provider is healthy', async () => {
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockResolvedValue('pinned'),
            isSecondaryPinningConfigured: vi.fn().mockReturnValue(false),
        });

        const candidates = [pinataCandidate({ status: 'pinned' }), secondaryCandidate({ status: 'failed' })];
        const summary = await runPinKeeperSweepPure(candidates, deps);

        expect(summary.criticalCredentialIds).toEqual([]);
    });

    it('counts erased credentials separately and never as critical', async () => {
        const deps = makeDeps();
        const redactedMeta = { redacted: true };
        const candidates = [
            pinataCandidate({ status: 'failed', metadata: redactedMeta }),
            secondaryCandidate({ status: 'failed', metadata: redactedMeta }),
        ];

        const summary = await runPinKeeperSweepPure(candidates, deps);

        expect(summary.erasedSkipped).toBe(2);
        expect(summary.criticalCredentialIds).toEqual([]);
        expect(summary.stillFailing).toBe(0);
    });

    it('handles multiple independent credentials in one sweep', async () => {
        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockResolvedValue('pinned'),
            isSecondaryPinningConfigured: vi.fn().mockReturnValue(false),
        });

        const candidates = [
            pinataCandidate({ id: 'a-pinata', credentialId: 'cred-a', status: 'pending' }),
            secondaryCandidate({ id: 'a-secondary', credentialId: 'cred-a', status: 'pending' }),
            pinataCandidate({ id: 'b-pinata', credentialId: 'cred-b', status: 'pending' }),
            secondaryCandidate({ id: 'b-secondary', credentialId: 'cred-b', status: 'pending' }),
        ];

        const summary = await runPinKeeperSweepPure(candidates, deps);

        expect(summary.checked).toBe(4);
        expect(summary.healthy).toBe(2); // one 'pinned' pinata row per credential
        expect(summary.criticalCredentialIds).toEqual([]);
    });
});

// ─── Supabase-wired orchestration ───────────────────────────────────────────

/**
 * Builds a fake Supabase client whose `.from('credential_pins')` calls are
 * answered in sequence: the two "which credentials are due" queries, then
 * the "full rows for those credentials" query, then one `.update().eq()`
 * call per persisted row. Each query-builder chain is itself thenable so
 * `await` resolves regardless of which filter methods were called on it.
 */
function makeFakeSupabase(responses: {
    unresolvedIds: { data: Array<{ credential_id: string }> | null; error: unknown };
    staleIds: { data: Array<{ credential_id: string }> | null; error: unknown };
    rows: { data: unknown[] | null; error: unknown };
}) {
    const updateCalls: Array<{ values: unknown; id: string }> = [];
    let selectCallIndex = 0;

    function chainable(result: { data: unknown; error: unknown }) {
        const chain: any = {
            select: () => chain,
            not: () => chain,
            eq: (_col: string, value: string) => {
                // Only the update().eq() path cares about the id; capture it.
                if (chain.__pendingUpdate) {
                    updateCalls.push({ values: chain.__pendingUpdate, id: value });
                    return Promise.resolve({ error: null });
                }
                return chain;
            },
            lt: () => chain,
            in: () => chain,
            limit: () => Promise.resolve(result),
            update: (values: unknown) => {
                chain.__pendingUpdate = values;
                return chain;
            },
            then: (resolve: (v: unknown) => void) => resolve(result),
        };
        return chain;
    }

    const from = vi.fn(() => {
        selectCallIndex += 1;
        if (selectCallIndex === 1) return chainable(responses.unresolvedIds);
        if (selectCallIndex === 2) return chainable(responses.staleIds);
        if (selectCallIndex === 3) return chainable(responses.rows);
        return chainable({ data: null, error: null });
    });

    return { from, updateCalls } as unknown as { from: typeof from; updateCalls: typeof updateCalls };
}

describe('runPinKeeperSweep (Supabase orchestration)', () => {
    it('returns an empty summary and makes no further queries when nothing is due', async () => {
        const supabase = makeFakeSupabase({
            unresolvedIds: { data: [], error: null },
            staleIds: { data: [], error: null },
            rows: { data: [], error: null },
        });

        const summary = await runPinKeeperSweep(supabase as any, { deps: makeDeps() });

        expect(summary).toEqual({
            checked: 0,
            healthy: 0,
            repaired: 0,
            stillFailing: 0,
            erasedSkipped: 0,
            criticalCredentialIds: [],
            updates: [],
        });
    });

    it('fetches full per-credential rows for anything due, sweeps them, and persists the results', async () => {
        const rows = [
            {
                id: 'pin-1',
                credential_id: 'cred-1',
                cid: 'cid-1',
                provider: 'pinata',
                status: 'pending',
                provider_request_id: null,
                credentials: { metadata: { credentialData: { studentName: 'Alice' } } },
            },
            {
                id: 'pin-2',
                credential_id: 'cred-1',
                cid: 'cid-1',
                provider: 'secondary',
                status: 'pending',
                provider_request_id: null,
                credentials: { metadata: { credentialData: { studentName: 'Alice' } } },
            },
        ];

        const supabase = makeFakeSupabase({
            unresolvedIds: { data: [{ credential_id: 'cred-1' }], error: null },
            staleIds: { data: [], error: null },
            rows: { data: rows, error: null },
        });

        const deps = makeDeps({
            checkPinataPinStatus: vi.fn().mockResolvedValue('pinned'),
            isSecondaryPinningConfigured: vi.fn().mockReturnValue(false),
        });

        const summary = await runPinKeeperSweep(supabase as any, { deps });

        expect(summary.checked).toBe(2);
        expect(summary.healthy).toBe(1);
        expect(supabase.updateCalls).toHaveLength(2);
        expect(supabase.updateCalls.map((c) => c.id).sort()).toEqual(['pin-1', 'pin-2']);
        const pinataUpdate = supabase.updateCalls.find((c) => c.id === 'pin-1')!.values as Record<string, unknown>;
        expect(pinataUpdate.status).toBe('pinned');
    });

    it('deduplicates a credential that is due from both the unresolved and stale queries', async () => {
        const rows = [
            {
                id: 'pin-1',
                credential_id: 'cred-1',
                cid: 'cid-1',
                provider: 'pinata',
                status: 'pinned',
                provider_request_id: null,
                credentials: { metadata: { credentialData: {} } },
            },
        ];

        const supabase = makeFakeSupabase({
            unresolvedIds: { data: [{ credential_id: 'cred-1' }], error: null },
            staleIds: { data: [{ credential_id: 'cred-1' }], error: null },
            rows: { data: rows, error: null },
        });

        const summary = await runPinKeeperSweep(supabase as any, {
            deps: makeDeps({ checkPinataPinStatus: vi.fn().mockResolvedValue('pinned') }),
        });

        expect(summary.checked).toBe(1);
    });
});
