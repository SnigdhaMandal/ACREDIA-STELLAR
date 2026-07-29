import { createHash } from 'crypto';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import {
    CREDENTIAL_HASH_ALGORITHM,
    CREDENTIAL_HASH_ALGORITHM_V1,
    CREDENTIAL_HASH_ALGORITHM_V2,
    CREDENTIAL_METADATA_SCHEMA_VERSION,
    CREDENTIAL_METADATA_SCHEMA_VERSION_V1,
    CREDENTIAL_METADATA_SCHEMA_VERSION_V2,
    LEGACY_CREDENTIAL_HASH_ALGORITHM,
    LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION,
    buildCanonicalCredentialPayloadV1,
    buildCanonicalCredentialPayloadV2,
    canonicalJson,
    deriveCredentialHash,
    generateCanonicalCredentialHash,
    serializeCredentialMetadataForHash,
} from '../src/lib/credentialHash';

// ─── V1 (legacy NFT-style) canonicalization — still fully supported ────────

const metadataV1 = {
    name: 'Degree - Alice Smith',
    description: 'Academic credential issued by Acredia Academy to Alice Smith',
    image: 'ipfs://file-cid',
    attributes: [{ trait_type: 'Credential Type', value: 'Degree' }],
    credentialData: {
        studentName: 'Alice Smith',
        studentWallet: 'GSTUDENTADDRESS',
        degree: 'BSc Computer Science',
        major: 'Software Engineering',
        gpa: undefined,
        issueDate: '2026-05-31',
        institutionName: 'Acredia Academy',
        credentialType: 'Degree',
        subjects: [
            {
                id: 'math-101',
                name: 'Mathematics',
                marks: 95,
                maxMarks: '100',
            },
        ],
    },
};

const canonicalVectorV1 =
    '{"credentialData":{"credentialType":"Degree","degree":"BSc Computer Science","gpa":null,"institutionName":"Acredia Academy","issueDate":"2026-05-31","major":"Software Engineering","studentName":"Alice Smith","studentWallet":"GSTUDENTADDRESS","subjects":[{"grade":null,"id":"math-101","marks":"95","maxMarks":"100","name":"Mathematics"}]},"description":"Academic credential issued by Acredia Academy to Alice Smith","image":"ipfs://file-cid","name":"Degree - Alice Smith","schemaVersion":1}';

const canonicalHashVectorV1 = 'feca52dc50aee21c1942333a13873250b5bda373e09a4e2aff29b80a44a78545';

