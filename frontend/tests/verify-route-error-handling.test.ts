import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/verify/[token]/route';
import { resetRateLimitStore } from '@/lib/rateLimit';
import { NextRequest } from 'next/server';
import {
    ContractConfigurationError,
    BlockchainUnavailableError,
} from '@/lib/contractReads';

const {
    mockMaybeSingle,
} = vi.hoisted(() => ({
    mockMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/serverAuth', () => ({
    getServiceRoleClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: mockMaybeSingle,
                }),
            }),
        }),
    }),
}));

const {
    mockGetCredential,
    mockIsRevoked,
    mockIsAuthorizedIssuer,
} = vi.hoisted(() => ({
    mockGetCredential: vi.fn(),
    mockIsRevoked: vi.fn(),
    mockIsAuthorizedIssuer: vi.fn(),
}));

vi.mock('@/lib/contractReads', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/contractReads')>();
    return {
        ...actual,
        getCredential: mockGetCredential,
        isRevoked: mockIsRevoked,
        isAuthorizedIssuer: mockIsAuthorizedIssuer,
    };
});

vi.mock('@/lib/credentialHash', () => ({
    deriveCredentialHash: async () => 'derived-hash',
}));

vi.mock('@/lib/ipfsServer', () => ({
    fetchJsonFromIpfs: async () => ({ ok: true, content: {} }),
}));

describe('verify route error handling and payload checks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimitStore();
    });

    it('returns 404 if the token does not exist in the database', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: null,
            error: null,
        });

        const response = await GET(new NextRequest('http://localhost/api/verify/missing-token'), {
            params: Promise.resolve({ token: 'missing-token' }),
        });

        expect(response.status).toBe(404);
        const payload = await response.json();
        expect(payload).toEqual({
            success: false,
            error: 'Credential not found',
        });
    });

    it('returns 500 when ContractConfigurationError is thrown', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: 'cred-001',
                token_id: 'token-123',
                issued_at: '2026-01-01T00:00:00.000Z',
                revoked: false,
                revoked_at: null,
                metadata: {
                    credentialData: {
                        institutionName: 'ACREDIA',
                    },
                },
                metadata_schema_version: 1,
                hash_algorithm: 'sha256',
                ipfs_hash: 'cid-123',
                student_wallet_address: 'GStudent',
                issuer_wallet_address: 'GIssuer',
                institution: { name: 'ACREDIA' },
            },
            error: null,
        });

        mockGetCredential.mockRejectedValue(new ContractConfigurationError('Missing contract configuration'));

        const response = await GET(new NextRequest('http://localhost/api/verify/token-123'), {
            params: Promise.resolve({ token: 'token-123' }),
        });

        expect(response.status).toBe(500);
        const payload = await response.json();
        expect(payload).toEqual({
            success: false,
            error: 'Server configuration error',
        });
    });

    it('returns 503 when BlockchainUnavailableError is thrown', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: 'cred-001',
                token_id: 'token-123',
                issued_at: '2026-01-01T00:00:00.000Z',
                revoked: false,
                revoked_at: null,
                metadata: {
                    credentialData: {
                        institutionName: 'ACREDIA',
                    },
                },
                metadata_schema_version: 1,
                hash_algorithm: 'sha256',
                ipfs_hash: 'cid-123',
                student_wallet_address: 'GStudent',
                issuer_wallet_address: 'GIssuer',
                institution: { name: 'ACREDIA' },
            },
            error: null,
        });

        mockGetCredential.mockRejectedValue(new BlockchainUnavailableError('Blockchain verification unavailable'));

        const response = await GET(new NextRequest('http://localhost/api/verify/token-123'), {
            params: Promise.resolve({ token: 'token-123' }),
        });

        expect(response.status).toBe(503);
        const payload = await response.json();
        expect(payload).toEqual({
            success: false,
            error: 'Blockchain verification unavailable',
        });
    });

    it('verifies credential successfully and removes databaseMatch from payload', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: 'cred-001',
                token_id: 'token-123',
                issued_at: '2026-01-01T00:00:00.000Z',
                revoked: false,
                revoked_at: null,
                metadata: {
                    credentialData: {
                        institutionName: 'ACREDIA',
                        credentialType: 'Degree',
                    },
                },
                metadata_schema_version: 1,
                hash_algorithm: 'sha256',
                ipfs_hash: 'cid-123',
                student_wallet_address: 'GStudent',
                issuer_wallet_address: 'GIssuer',
                institution: { name: 'ACREDIA' },
            },
            error: null,
        });

        mockGetCredential.mockResolvedValue({
            issuer: 'GIssuer',
            student: 'GStudent',
            hash: 'derived-hash',
            uri: 'ipfs://cid-123',
        });
        mockIsRevoked.mockResolvedValue(false);
        mockIsAuthorizedIssuer.mockResolvedValue(true);

        const response = await GET(new NextRequest('http://localhost/api/verify/token-123'), {
            params: Promise.resolve({ token: 'token-123' }),
        });

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.success).toBe(true);
        expect(payload.verification.verified).toBe(true);
        expect(payload.verification.databaseMatch).toBeUndefined();
        expect(payload.verification.onChainMatch).toBe(true);
        expect(payload.verification.onChainFound).toBe(true);
        expect(payload.verification.issuerAuthorized).toBe(true);
    });
});
