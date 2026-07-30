import { createHmac } from 'node:crypto';
import { getClientIp } from './rateLimit';
import { serverRuntimeConfig } from './runtimeConfig';
import { debugWarn } from './debug';

export const VERIFICATION_RESULT_TYPES = [
    'verified',
    'revoked',
    'not_found',
    'chain_unavailable',
    'mismatch',
    'invalid_request',
    'server_error',
] as const;

export type VerificationResultType = (typeof VERIFICATION_RESULT_TYPES)[number];

type VerificationAuditClient = {
    from: (table: 'verification_logs') => {
        insert: (
            value: Record<string, unknown> | Record<string, unknown>[],
        ) => PromiseLike<{ error?: unknown }> | { error?: unknown };
    };
};

type VerificationAuditLog = {
    request: Request;
    token: string | null;
    credentialId?: string | null;
    resultType: VerificationResultType;
    statusCode: number;
    chain?: {
        found?: boolean;
        revoked?: boolean;
        match?: boolean;
    };
    /**
     * End-to-end CID/hash integrity result (ACREDIA-STELLAR#163): whether the
     * document actually fetched from the on-chain IPFS CID hashes to the
     * on-chain `credential_hash`. Already reduced to an enum + boolean before
     * it gets here, so — like the rest of this log — it carries no document
     * content or other identifying data.
     */
    integrity?: {
        status: 'match' | 'mismatch' | 'unavailable';
        cidResolved: boolean;
    };
    mismatchReasons?: string[];
    errorCategory?: string;
    apiKeyContext?: { id: string; name: string } | null;
};

function getHashSecret() {
    return serverRuntimeConfig.verification.hashSecret;
}

export function hashAuditValue(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) {
        return null;
    }

    return createHmac('sha256', getHashSecret()).update(normalized).digest('hex');
}

function buildVerificationResult(log: VerificationAuditLog) {
    return {
        schema_version: 2,
        result_type: log.resultType,
        status_code: log.statusCode,
        token_hash: hashAuditValue(log.token),
        ip_hash: hashAuditValue(getClientIp(log.request)),
        user_agent_hash: hashAuditValue(log.request.headers.get('user-agent')),
        chain: log.chain ?? null,
        integrity: log.integrity ?? null,
        mismatch_reasons: log.mismatchReasons ?? [],
        error_category: log.errorCategory ?? null,
    };
}

export async function writeVerificationAuditLog(
    client: VerificationAuditClient,
    log: VerificationAuditLog,
) {
    try {
        const { error } = await client.from('verification_logs').insert({
            credential_id: log.credentialId ?? null,
            verifier_email: null,
            verifier_org: log.apiKeyContext?.name ?? null,
            verification_result: buildVerificationResult(log),
        });

        if (error && process.env.NODE_ENV !== 'test') {
            debugWarn('Failed to write verification audit log:', error);
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            debugWarn('Failed to write verification audit log:', error);
        }
    }
}