describe('canonical credential metadata hashing — schema v1 (legacy NFT-style)', () => {
    it('serializes schema v1 payloads to a stable canonical test vector', () => {
        expect(serializeCredentialMetadataForHash(metadataV1, CREDENTIAL_METADATA_SCHEMA_VERSION_V1)).toBe(
            canonicalVectorV1,
        );
    });

    it('hashes schema v1 payloads to the shared browser/server test vector', async () => {
        await expect(
            generateCanonicalCredentialHash(metadataV1, CREDENTIAL_METADATA_SCHEMA_VERSION_V1),
        ).resolves.toBe(canonicalHashVectorV1);
        await expect(
            deriveCredentialHash(metadataV1, CREDENTIAL_METADATA_SCHEMA_VERSION_V1, CREDENTIAL_HASH_ALGORITHM_V1),
        ).resolves.toBe(canonicalHashVectorV1);
    });

    it('keeps semantically equivalent metadata stable across key ordering and optional fields', async () => {
        const reordered = {
            credentialData: {
                subjects: [
                    {
                        maxMarks: 100,
                        marks: '95',
                        name: 'Mathematics',
                        id: 'math-101',
                        grade: undefined,
                    },
                ],
                credentialType: 'Degree',
                institutionName: 'Acredia Academy',
                issueDate: '2026-05-31',
                major: 'Software Engineering',
                degree: 'BSc Computer Science',
                studentWallet: 'GSTUDENTADDRESS',
                studentName: 'Alice Smith',
            },
            image: 'ipfs://file-cid',
            description: 'Academic credential issued by Acredia Academy to Alice Smith',
            name: 'Degree - Alice Smith',
        };

        await expect(
            generateCanonicalCredentialHash(reordered, CREDENTIAL_METADATA_SCHEMA_VERSION_V1),
        ).resolves.toBe(canonicalHashVectorV1);
    });

    it('normalizes equivalent issue date representations in schema v1', async () => {
        const withIsoTimestamp = {
            ...metadataV1,
            credentialData: {
                ...metadataV1.credentialData,
                issueDate: '2026-05-31T00:00:00.000Z',
            },
        };

        const withDateObject = {
            ...metadataV1,
            credentialData: {
                ...metadataV1.credentialData,
                issueDate: new Date('2026-05-31T00:00:00.000Z'),
            },
        };

        await expect(
            generateCanonicalCredentialHash(withIsoTimestamp, CREDENTIAL_METADATA_SCHEMA_VERSION_V1),
        ).resolves.toBe(canonicalHashVectorV1);
        await expect(
            generateCanonicalCredentialHash(withDateObject, CREDENTIAL_METADATA_SCHEMA_VERSION_V1),
        ).resolves.toBe(canonicalHashVectorV1);
    });

    it('matches Node SHA-256 over the same canonical payload string', async () => {
        const payload = buildCanonicalCredentialPayloadV1(metadataV1);
        const serialized = canonicalJson(payload as any);
        const nodeHash = createHash('sha256').update(serialized).digest('hex');

        expect(serialized).toBe(canonicalVectorV1);
        await expect(
            generateCanonicalCredentialHash(metadataV1, CREDENTIAL_METADATA_SCHEMA_VERSION_V1),
        ).resolves.toBe(nodeHash);
    });

    it('preserves legacy JSON.stringify hashing for unstamped credentials', async () => {
        const legacyHash = createHash('sha256').update(JSON.stringify(metadataV1)).digest('hex');

        await expect(deriveCredentialHash(metadataV1, null, null)).resolves.toBe(legacyHash);
        await expect(
            deriveCredentialHash(
                metadataV1,
                LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION,
                LEGACY_CREDENTIAL_HASH_ALGORITHM,
            ),
        ).resolves.toBe(legacyHash);
    });

    it('rejects unsupported stamped hash schemas instead of guessing', async () => {
        await expect(deriveCredentialHash(metadataV1, 99, CREDENTIAL_HASH_ALGORITHM)).rejects.toThrow(
            /Unsupported credential metadata hash schema/,
        );
    });
});

// ─── V2 (W3C VC / Open Badges 3.0) canonicalization — current default ──────

const metadataV2 = {
    '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        { acredia: 'https://acredia.app/ns#' },
    ],
    id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: 'Degree - Alice Smith',
    description: 'Academic credential issued by Acredia Academy to Alice Smith',
    image: 'ipfs://file-cid',
    issuer: {
        id: 'https://stellar.expert/explorer/testnet/account/GISSUERADDRESS',
        type: ['Profile'],
        name: 'Acredia Academy',
    },
    issuanceDate: '2026-05-31T00:00:00.000Z',
    credentialSubject: {
        id: 'https://stellar.expert/explorer/testnet/account/GSTUDENTADDRESS',
        type: ['AchievementSubject'],
        name: 'Alice Smith',
        achievement: {
            id: 'urn:acredia:achievement:gissuer:degree:bsc-computer-science',
            type: ['Achievement'],
            name: 'BSc Computer Science',
            description: 'Academic degree verified on the Stellar blockchain.',
            achievementType: 'Degree',
            criteria: { narrative: 'Issued upon successful completion and verification.' },
        },
        result: [{ type: ['Result'], resultDescription: 'GPA', value: '3.9' }],
    },
    evidence: [
        {
            id: 'ipfs://evidence-cid',
            type: ['Evidence'],
            name: 'Original credential document',
            description: 'Source document uploaded by Acredia Academy at issuance.',
        },
    ],
    credentialData: {
        studentName: 'Alice Smith',
        studentWallet: 'GSTUDENTADDRESS',
        degree: 'BSc Computer Science',
        major: 'Software Engineering',
        gpa: '3.9',
        issueDate: '2026-05-31',
        institutionName: 'Acredia Academy',
        credentialType: 'Degree',
        subjects: [{ id: 'math-101', name: 'Mathematics', marks: 95, maxMarks: '100' }],
    },
};

