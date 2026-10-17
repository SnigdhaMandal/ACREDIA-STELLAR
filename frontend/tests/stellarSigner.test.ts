import { Account, Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
    createKeypairSigner,
    createReadOnlySigner,
    type StellarSigner,
} from '../src/lib/stellarSigner';
import { verifyWalletSignature } from '../src/lib/walletOwnership';

/**
 * The signing seam itself (ACREDIA-STELLAR#3).
 *
 * The keypair signer is what makes `contracts.ts` testable without a browser,
 * so it is worth proving it produces signatures the network would actually
 * accept — not merely that it returns a string.
 */

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/** A minimal, valid transaction to sign. */
function unsignedXdr(source: Keypair): string {
    const account = new Account(source.publicKey(), '1');
    return new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(
            Operation.payment({
                destination: Keypair.random().publicKey(),
                asset: Asset.native(),
                amount: '1',
            }),
        )
        .setTimeout(300)
        .build()
        .toXDR();
}

describe('createKeypairSigner', () => {
    it('reports the keypair’s public key as its address', () => {
        const keypair = Keypair.random();
        expect(createKeypairSigner(keypair).address).toBe(keypair.publicKey());
    });

    it('produces a signature the network would accept', async () => {
        const keypair = Keypair.random();
        const signer = createKeypairSigner(keypair);

        const signedXdr = await signer.signTransaction(unsignedXdr(keypair), {
            networkPassphrase: NETWORK_PASSPHRASE,
        });

        // Re-parse and verify against the public key, rather than just
        // asserting a signature exists: a signer that attached the wrong
        // signature would still return a plausible XDR string.
        const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
        expect(signed.signatures).toHaveLength(1);

        const hash = signed.hash();
        expect(keypair.verify(hash, signed.signatures[0].signature.value)).toBe(true);
    });

    it('signs for the network it is told, not one it assumed', async () => {
        const keypair = Keypair.random();
        const signer = createKeypairSigner(keypair);
        const xdr = unsignedXdr(keypair);

        const onTestnet = await signer.signTransaction(xdr, {
            networkPassphrase: NETWORK_PASSPHRASE,
        });
        const onPublic = await signer.signTransaction(xdr, {
            networkPassphrase: 'Public Global Stellar Network ; September 2015',
        });

        // A Stellar signature covers the network id, so the same transaction
        // signed for two networks yields two different signatures. If these
        // matched, the signer would be ignoring the passphrase — the bug that
        // gets a transaction signed against the wrong ledger.
        const sigOf = (value: string, passphrase: string) =>
            Buffer.from(
                TransactionBuilder.fromXDR(value, passphrase).signatures[0].signature.value,
            ).toString('hex');

        expect(sigOf(onTestnet, NETWORK_PASSPHRASE)).not.toBe(
            sigOf(onPublic, 'Public Global Stellar Network ; September 2015'),
        );
    });

    it('signs messages in the encoding the claim flow verifies', async () => {
        const keypair = Keypair.random();
        const signer = createKeypairSigner(keypair);
        const message = 'Acredia — prove wallet ownership';

        const signature = await signer.signMessage!(message, {
            networkPassphrase: NETWORK_PASSPHRASE,
        });

        // Checked against the real server-side verifier, so signer and
        // verifier cannot drift apart on encoding.
        expect(verifyWalletSignature(keypair.publicKey(), message, signature)).toBe(true);
    });
});

describe('createReadOnlySigner', () => {
    it('carries an address for simulation', () => {
        const address = Keypair.random().publicKey();
        expect(createReadOnlySigner(address).address).toBe(address);
    });

    it('refuses to sign instead of returning something plausible', async () => {
        const signer = createReadOnlySigner(Keypair.random().publicKey());

        // Failing loudly matters here: a read-only context that silently
        // produced an unsigned transaction would submit it and fail on-chain,
        // which is far harder to diagnose.
        await expect(
            signer.signTransaction('AAAA', { networkPassphrase: NETWORK_PASSPHRASE }),
        ).rejects.toThrow(/cannot submit transactions/i);
    });

    it('omits signMessage rather than offering one that throws', () => {
        const signer: StellarSigner = createReadOnlySigner(Keypair.random().publicKey());

        // `signMessage` is optional on the interface so callers can check for
        // it. A method that always throws would make that check useless.
        expect(signer.signMessage).toBeUndefined();
    });
});
