export const LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION = 0;
/** Custom NFT-style metadata shape (`name`/`description`/`attributes`/`credentialData`). Superseded by V2 but still derivable for already-issued credentials. */
export const CREDENTIAL_METADATA_SCHEMA_VERSION_V1 = 1;
/** W3C Verifiable Credential / Open Badges 3.0 JSON-LD document. Default for all new issuances (see verifiableCredential.ts). */
export const CREDENTIAL_METADATA_SCHEMA_VERSION_V2 = 2;
/** The schema version used for newly-issued credentials. */
export const CREDENTIAL_METADATA_SCHEMA_VERSION = CREDENTIAL_METADATA_SCHEMA_VERSION_V2;

export const CREDENTIAL_HASH_ALGORITHM_V1 = 'sha256:canonical-json:v1';
export const CREDENTIAL_HASH_ALGORITHM_V2 = 'sha256:canonical-json:v2';
/** The hash algorithm identifier used for newly-issued credentials. */
export const CREDENTIAL_HASH_ALGORITHM = CREDENTIAL_HASH_ALGORITHM_V2;
export const LEGACY_CREDENTIAL_HASH_ALGORITHM = 'sha256:json-stringify';

export type CredentialMetadataSchemaVersion =
    | typeof LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION
    | typeof CREDENTIAL_METADATA_SCHEMA_VERSION_V1
    | typeof CREDENTIAL_METADATA_SCHEMA_VERSION_V2;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface CanonicalCredentialPayloadV1 {
    schemaVersion: typeof CREDENTIAL_METADATA_SCHEMA_VERSION_V1;
    name: string;
    description: string;
    image: string;
    credentialData: {
        studentName: string;
        studentWallet: string;
        degree: string;
        major: string | null;
        gpa: string | null;
        issueDate: string;
        institutionName: string;
        credentialType: string;
        subjects: Array<{
            id: string;
            name: string;
            marks: string;
            maxMarks: string;
            grade: string | null;
        }>;
    };
}

/**
 * Canonical shape for a W3C Verifiable Credential / Open Badges 3.0 metadata
 * document (see `verifiableCredential.ts` for the builder that produces the
 * full document this is extracted from). Only these fields participate in
 * the on-chain hash — anything added to the document *after* hashing (e.g.
 * a `credentialStatus`/on-chain-anchor block attached only to a downloaded
 * export copy) is deliberately excluded, mirroring V1's explicit-allowlist
 * approach so the hash stays stable regardless of incidental extra fields.
 */
export interface CanonicalCredentialPayloadV2 {
    schemaVersion: typeof CREDENTIAL_METADATA_SCHEMA_VERSION_V2;
    '@context': string[];
    id: string;
    type: string[];
    name: string;
    description: string;
    image: string | null;
    issuer: {
        id: string;
        type: string[];
        name: string;
    };
    issuanceDate: string;
    credentialSubject: {
        id: string;
        type: string[];
        name: string;
        achievement: {
            id: string;
            type: string[];
            name: string;
            description: string;
            achievementType: string | null;
            criteria: { narrative: string };
        };
        result: Array<{
            type: string[];
            resultDescription: string;
            value: string;
        }>;
    };
    evidence: Array<{
        id: string;
        type: string[];
        name: string;
        description: string;
    }>;
    /** Legacy-shaped extension retained for backward-compatible internal display (search filters, dashboards). Not part of the VC/OBv3 standard fields. */
    credentialData: CanonicalCredentialPayloadV1['credentialData'];
}

function requiredStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => requiredString(item)) : [];
}