describe('canonical credential metadata hashing — schema v2 (W3C VC / Open Badges 3.0)', () => {
    it('is the default schema version and hash algorithm for new issuances', () => {
        expect(CREDENTIAL_METADATA_SCHEMA_VERSION).toBe(CREDENTIAL_METADATA_SCHEMA_VERSION_V2);
        expect(CREDENTIAL_HASH_ALGORITHM).toBe(CREDENTIAL_HASH_ALGORITHM_V2);
    });

    it('produces a stable canonical JSON string that only includes the whitelisted VC fields', () => {
        const payload = buildCanonicalCredentialPayloadV2(metadataV2);
        expect(payload.schemaVersion).toBe(2);
        expect(payload.issuer.name).toBe('Acredia Academy');
        expect(payload.credentialSubject.achievement.name).toBe('BSc Computer Science');
        expect(payload.credentialSubject.result).toEqual([
            { type: ['Result'], resultDescription: 'GPA', value: '3.9' },
        ]);
        expect(payload.evidence).toHaveLength(1);
        expect(payload.credentialData.studentName).toBe('Alice Smith');

        const serialized = canonicalJson(payload as any);
        const nodeHash = createHash('sha256').update(serialized).digest('hex');
        expect(serialized).toBe(canonicalJson(buildCanonicalCredentialPayloadV2(metadataV2) as any));

        return expect(
            generateCanonicalCredentialHash(metadataV2, CREDENTIAL_METADATA_SCHEMA_VERSION_V2),
        ).resolves.toBe(nodeHash);
    });

    it('routes the default (unversioned) call through V2 canonicalization', async () => {
        const viaDefault = await generateCanonicalCredentialHash(metadataV2);
        const viaExplicitV2 = await generateCanonicalCredentialHash(
            metadataV2,
            CREDENTIAL_METADATA_SCHEMA_VERSION_V2,
        );
        expect(viaDefault).toBe(viaExplicitV2);

        await expect(
            deriveCredentialHash(metadataV2, CREDENTIAL_METADATA_SCHEMA_VERSION_V2, CREDENTIAL_HASH_ALGORITHM_V2),
        ).resolves.toBe(viaDefault);
    });

    it('is stable across key reordering and ignores fields outside the whitelist (e.g. a post-hoc onChainAnchor)', async () => {
        const withExtraField = {
            ...metadataV2,
            onChainAnchor: { contractId: 'CAAA...', tokenId: '1' },
            credentialStatus: { type: 'StellarSorobanRevocationStatus2024' },
        };

        const reordered = {
            credentialData: metadataV2.credentialData,
            evidence: metadataV2.evidence,
            credentialSubject: metadataV2.credentialSubject,
            issuanceDate: metadataV2.issuanceDate,
            issuer: metadataV2.issuer,
            image: metadataV2.image,
            description: metadataV2.description,
            name: metadataV2.name,
            type: metadataV2.type,
            id: metadataV2.id,
            '@context': metadataV2['@context'],
        };

        const baseline = await generateCanonicalCredentialHash(metadataV2, CREDENTIAL_METADATA_SCHEMA_VERSION_V2);
        await expect(
            generateCanonicalCredentialHash(withExtraField, CREDENTIAL_METADATA_SCHEMA_VERSION_V2),
        ).resolves.toBe(baseline);
        await expect(
            generateCanonicalCredentialHash(reordered, CREDENTIAL_METADATA_SCHEMA_VERSION_V2),
        ).resolves.toBe(baseline);
    });

    it('does not cross-contaminate with the V1 canonicalization for the same input', async () => {
        const asV1 = await generateCanonicalCredentialHash(metadataV2, CREDENTIAL_METADATA_SCHEMA_VERSION_V1);
        const asV2 = await generateCanonicalCredentialHash(metadataV2, CREDENTIAL_METADATA_SCHEMA_VERSION_V2);
        expect(asV1).not.toBe(asV2);
    });
});
