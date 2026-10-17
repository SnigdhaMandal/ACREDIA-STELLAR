import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * The signing seam (ACREDIA-STELLAR#3).
 *
 * `contracts.ts` builds, simulates and submits Soroban transactions. Who holds
 * the key is a different concern, and welding the two together cost three
 * things:
 *
 *  - `invokeContractMethod` could not be unit-tested without stubbing a
 *    browser extension, so `contracts.test.ts` could only reach the pure
 *    helpers around it.
 *  - The E2E path worked around it with a `getE2eState()` branch inside every
 *    exported function — six early returns that re-implemented authorization
 *    checks and token-id sequencing purely to avoid reaching a signer.
 *  - Server-side signing (a keeper, a relayer, an institution's backend) was
 *    impossible without editing the module.
 *
 * A signer is the whole dependency: an address, and the ability to sign. Note
 * what is *not* here — no connect, no disconnect, no wallet metadata. Those
 * belong to the wallet layer (`src/lib/wallet/`); a signer is what you hand to
 * something that needs a signature.
 */
export interface StellarSigner {
    /** The Stellar account this signer signs for; also the transaction source. */
    readonly address: string;

    /** Signs a base64 transaction XDR and returns the signed XDR. */
    signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<string>;

    /**
     * Signs a UTF-8 message, returning a base64 signature.
     *
     * Optional because not every signer can: Albedo and Rabet reject message
     * signing outright (see `src/lib/wallet/capabilities.ts`). Callers that
     * need it must check for the method before calling.
     *
     * Takes the network passphrase for the same reason `signTransaction` does —
     * wallets use it to confirm which ledger they are signing against, and a
     * signer that assumed its own would be how a signature ends up bound to
     * the wrong network.
     */
    signMessage?(message: string, opts: { networkPassphrase: string }): Promise<string>;
}

/**
 * A signer backed by a raw Stellar keypair.
 *
 * This is what makes `invokeContractMethod` testable without a browser, and
 * what a server-side keeper or relayer would use. It signs locally — no
 * prompt, no extension, no network.
 *
 * Never construct one of these from a user's secret in the browser. It exists
 * for tests and for server contexts where the process legitimately holds a
 * key.
 */
export function createKeypairSigner(keypair: Keypair): StellarSigner {
    return {
        address: keypair.publicKey(),

        async signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<string> {
            const transaction = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
            transaction.sign(keypair);
            return transaction.toXDR();
        },

        async signMessage(message: string): Promise<string> {
            // `Keypair.sign` returns a plain Uint8Array since stellar-sdk 17, whose
            // toString ignores the encoding and yields "12,34,…" — wrap it first.
            return Buffer.from(keypair.sign(Buffer.from(message, 'utf8'))).toString('base64');
        },
    };
}

/**
 * A signer that refuses to sign.
 *
 * For contexts that must name an address but have no key — a server route
 * doing read-only simulation, say. Reaching a signature from one of these is a
 * bug in the caller, so it fails loudly rather than returning something
 * plausible.
 */
export function createReadOnlySigner(address: string): StellarSigner {
    return {
        address,
        async signTransaction(): Promise<string> {
            throw new Error(
                `No signing key is available for ${address}. This context can read from the ` +
                    'ledger but cannot submit transactions.',
            );
        },
    };
}
