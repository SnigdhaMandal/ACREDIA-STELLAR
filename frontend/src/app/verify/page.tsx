'use client';

import { Suspense } from 'react';
import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    CheckCircle,
    XCircle,
    AlertCircle,
    ExternalLink,
    Shield,
    Calendar,
    User,
    Building2,
    FileText,
    Hash,
    Home,
    Camera,
    ScanLine,
    RotateCcw,
    Award,
    Lock,
} from 'lucide-react';
import Link from 'next/link';
import { VerificationStateCard } from '@/components/verify/VerificationStateCard';
import { VerificationSummary } from '@/components/verify/VerificationSummary';
import { IntegrityStateCard } from '@/components/verify/IntegrityStateCard';
import { useCredentialVerification } from '@/hooks/useCredentialVerification';
import { SiteNavbar } from '@/components/marketing/SiteNavbar';

const QR_READER_ID = 'credential-qr-reader';

function VerifyContent() {
    const searchParams = useSearchParams();
    const tokenId = searchParams.get('token');
    const {
        loading,
        credential,
        error,
        verificationStatus,
        integrityStatus,
        manualToken,
        setManualToken,
        scanMode,
        scanState,
        scanMessage,
        handleManualVerify,
        startScanner,
        setScanMode,
    } = useCredentialVerification(tokenId);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const getIPFSUrl = (hash?: string | null) => {
        if (!hash) return '#';
        if (hash.startsWith('http')) return hash;
        return `https://ipfs.io/ipfs/${hash}`;
    };

    // Show manual entry form if no token provided
    if (!tokenId && !loading && !credential) {
        return (
            <div className="min-h-screen bg-secondary/30">
                <SiteNavbar />

                {/* Hero Section */}
                <div className="container mx-auto px-4 py-12">
                    <div className="max-w-4xl mx-auto">
                        {/* Info Cards */}
                        <div className="grid md:grid-cols-3 gap-4 mb-8">
                            <Card className="p-4 bg-card/80 backdrop-blur border-primary/20">
                                <div className="flex items-center space-x-3">
                                    <div className="rounded-full bg-primary/10 p-3">
                                        <Shield className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground">
                                            Blockchain Secured
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            Tamper-proof verification
                                        </p>
                                    </div>
                                </div>
                            </Card>
                            <Card className="p-4 bg-card/80 backdrop-blur border-primary/20">
                                <div className="flex items-center space-x-3">
                                    <div className="rounded-full bg-primary/10 p-3">
                                        <Award className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground">
                                            Instant Verification
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            Real-time credential check
                                        </p>
                                    </div>
                                </div>
                            </Card>
                            <Card className="p-4 bg-card/80 backdrop-blur border-primary/20">
                                <div className="flex items-center space-x-3">
                                    <div className="rounded-full bg-primary/10 p-3">
                                        <Lock className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground">
                                            Privacy Protected
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            Secure credential data
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Main Verification Card */}
                        <Card className="p-8 md:p-12 bg-card/90 backdrop-blur shadow-xl">
                            <div className="flex flex-col items-center space-y-6">
                                <div className="rounded-full bg-primary/10 p-8">
                                    <Shield className="h-20 w-20 text-primary" />
                                </div>
                                <div className="text-center space-y-3">
                                    <h1 className="text-4xl font-bold text-foreground">
                                        Verify Academic Credential
                                    </h1>
                                    <p className="text-lg text-muted-foreground max-w-2xl">
                                        Enter a credential token ID to instantly verify its
                                        authenticity on the blockchain
                                    </p>
                                </div>

                                <div className="w-full max-w-md space-y-4">
                                    <div>
                                        <label
                                            htmlFor="manual-token"
                                            className="block text-sm font-semibold text-foreground mb-2"
                                        >
                                            Credential Token ID
                                        </label>
                                        <input
                                            id="manual-token"
                                            type="text"
                                            value={manualToken}
                                            onChange={(e) => setManualToken(e.target.value)}
                                            onKeyDown={(e) =>
                                                e.key === 'Enter' && handleManualVerify()
                                            }
                                            placeholder="Enter token ID (e.g., 1, 2, 3...)"
                                            className="w-full px-4 py-3 border-2 border-border rounded-lg focus:ring-2 focus:ring-ring/25 focus:border-ring transition-all"
                                        />
                                        <p className="text-xs text-muted-foreground mt-2">
                                            💡 The token ID can be found on the credential or in the
                                            QR code
                                        </p>
                                    </div>
                                    <Button
                                        onClick={handleManualVerify}
                                        disabled={!manualToken.trim()}
                                        className="w-full py-6 text-lg font-semibold"
                                    >
                                        <Shield className="h-5 w-5 mr-2" />
                                        Verify Credential
                                    </Button>
                                </div>

                                <div className="mt-8 text-center space-y-4">
                                    <div className="flex items-center justify-center space-x-2">
                                        <div className="h-px bg-border w-20"></div>
                                        <p className="text-sm text-muted-foreground font-medium">OR</p>
                                        <div className="h-px bg-border w-20"></div>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        📱 Scan a QR code to verify automatically
                                    </p>
                                </div>

                                <div className="w-full max-w-xl rounded-xl border border-primary/20 bg-primary/10/60 p-3 sm:p-4">
                                    {!scanMode ? (
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-start gap-3">
                                                <div className="rounded-full bg-card p-3 text-primary shadow-sm">
                                                    <Camera className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-foreground">
                                                        Camera QR scan
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Camera permission is requested only when you
                                                        start scanning.
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                onClick={startScanner}
                                                className="w-full sm:w-auto"
                                            >
                                                <ScanLine className="mr-2 h-4 w-4" />
                                                Start Scan
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-foreground">
                                                        Scan credential QR
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {scanMessage}
                                                    </p>
                                                </div>
                                                <Button
                                                    onClick={() => setScanMode(false)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="shrink-0"
                                                >
                                                    Stop
                                                </Button>
                                            </div>

                                            <div className="relative overflow-hidden rounded-lg border border-border bg-foreground">
                                                <div
                                                    id={QR_READER_ID}
                                                    className="min-h-[280px] w-full sm:min-h-[340px]"
                                                />
                                                {(scanState === 'requesting' ||
                                                    scanState === 'scanning') && (
                                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                        <div className="h-52 w-52 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
                                                    </div>
                                                )}
                                                {scanState === 'requesting' && (
                                                    <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-sm font-medium text-white">
                                                        Requesting camera access...
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                className={`rounded-lg border px-4 py-3 text-sm ${
                                                    scanState === 'permission-denied' ||
                                                    scanState === 'no-camera' ||
                                                    scanState === 'invalid' ||
                                                    scanState === 'unsupported' ||
                                                    scanState === 'error'
                                                        ? 'border-destructive/25 bg-destructive/10 text-destructive'
                                                        : scanState === 'success'
                                                          ? 'border-success/25 bg-success/10 text-success'
                                                          : 'border-primary/20 bg-card text-foreground'
                                                }`}
                                                role="status"
                                                aria-live="polite"
                                                aria-atomic="true"
                                            >
                                                <div className="flex items-start gap-2">
                                                    {scanState === 'success' ? (
                                                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                                    ) : scanState === 'permission-denied' ||
                                                      scanState === 'no-camera' ||
                                                      scanState === 'invalid' ||
                                                      scanState === 'unsupported' ||
                                                      scanState === 'error' ? (
                                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                                    ) : (
                                                        <ScanLine className="mt-0.5 h-4 w-4 shrink-0" />
                                                    )}
                                                    <span>{scanMessage}</span>
                                                </div>
                                            </div>

                                            {(scanState === 'permission-denied' ||
                                                scanState === 'no-camera' ||
                                                scanState === 'invalid' ||
                                                scanState === 'unsupported' ||
                                                scanState === 'error') && (
                                                <Button
                                                    onClick={startScanner}
                                                    variant="outline"
                                                    className="w-full"
                                                >
                                                    <RotateCcw className="mr-2 h-4 w-4" />
                                                    Try Scanner Again
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>

                        {/* How It Works Section */}
                        <div className="mt-12 grid md:grid-cols-3 gap-6">
                            <Card className="p-6 bg-card/80 backdrop-blur text-center">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl mb-4">
                                    1
                                </div>
                                <h3 className="font-bold text-foreground mb-2">Enter Token ID</h3>
                                <p className="text-sm text-muted-foreground">
                                    Input the credential token ID or scan the QR code
                                </p>
                            </Card>
                            <Card className="p-6 bg-card/80 backdrop-blur text-center">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl mb-4">
                                    2
                                </div>
                                <h3 className="font-bold text-foreground mb-2">
                                    Blockchain Verification
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    System checks the credential against blockchain records
                                </p>
                            </Card>
                            <Card className="p-6 bg-card/80 backdrop-blur text-center">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl mb-4">
                                    3
                                </div>
                                <h3 className="font-bold text-foreground mb-2">View Results</h3>
                                <p className="text-sm text-muted-foreground">
                                    Instantly see verification status and credential details
                                </p>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-secondary/30">
                <SiteNavbar />

                <div className="flex items-center justify-center p-4 min-h-[calc(100vh-80px)]">
                    <Card className="w-full max-w-2xl p-8 space-y-8">
                        <div className="flex flex-col items-center space-y-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                        <div className="space-y-6 pt-6 border-t border-border">
                            <div className="flex items-start space-x-4">
                                <Skeleton className="h-12 w-12 rounded-full" />
                                <div className="space-y-2 flex-1">
                                    <Skeleton className="h-5 w-1/3" />
                                    <Skeleton className="h-4 w-1/4" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Skeleton className="h-24 w-full rounded-lg" />
                                <Skeleton className="h-24 w-full rounded-lg" />
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    if (error || !credential) {
        return (
            <div className="min-h-screen bg-secondary/30">
                <SiteNavbar />

                <div className="flex items-center justify-center p-4 min-h-[calc(100vh-80px)]">
                    <Card className="w-full max-w-2xl p-8">
                        <div className="flex flex-col items-center justify-center space-y-6">
                            <div className="rounded-full bg-destructive/10 p-6">
                                <XCircle className="h-20 w-20 text-destructive" />
                            </div>
                            <div className="text-center space-y-2">
                                <h1 className="text-3xl font-bold text-foreground">
                                    Verification Failed
                                </h1>
                                <p className="text-lg text-muted-foreground">
                                    {error || 'Credential not found'}
                                </p>
                                <p className="text-sm text-muted-foreground mt-4">
                                    The credential token ID may be invalid or the credential does
                                    not exist in our system.
                                </p>
                            </div>
                            <div className="flex w-full flex-col sm:w-auto sm:flex-row gap-3 sm:space-x-4">
                                <Link href="/verify">
                                    <Button className="w-full sm:w-auto">
                                        Try Again
                                    </Button>
                                </Link>
                                <Link href="/">
                                    <Button variant="outline" className="w-full sm:w-auto">
                                        Return to Home
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-secondary/30">
            <SiteNavbar />

            <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-5xl mx-auto space-y-6">
                    {/* Header with Timestamp */}
                    <div className="text-center space-y-3">
                        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                            Credential Verification Report
                        </h1>
                        <p className="text-muted-foreground">Blockchain-verified academic credential</p>
                        <p className="text-sm text-muted-foreground">
                            Verified on:{' '}
                            {new Date().toLocaleString('en-US', {
                                dateStyle: 'full',
                                timeStyle: 'short',
                            })}
                        </p>
                    </div>

                    {/* Verification Status */}
                    <Card className="p-8 md:p-12 bg-card/90 backdrop-blur shadow-xl border-2">
                        <div className="flex flex-col items-center justify-center space-y-6">
                            {verificationStatus === 'valid' && (
                                <>
                                    <VerificationStateCard
                                        status="valid"
                                        title="Credential Verified ✓"
                                        description="This credential is authentic, valid, and secured on the blockchain"
                                    />
                                    <VerificationSummary status={verificationStatus} />
                                </>
                            )}

                            {verificationStatus === 'revoked' && (
                                <>
                                    <VerificationStateCard
                                        status="revoked"
                                        title="Credential Revoked"
                                        description="This credential has been revoked by the issuing institution"
                                    />
                                    {credential.revoked_at && (
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Revoked on: {formatDate(credential.revoked_at)}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </Card>

                    {/* Document Integrity (CID ↔ on-chain hash) — a distinct
                        signal from the revoked/not-found status above: it
                        proves the document actually fetched from IPFS is the
                        same bytes anchored on-chain. */}
                    {integrityStatus && (
                        <IntegrityStateCard status={integrityStatus} />
                    )}

                    {/* Credential Details */}
                    <Card className="p-8 md:p-10 space-y-6 bg-card/90 backdrop-blur shadow-lg">
                        <div className="flex items-center justify-between border-b pb-4">
                            <h3 className="text-2xl font-bold text-foreground">
                                Credential Information
                            </h3>
                            <Badge variant="outline" className="text-sm">
                                Token #{credential.token_id}
                            </Badge>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Student Information */}
                            <div className="space-y-4">
                                <div className="flex items-start space-x-3">
                                    <User className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Student Name
                                        </p>
                                        <p className="text-base font-semibold text-foreground">
                                            {credential.metadata?.credentialData?.studentName ||
                                                'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {credential.student_wallet_address && (
                                    <div className="flex items-start space-x-3">
                                        <Hash className="h-5 w-5 text-primary mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Student Wallet
                                            </p>
                                            <p className="text-xs font-mono text-foreground break-all">
                                                {credential.student_wallet_address}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Institution Information */}
                            <div className="space-y-4">
                                <div className="flex items-start space-x-3">
                                    <Building2 className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Issuing Institution
                                        </p>
                                        <p className="text-base font-semibold text-foreground">
                                            {credential.institution?.name ||
                                                credential.metadata?.credentialData
                                                    ?.institutionName ||
                                                'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {credential.issuer_wallet_address && (
                                    <div className="flex items-start space-x-3">
                                        <Hash className="h-5 w-5 text-primary mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Issuer Wallet
                                            </p>
                                            <p className="text-xs font-mono text-foreground break-all">
                                                {credential.issuer_wallet_address}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-start space-x-3">
                                    <Shield className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Issuer Authorization
                                        </p>
                                        <p className="text-base font-semibold text-foreground">
                                            {credential.issuer_authorized === false
                                                ? 'No'
                                                : credential.issuer_authorized === true
                                                  ? 'Yes'
                                                  : 'Unknown'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {credential.issuer_authorized === false
                                                ? 'This credential was issued by an institution that is no longer authorized to issue new credentials.'
                                                : credential.issuer_authorized === true
                                                  ? 'This credential remains valid and its issuer is currently authorized.'
                                                  : 'Issuer authorization status could not be determined.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Credential Type & Details */}
                            <div className="space-y-4">
                                <div className="flex items-start space-x-3">
                                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Credential Type
                                        </p>
                                        <p className="text-base font-semibold text-foreground">
                                            {credential.metadata?.credentialData?.credentialType ||
                                                'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {credential.metadata?.credentialData?.degree && (
                                    <div className="flex items-start space-x-3">
                                        <FileText className="h-5 w-5 text-primary mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Degree
                                            </p>
                                            <p className="text-base font-semibold text-foreground">
                                                {credential.metadata.credentialData.degree}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {credential.metadata?.credentialData?.major && (
                                    <div className="flex items-start space-x-3">
                                        <FileText className="h-5 w-5 text-primary mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Major
                                            </p>
                                            <p className="text-base text-foreground">
                                                {credential.metadata.credentialData.major}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {credential.metadata?.credentialData?.gpa && (
                                    <div className="flex items-start space-x-3">
                                        <FileText className="h-5 w-5 text-primary mt-0.5" />
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">GPA</p>
                                            <p className="text-base text-foreground">
                                                {credential.metadata.credentialData.gpa}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Issue Date */}
                            <div className="space-y-4">
                                <div className="flex items-start space-x-3">
                                    <Calendar className="h-5 w-5 text-warning mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Issue Date
                                        </p>
                                        <p className="text-base font-semibold text-foreground">
                                            {credential.metadata?.credentialData?.issueDate
                                                ? formatDate(
                                                      credential.metadata.credentialData.issueDate,
                                                  )
                                                : formatDate(credential.issued_at)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Subject-wise Marks */}
                    {credential.metadata?.credentialData?.subjects &&
                        credential.metadata.credentialData.subjects.length > 0 && (
                            <Card className="p-8 md:p-10 space-y-6 bg-card/90 backdrop-blur shadow-lg border-l-4 border-primary">
                                <div className="flex items-center space-x-3 border-b pb-4">
                                    <div className="rounded-lg bg-primary/10 p-2">
                                        <FileText className="h-6 w-6 text-primary" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-foreground">
                                        Subject-wise Performance
                                    </h3>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b-2 border-border">
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">
                                                    Subject
                                                </th>
                                                <th className="text-center py-3 px-4 text-sm font-semibold text-foreground">
                                                    Marks Obtained
                                                </th>
                                                <th className="text-center py-3 px-4 text-sm font-semibold text-foreground">
                                                    Max Marks
                                                </th>
                                                <th className="text-center py-3 px-4 text-sm font-semibold text-foreground">
                                                    Percentage
                                                </th>
                                                {credential.metadata?.credentialData?.subjects?.some(
                                                    (s: { grade?: string }) => s.grade,
                                                ) && (
                                                    <th className="text-center py-3 px-4 text-sm font-semibold text-foreground">
                                                        Grade
                                                    </th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {credential.metadata?.credentialData?.subjects?.map(
                                                (subject: { name?: string; marks?: string; maxMarks?: string; grade?: string }, index: number) => {
                                                    const percentage =
                                                        subject.marks && subject.maxMarks
                                                            ? (
                                                                  (parseFloat(subject.marks) /
                                                                      parseFloat(
                                                                          subject.maxMarks,
                                                                      )) *
                                                                  100
                                                              ).toFixed(2)
                                                            : 'N/A';
                                                    return (
                                                        <tr
                                                            key={index}
                                                            className="border-b border-border hover:bg-secondary/50"
                                                        >
                                                            <td className="py-3 px-4 font-medium text-foreground">
                                                                {subject.name}
                                                            </td>
                                                            <td className="text-center py-3 px-4 text-foreground">
                                                                {subject.marks}
                                                            </td>
                                                            <td className="text-center py-3 px-4 text-foreground">
                                                                {subject.maxMarks}
                                                            </td>
                                                            <td className="text-center py-3 px-4">
                                                                <span
                                                                    className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                                                                        parseFloat(percentage) >= 75
                                                                            ? 'bg-success/10 text-success'
                                                                            : parseFloat(
                                                                                    percentage,
                                                                                ) >= 60
                                                                              ? 'bg-primary/10 text-primary'
                                                                              : parseFloat(
                                                                                      percentage,
                                                                                  ) >= 40
                                                                                ? 'bg-warning/10 text-warning'
                                                                                : 'bg-destructive/10 text-destructive'
                                                                    }`}
                                                                >
                                                                    {percentage}%
                                                                </span>
                                                            </td>
                                                            {credential.metadata?.credentialData?.subjects?.some(
                                                                (s: { grade?: string }) => s.grade,
                                                            ) && (
                                                                <td className="text-center py-3 px-4">
                                                                    <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-primary/10 text-primary">
                                                                        {subject.grade || '-'}
                                                                    </span>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                },
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Summary Stats */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                    <div className="bg-primary/10 p-4 rounded-lg text-center">
                                        <p className="text-sm text-muted-foreground mb-1">Total Subjects</p>
                                        <p className="text-2xl font-bold text-primary">
                                            {credential.metadata?.credentialData?.subjects
                                                ?.length || 0}
                                        </p>
                                    </div>
                                    <div className="bg-success/10 p-4 rounded-lg text-center">
                                        <p className="text-sm text-muted-foreground mb-1">
                                            Average Percentage
                                        </p>
                                        <p className="text-2xl font-bold text-success">
                                            {(() => {
                                                const validSubjects = (
                                                    credential.metadata?.credentialData?.subjects ||
                                                    []
                                                ).filter((s: { marks?: string; maxMarks?: string; }) => s.marks && s.maxMarks);
                                                if (validSubjects.length === 0) return 'N/A';
                                                const total = validSubjects.reduce(
                                                    (acc: number, s: { marks?: string; maxMarks?: string; }) => {
                                                        return (
                                                            acc +
                                                            ((s.marks ? parseFloat(s.marks) : 0) /
                                                                (s.maxMarks ? parseFloat(s.maxMarks) : 1)) *
                                                                100
                                                        );
                                                    },
                                                    0,
                                                );
                                                return (
                                                    (total / validSubjects.length).toFixed(2) + '%'
                                                );
                                            })()}
                                        </p>
                                    </div>
                                    <div className="bg-primary/10 p-4 rounded-lg text-center">
                                        <p className="text-sm text-muted-foreground mb-1">Total Marks</p>
                                        <p className="text-2xl font-bold text-primary">
                                            {(
                                                credential.metadata?.credentialData?.subjects || []
                                            ).reduce(
                                                (acc: number, s: { marks?: string; maxMarks?: string; }) =>
                                                    acc + (s.marks ? parseFloat(s.marks) || 0 : 0),
                                                0,
                                            )}{' '}
                                            /{' '}
                                            {(
                                                credential.metadata?.credentialData?.subjects || []
                                            ).reduce(
                                                (acc: number, s: { marks?: string; maxMarks?: string; }) =>
                                                    acc + (s.maxMarks ? parseFloat(s.maxMarks) || 0 : 0),
                                                0,
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        )}

                    {/* Blockchain Details */}
                    <Card className="p-8 md:p-10 space-y-6 bg-card/90 backdrop-blur shadow-lg border-l-4 border-primary">
                        <div className="flex items-center space-x-3 border-b pb-4">
                            <div className="rounded-lg bg-primary/10 p-2">
                                <Shield className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-2xl font-bold text-foreground">
                                Blockchain Verification
                            </h3>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-primary/10 p-4 rounded-lg">
                                <p className="text-sm font-medium text-primary mb-2">Token ID</p>
                                <p className="text-lg font-mono font-bold text-primary">
                                    #{credential.token_id}
                                </p>
                            </div>

                            {credential.blockchain_hash && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-semibold text-foreground">
                                            Transaction Hash
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                            Stellar Testnet
                                        </Badge>
                                    </div>
                                    <div className="flex items-center space-x-2 bg-secondary/50 p-4 rounded-lg border border-border">
                                        <p className="text-sm font-mono text-foreground break-all flex-1">
                                            {credential.blockchain_hash}
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            asChild
                                        >
                                            <a
                                                href={`https://stellar.expert/explorer/testnet/tx/${credential.blockchain_hash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="h-4 w-4 mr-1" />
                                                View
                                            </a>
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {credential.ipfs_hash && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-semibold text-foreground">
                                            IPFS Content Hash
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                            Decentralized Storage
                                        </Badge>
                                    </div>
                                    <div className="flex items-center space-x-2 bg-secondary/50 p-4 rounded-lg border border-border">
                                        <p className="text-sm font-mono text-foreground break-all flex-1">
                                            {credential.ipfs_hash}
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            asChild
                                        >
                                            <a
                                                href={getIPFSUrl(credential.ipfs_hash)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="h-4 w-4 mr-1" />
                                                View
                                            </a>
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="bg-secondary/40 p-4 rounded-lg border border-border">
                                <p className="text-sm text-foreground flex items-start">
                                    <Shield className="h-5 w-5 text-primary mr-2 mt-0.5 shrink-0" />
                                    <span>
                                        <strong>Blockchain Security:</strong> This credential is
                                        permanently recorded on the Stellar testnet blockchain and
                                        stored on IPFS, ensuring it cannot be altered, forged, or
                                        tampered with.
                                    </span>
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Actions */}
                    <div className="flex justify-center space-x-4 pb-8">
                        <Link href="/verify">
                            <Button>
                                <Shield className="h-4 w-4 mr-2" />
                                Verify Another
                            </Button>
                        </Link>
                        <Link href="/">
                            <Button variant="outline">
                                <Home className="h-4 w-4 mr-2" />
                                Return to Home
                            </Button>
                        </Link>
                        <Button onClick={() => window.print()} variant="outline">
                            Print Report
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense
            fallback={
                <RouteStateScreen
                    title="Loading verification"
                    description="Preparing the credential verification experience..."
                    variant="loading"
                />
            }
        >
            <VerifyContent />
        </Suspense>
    );
}
