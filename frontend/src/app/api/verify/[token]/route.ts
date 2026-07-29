import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/serverAuth';
import {
    getCredential,
    isAuthorizedIssuer,
    isRevoked,
    ContractConfigurationError,
    BlockchainUnavailableError,
} from '@/lib/contractReads';
import { deriveCredentialHash } from '@/lib/credentialHash';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
    writeVerificationAuditLog,
    type VerificationResultType,
} from '@/lib/verificationAudit';
import { captureException, recordMetric } from '@/lib/debug';

export const dynamic = 'force-dynamic';

const MAX_TOKEN_LENGTH = 128;

const VERIFY_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'verify',
} as const;

type ServiceRoleClient = ReturnType<typeof getServiceRoleClient>;

type ChainChecks = {
    issuerMatch: boolean | null;
    studentMatch: boolean | null;
    hashMatch: boolean | null;
    uriMatch: boolean | null;
    notRevoked: boolean;
};

// Removed unused getErrorMessage

function getMismatchReasons(checks: ChainChecks | null) {
    if (!checks) {
        return ['missing_on_chain'];
    }

    const reasons: string[] = [];
    if (checks.issuerMatch !== true) reasons.push('issuer');
    if (checks.studentMatch !== true) reasons.push('student');
    if (checks.hashMatch !== true) reasons.push('hash');
    if (checks.uriMatch !== true) reasons.push('uri');
    if (!checks.notRevoked) reasons.push('revocation');
    return reasons;
}

function getResultType(verified: boolean, revoked: boolean): VerificationResultType {
    if (verified) {
        return 'verified';
    }

    if (revoked) {
        return 'revoked';
    }

    return 'mismatch';
}

