'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Award,
    Building2,
    Calendar,
    CheckCircle2,
    Download,
    Lock,
    QrCode,
    Share2,
    Shield,
    XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import QRCodeModal from './QRCodeModal';
import { buildStandardsExportDocument, downloadJsonFile, getLinkedInShareUrl } from '@/lib/standardsExport';
import { captureException } from '@/lib/debug';

export interface PublicCredentialCardData {
    tokenId: string;
    studentName: string;
    studentWallet?: string;
    institutionName: string;
    issuerWallet?: string;
    degree: string;
    credentialType: string;
    issueDate: string;
    issuedAt?: string;
    revoked?: boolean;
    revokedAt?: string | null;
    isPublic?: boolean;
    blockchainHash?: string;
    ipfsHash?: string;
    onChainHash?: string;
    metadataSchemaVersion?: number;
    hashAlgorithm?: string;
}

interface PublicCredentialCardProps {
    credential: PublicCredentialCardData;
}

export function PublicCredentialCard({ credential }: PublicCredentialCardProps) {
    const [qrOpen, setQrOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);

    if (credential.isPublic === false) {
        return (
            <Card className="mx-auto max-w-2xl p-8 text-center bg-card/90 backdrop-blur shadow-lg border-2">
                <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="rounded-full bg-secondary p-4">
                        <Lock className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground">Private Credential</h2>
                    <p className="text-muted-foreground">
                        This credential has been set to private by the credential holder.
                    </p>
                    <Button asChild variant="outline" className="mt-4">
                        <Link href="/verify">Verify another token</Link>
                    </Button>
                </div>
            </Card>
        );
    }

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/credentials/${credential.tokenId}` : '';
    const linkedInUrl = getLinkedInShareUrl({
        title: credential.degree,
        institutionName: credential.institutionName,
        issueDate: credential.issueDate,
        tokenId: credential.tokenId,
        certUrl: shareUrl,
    });

    const handleCopyLink = () => {
        if (!shareUrl) return;
        void navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadVc = async () => {
        setDownloading(true);
        try {
            const document = await buildStandardsExportDocument({
                tokenId: credential.tokenId,
                blockchainHash: credential.blockchainHash,
                onChainHash: credential.onChainHash,
                metadataSchemaVersion: credential.metadataSchemaVersion,
                hashAlgorithm: credential.hashAlgorithm,
                studentName: credential.studentName,
                studentWallet: credential.studentWallet,
                institutionName: credential.institutionName,
                issuerWallet: credential.issuerWallet,
                degree: credential.degree,
                credentialType: credential.credentialType,
                issueDate: credential.issueDate,
            });
            downloadJsonFile(document, `credential-${credential.tokenId}-verifiable-credential.json`);
        } catch (err) {
            captureException(err, { context: 'PublicCredentialCard_downloadVc' });
            alert('Failed to build the Verifiable Credential export. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-8 md:p-10 space-y-6 bg-card/90 backdrop-blur shadow-xl border-2">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
                    <div className="flex items-center space-x-3">
                        <div className="rounded-full bg-primary/10 p-3">
                            <Award className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">{credential.degree}</h1>
                            <p className="text-sm text-muted-foreground">{credential.institutionName}</p>
                        </div>
                    </div>
                    <div>
                        {credential.revoked ? (
                            <Badge variant="destructive" className="flex items-center gap-1">
                                <XCircle className="h-3.5 w-3.5" /> Revoked
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="flex items-center gap-1 text-success border-success/30 bg-success/10">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Blockchain Verified
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Grid Info */}
                <div className="grid md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-3">
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span>Issuing Institution:</span>
                        </div>
                        <p className="font-semibold text-foreground">{credential.institutionName}</p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span>Issue Date:</span>
                        </div>
                        <p className="font-semibold text-foreground">{credential.issueDate}</p>
                    </div>
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
                    <Button asChild variant="default" size="sm">
                        <Link href={`/verify?token=${credential.tokenId}`}>
                            <Shield className="mr-2 h-4 w-4" /> Verify Credential
                        </Link>
                    </Button>

                    <Button onClick={() => setQrOpen(true)} variant="outline" size="sm">
                        <QrCode className="mr-2 h-4 w-4" /> QR Code
                    </Button>

                    <Button asChild variant="outline" size="sm">
                        <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
                            <Share2 className="mr-2 h-4 w-4" /> Add to LinkedIn
                        </a>
                    </Button>

                    <Button onClick={handleCopyLink} variant="secondary" size="sm">
                        <Share2 className="mr-2 h-4 w-4" /> {copied ? 'Copied Link!' : 'Copy Share Link'}
                    </Button>

                    <Button onClick={handleDownloadVc} variant="outline" size="sm" disabled={downloading}>
                        <Download className="mr-2 h-4 w-4" />
                        {downloading ? 'Preparing...' : 'Download Verifiable Credential (.json)'}
                    </Button>
                </div>
            </Card>

            <QRCodeModal
                open={qrOpen}
                onClose={() => setQrOpen(false)}
                credential={{
                    token_id: credential.tokenId,
                    blockchain_hash: credential.blockchainHash || '',
                    ipfs_hash: credential.ipfsHash || '',
                    metadata: {
                        credentialData: {
                            credentialType: credential.credentialType,
                            institutionName: credential.institutionName,
                        },
                    },
                    student_wallet_address: credential.studentWallet,
                }}
            />
        </div>
    );
}
