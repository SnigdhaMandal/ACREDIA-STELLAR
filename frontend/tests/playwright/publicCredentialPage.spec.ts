import { expect, test } from '@playwright/test';
import { createE2eState, installE2eRoutes, seedE2eState } from './e2e-support';

const studentWallet = 'GBSVJNVIAGQEAK3WAAVGXSMT7BMLI4SHAJWKKMRCMJIYG7XESR4ANDZD';
const issuerWallet = 'GAcrediaIssuerWallet0000000000000000000000000000001';

test('renders public credential showcase page with verify CTA, QR, LinkedIn, and export buttons', async ({ page }) => {
    const state = createE2eState({
        role: 'student',
        walletAddress: studentWallet,
        issuedCredentials: [
            {
                id: 'cred-1',
                token_id: '1',
                ipfs_hash: 'e2e-metadata-cid',
                blockchain_hash: 'e2e-tx-1',
                metadata: {
                    credentialData: {
                        studentName: 'Ada Lovelace',
                        degree: 'Bachelor of Science in Computer Science',
                        credentialType: 'diploma',
                        issueDate: '2024-01-01',
                    },
                },
                issued_at: new Date().toISOString(),
                revoked: false,
                issuer_wallet_address: issuerWallet,
                student_wallet_address: studentWallet,
            },
        ],
    });

    await seedE2eState(page, state);
    await installE2eRoutes(page);

    await page.goto('/credentials/1');
    await expect(page.getByRole('heading', { name: 'Verified Academic Credential' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bachelor of Science in Computer Science' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Verify Credential' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'QR Code' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add to LinkedIn' })).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Download Verifiable Credential (.json)' }),
    ).toBeVisible();
});