async function logVerificationAttempt(
    supabase: ServiceRoleClient | null,
    request: NextRequest,
    token: string | null,
    resultType: VerificationResultType,
    statusCode: number,
    options: {
        credentialId?: string | null;
        chain?: {
            found?: boolean;
            revoked?: boolean;
            match?: boolean;
        };
        mismatchReasons?: string[];
        errorCategory?: string;
    } = {},
) {
    recordMetric('verification.attempt', 1, {
        resultType,
        statusCode,
        credentialId: options.credentialId,
        chain: options.chain,
        errorCategory: options.errorCategory,
    });

    if (!supabase || !token) {
        return;
    }

    await writeVerificationAuditLog(supabase, {
        request,
        token,
        resultType,
        statusCode,
        credentialId: options.credentialId,
        chain: options.chain,
        mismatchReasons: options.mismatchReasons,
        errorCategory: options.errorCategory,
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    const requestId = request.headers.get('x-request-id') || 'unknown';
    let supabase: ServiceRoleClient | null = null;
    let token: string | null = null;
    let credentialId: string | null = null;

    try {
        const { token: rawToken } = await params;
        token = rawToken?.trim() || null;

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Token is required' },
                { status: 400 },
            );
        }

        const rateLimitResponse = await enforceRateLimit(request, VERIFY_RATE_LIMIT);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        if (token.length > MAX_TOKEN_LENGTH) {
            try {
                supabase = getServiceRoleClient();
            } catch {
                supabase = null;
            }

            await logVerificationAttempt(supabase, request, token, 'invalid_request', 400, {
                errorCategory: 'token_too_long',
            });

            return NextResponse.json(
                { success: false, error: 'Invalid token' },
                { status: 400 },
            );
        }

        supabase = getServiceRoleClient();

        const { data, error } = await supabase
            .from('credentials')
            .select(
                `
                id,
                token_id,
                issued_at,
                revoked,
                revoked_at,
                metadata,
                metadata_schema_version,
                hash_algorithm,
                ipfs_hash,
                blockchain_hash,
                student_wallet_address,
                issuer_wallet_address,
                institution:institutions!credentials_institution_id_fkey (
                    name
                )
            `,
            )
            .eq('token_id', token)
            .maybeSingle();

        if (error) {
            await logVerificationAttempt(supabase, request, token, 'server_error', 500, {
                errorCategory: 'database_query_failed',
            });

            return NextResponse.json(
                { success: false, error: 'Failed to query credential' },
                { status: 500 },
            );
        }

        if (!data) {
            await logVerificationAttempt(supabase, request, token, 'not_found', 404);

            return NextResponse.json(
                { success: false, error: 'Credential not found' },
                { status: 404 },
            );
        }

        credentialId = data.id;

        const [onChain, onChainRevoked, issuerAuthorized] = await Promise.all([
            getCredential(data.token_id),
            isRevoked(data.token_id),
            data.issuer_wallet_address && typeof isAuthorizedIssuer === 'function'
                ? isAuthorizedIssuer(data.issuer_wallet_address)
                : Promise.resolve(false),
        ]);

        const dbHash = data.metadata
            ? await deriveCredentialHash(
                  data.metadata,
                  data.metadata_schema_version,
                  data.hash_algorithm,
              )
            : null;
        const expectedUri = data.ipfs_hash ? `ipfs://${data.ipfs_hash}` : null;

        const checks: ChainChecks | null = onChain
            ? {
                  issuerMatch: data.issuer_wallet_address
                      ? onChain.issuer.toLowerCase() === data.issuer_wallet_address.toLowerCase()
                      : null,
                  studentMatch: data.student_wallet_address
                      ? onChain.student.toLowerCase() === data.student_wallet_address.toLowerCase()
                      : null,
                  hashMatch: dbHash ? onChain.hash === dbHash : null,
                  uriMatch: expectedUri ? onChain.uri === expectedUri : null,
                  notRevoked: !onChainRevoked,
              }
            : null;

        const onChainMatch =
            checks !== null &&
            checks.issuerMatch === true &&
            checks.studentMatch === true &&
            checks.hashMatch === true &&
            checks.uriMatch === true;

        const revoked = Boolean(onChainRevoked || data.revoked);
        const verified = onChain !== null && onChainMatch && !revoked;
        const resultType = getResultType(verified, revoked);

        await logVerificationAttempt(supabase, request, token, resultType, 200, {
            credentialId,
            chain: {
                found: onChain !== null,
                revoked,
                match: onChainMatch,
            },
            mismatchReasons: resultType === 'mismatch' ? getMismatchReasons(checks) : [],
        });

        const institution = Array.isArray(data.institution)
            ? data.institution[0]
            : data.institution;

        const credentialData = data.metadata?.credentialData ?? {};

        return NextResponse.json({
            success: true,
            credential: {
                tokenId: data.token_id,
                issuedAt: data.issued_at,
                revoked,
                revokedAt: data.revoked_at,
                institutionName: institution?.name ?? credentialData.institutionName ?? null,
                credentialType: credentialData.credentialType ?? null,
                degree: credentialData.degree ?? null,
                major: credentialData.major ?? null,
                issueDate: credentialData.issueDate ?? null,
                // Stellar account addresses, not sensitive: already readable
                // on-chain by anyone who queries this token_id directly.
                studentWallet: onChain?.student ?? data.student_wallet_address ?? null,
                institutionWallet: onChain?.issuer ?? data.issuer_wallet_address ?? null,
                metadataSchemaVersion: data.metadata_schema_version ?? null,
                hashAlgorithm: data.hash_algorithm ?? null,
                onChainHash: onChain?.hash ?? null,
                blockchainHash: data.blockchain_hash ?? null,
                ipfsHash: data.ipfs_hash ?? null,
            },
            verification: {
                verified,
                revoked,
                onChainMatch,
                onChainFound: onChain !== null,
                issuerAuthorized,
                issuerStatus: issuerAuthorized ? 'active' : 'revoked',
            },
        });
    } catch (err: unknown) {
        if (err instanceof ContractConfigurationError) {
            captureException(err, { requestId, context: 'GET /api/verify/[token]' });
            await logVerificationAttempt(supabase, request, token, 'chain_unavailable', 500, {
                credentialId,
                errorCategory: 'contract_configuration',
            });

            return NextResponse.json(
                { success: false, error: 'Server configuration error' },
                { status: 500 },
            );
        }

        if (err instanceof BlockchainUnavailableError) {
            captureException(err, { requestId, context: 'GET /api/verify/[token]' });
            await logVerificationAttempt(supabase, request, token, 'chain_unavailable', 503, {
                credentialId,
                errorCategory: 'contract_read_failed',
            });

            return NextResponse.json(
                { success: false, error: 'Blockchain verification unavailable' },
                { status: 503 },
            );
        }

        await logVerificationAttempt(supabase, request, token, 'server_error', 500, {
            credentialId,
            errorCategory: 'unexpected_error',
        });
        captureException(err, { requestId, context: 'GET /api/verify/[token]' });

        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 },
        );
    }
}