export function buildCanonicalCredentialPayloadV2(metadata: unknown): CanonicalCredentialPayloadV2 {
    const root = asRecord(metadata);
    const issuer = asRecord(root.issuer);
    const credentialSubject = asRecord(root.credentialSubject);
    const achievement = asRecord(credentialSubject.achievement);
    const results = Array.isArray(credentialSubject.result) ? credentialSubject.result : [];
    const evidence = Array.isArray(root.evidence) ? root.evidence : [];
    const credentialData = asRecord(root.credentialData);
    const subjects = Array.isArray(credentialData.subjects) ? credentialData.subjects : [];

    return {
        schemaVersion: CREDENTIAL_METADATA_SCHEMA_VERSION_V2,
        '@context': requiredStringArray(root['@context']),
        id: requiredString(root.id),
        type: requiredStringArray(root.type),
        name: requiredString(root.name),
        description: requiredString(root.description),
        image: optionalString(root.image),
        issuer: {
            id: requiredString(issuer.id),
            type: requiredStringArray(issuer.type),
            name: requiredString(issuer.name),
        },
        issuanceDate: requiredString(root.issuanceDate),
        credentialSubject: {
            id: requiredString(credentialSubject.id),
            type: requiredStringArray(credentialSubject.type),
            name: requiredString(credentialSubject.name),
            achievement: {
                id: requiredString(achievement.id),
                type: requiredStringArray(achievement.type),
                name: requiredString(achievement.name),
                description: requiredString(achievement.description),
                achievementType: optionalString(achievement.achievementType),
                criteria: { narrative: requiredString(asRecord(achievement.criteria).narrative) },
            },
            result: results.map((result) => {
                const item = asRecord(result);
                return {
                    type: requiredStringArray(item.type),
                    resultDescription: requiredString(item.resultDescription),
                    value: requiredString(item.value),
                };
            }),
        },
        evidence: evidence.map((item) => {
            const record = asRecord(item);
            return {
                id: requiredString(record.id),
                type: requiredStringArray(record.type),
                name: requiredString(record.name),
                description: requiredString(record.description),
            };
        }),
        credentialData: {
            studentName: requiredString(credentialData.studentName),
            studentWallet: requiredString(credentialData.studentWallet),
            degree: requiredString(credentialData.degree),
            major: optionalString(credentialData.major),
            gpa: optionalString(credentialData.gpa),
            issueDate: requiredDateString(credentialData.issueDate),
            institutionName: requiredString(credentialData.institutionName),
            credentialType: requiredString(credentialData.credentialType),
            subjects: subjects.map((subject) => {
                const item = asRecord(subject);
                return {
                    id: requiredString(item.id),
                    name: requiredString(item.name),
                    marks: requiredString(item.marks),
                    maxMarks: requiredString(item.maxMarks),
                    grade: optionalString(item.grade),
                };
            }),
        },
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function requiredString(value: unknown): string {
    return value == null ? '' : String(value);
}

function optionalString(value: unknown): string | null {
    if (value == null || value === '') {
        return null;
    }

    return String(value);
}

function requiredDateString(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const text = requiredString(value);
    const isoDate = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(text);

    return isoDate ? isoDate[1] : text;
}

export function buildCanonicalCredentialPayloadV1(metadata: unknown): CanonicalCredentialPayloadV1 {
    const root = asRecord(metadata);
    const credentialData = asRecord(root.credentialData);
    const subjects = Array.isArray(credentialData.subjects) ? credentialData.subjects : [];

    return {
        schemaVersion: CREDENTIAL_METADATA_SCHEMA_VERSION_V1,
        name: requiredString(root.name),
        description: requiredString(root.description),
        image: requiredString(root.image),
        credentialData: {
            studentName: requiredString(credentialData.studentName),
            studentWallet: requiredString(credentialData.studentWallet),
            degree: requiredString(credentialData.degree),
            major: optionalString(credentialData.major),
            gpa: optionalString(credentialData.gpa),
            issueDate: requiredDateString(credentialData.issueDate),
            institutionName: requiredString(credentialData.institutionName),
            credentialType: requiredString(credentialData.credentialType),
            subjects: subjects.map((subject) => {
                const item = asRecord(subject);

                return {
                    id: requiredString(item.id),
                    name: requiredString(item.name),
                    marks: requiredString(item.marks),
                    maxMarks: requiredString(item.maxMarks),
                    grade: optionalString(item.grade),
                };
            }),
        },
    };
}

export function canonicalJson(value: JsonValue): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    }

    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Web Crypto SHA-256 is unavailable in this environment');
    }

    const encoded = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export function serializeCredentialMetadataForHash(
    metadata: unknown,
    schemaVersion: number | null | undefined = CREDENTIAL_METADATA_SCHEMA_VERSION,
): string {
    if (schemaVersion === CREDENTIAL_METADATA_SCHEMA_VERSION_V2) {
        return canonicalJson(buildCanonicalCredentialPayloadV2(metadata) as unknown as JsonValue);
    }

    if (schemaVersion === CREDENTIAL_METADATA_SCHEMA_VERSION_V1) {
        return canonicalJson(buildCanonicalCredentialPayloadV1(metadata) as unknown as JsonValue);
    }

    if (
        schemaVersion === LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION ||
        schemaVersion === null ||
        schemaVersion === undefined
    ) {
        return JSON.stringify(metadata);
    }

    throw new Error(`Unsupported credential metadata schema version: ${schemaVersion}`);
}

export async function generateCanonicalCredentialHash(
    metadata: unknown,
    schemaVersion: number = CREDENTIAL_METADATA_SCHEMA_VERSION,
): Promise<string> {
    return sha256Hex(serializeCredentialMetadataForHash(metadata, schemaVersion));
}

export async function deriveCredentialHash(
    metadata: unknown,
    schemaVersion?: number | null,
    hashAlgorithm?: string | null,
): Promise<string> {
    if (
        schemaVersion === CREDENTIAL_METADATA_SCHEMA_VERSION_V2 &&
        hashAlgorithm === CREDENTIAL_HASH_ALGORITHM_V2
    ) {
        return generateCanonicalCredentialHash(metadata, CREDENTIAL_METADATA_SCHEMA_VERSION_V2);
    }

    if (
        schemaVersion === CREDENTIAL_METADATA_SCHEMA_VERSION_V1 &&
        hashAlgorithm === CREDENTIAL_HASH_ALGORITHM_V1
    ) {
        return generateCanonicalCredentialHash(metadata, CREDENTIAL_METADATA_SCHEMA_VERSION_V1);
    }

    if (
        (schemaVersion === LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION ||
            schemaVersion === null ||
            schemaVersion === undefined) &&
        (!hashAlgorithm || hashAlgorithm === LEGACY_CREDENTIAL_HASH_ALGORITHM)
    ) {
        return sha256Hex(JSON.stringify(metadata));
    }

    throw new Error(
        `Unsupported credential metadata hash schema: ${schemaVersion ?? 'legacy'} / ${hashAlgorithm ?? 'unknown'}`,
    );
}
