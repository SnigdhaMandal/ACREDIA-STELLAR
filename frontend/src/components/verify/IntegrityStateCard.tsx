import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

export type IntegrityStatus = 'match' | 'mismatch' | 'unavailable';

interface IntegrityStateCardProps {
    status: IntegrityStatus;
}

/**
 * Surfaces the end-to-end CID ↔ on-chain-hash integrity result as its own,
 * explicit state — deliberately separate from `VerificationStateCard`
 * (valid/invalid/revoked). A credential can be a currently-authorized,
 * non-revoked, on-chain match and *still* have its IPFS-hosted document
 * fail this check if the pinned content was altered or is unreachable, so
 * this is never folded into the main status card. See ACREDIA-STELLAR#163.
 */
export function IntegrityStateCard({ status }: IntegrityStateCardProps) {
    const config = {
        match: {
            icon: CheckCircle2,
            iconClassName: 'text-success',
            wrapperClassName: 'border-success/25 bg-success/10',
            title: 'Document Integrity: Authentic',
            description:
                'The credential document was fetched from IPFS and its content hash exactly matches the hash recorded on-chain. Nothing about this document has been altered since issuance.',
        },
        mismatch: {
            icon: AlertTriangle,
            iconClassName: 'text-destructive',
            wrapperClassName: 'border-destructive/25 bg-destructive/10',
            title: 'Document Integrity: Failed',
            description:
                'The document retrieved from the on-chain IPFS CID does not match the hash recorded on-chain. Do not rely on the details below — this document may have been tampered with or corrupted, independent of its revocation status.',
        },
        unavailable: {
            icon: HelpCircle,
            iconClassName: 'text-muted-foreground',
            wrapperClassName: 'border-border bg-secondary/40',
            title: 'Document Integrity: Unavailable',
            description:
                'The IPFS-hosted document could not be retrieved right now, so its content could not be independently checked against the on-chain hash. This does not mean the credential is invalid — please try again shortly.',
        },
    } as const;

    const current = config[status];
    const Icon = current.icon;

    return (
        <div
            className={`rounded-2xl border p-6 shadow-sm ${current.wrapperClassName}`}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-start gap-3">
                <div className="rounded-full bg-white/80 p-2">
                    <Icon className={`h-6 w-6 ${current.iconClassName}`} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">{current.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{current.description}</p>
                </div>
            </div>
        </div>
    );
}
