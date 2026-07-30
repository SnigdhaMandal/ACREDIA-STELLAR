'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Settings, ShieldOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';
import { signOut, safeGetSession } from '@/lib/supabase';
import Link from 'next/link';
import { ApiKeysManager } from './ApiKeysManager';

/**
 * Dashboard Settings page — /dashboard/settings
 *
 * Provides the GDPR Art. 17 "Delete My Account" feature (right to erasure).
 * The deletion flow:
 *   1. User reads the warning about on-chain immutability.
 *   2. User types "DELETE" to confirm intent.
 *   3. Client POSTs /api/account/erase with the current bearer token.
 *   4. On 204, the client signs out and redirects to the home page.
 */
function SettingsContent() {
    const { user, signOut: ctxSignOut } = useAuth();
    const router = useRouter();

    // Confirmation dialog state
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    const handleDeleteAccount = async () => {
        if (confirmText !== 'DELETE') return;

        setDeleting(true);
        try {
            const { data } = await safeGetSession();
            const token = data.session?.access_token;

            if (!token) {
                toast.error('Session expired. Please sign in again.');
                setDeleting(false);
                return;
            }

            const response = await fetch('/api/account/erase', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.status === 204) {
                toast.success('Your account has been deleted. Redirecting…');
                // Sign out locally — auth user is already deleted server-side.
                await ctxSignOut();
                router.push('/');
            } else {
                const body = await response.json().catch(() => ({}));
                toast.error(body?.error ?? 'Account deletion failed. Please contact support.');
                setDeleting(false);
            }
        } catch {
            toast.error('An unexpected error occurred. Please try again or contact support.');
            setDeleting(false);
        }
    };

    return (
        <DashboardShell
            title="Account Settings"
            subtitle="Manage your account preferences and data rights."
            icon={
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Settings className="h-5 w-5" />
                </span>
            }
            onSignOut={handleSignOut}
        >
            <div className="mx-auto max-w-2xl space-y-8">

                {/* Account info */}
                <Card className="p-6">
                    <h2 className="text-lg font-semibold text-foreground">Account information</h2>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="font-medium text-foreground">{user?.email ?? '—'}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">User ID</dt>
                            <dd className="font-mono text-xs text-muted-foreground">{user?.id ?? '—'}</dd>
                        </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-3 text-sm">
                        <Link href="/legal/privacy" className="text-primary underline hover:text-primary/80">
                            Privacy Policy
                        </Link>
                        <Link href="/legal/terms" className="text-primary underline hover:text-primary/80">
                            Terms of Service
                        </Link>
                        <Link href="/legal/dpa" className="text-primary underline hover:text-primary/80">
                            Data Processing Agreement
                        </Link>
                    </div>
                </Card>

                {/* API Keys (for institutions) */}
                {user?.user_metadata?.role === 'institution' && (
                    <ApiKeysManager />
                )}

                {/* Danger zone — delete account */}
                <Card className="border-destructive/30 p-6">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                            <ShieldOff className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Delete my account</h2>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                Permanently remove your personal data from Acredia in accordance with GDPR
                                Art. 17 (right to erasure).
                            </p>
                        </div>
                    </div>

                    {/* What gets deleted */}
                    <div className="mt-5 rounded-lg bg-secondary/50 p-4 text-sm">
                        <p className="font-medium text-foreground">What will be deleted:</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                            <li>Your email, name, and profile data from our database</li>
                            <li>Your credential metadata (name, degree, grade) from our database</li>
                            <li>Your credential documents will be unpinned from IPFS</li>
                        </ul>
                        <p className="mt-3 font-medium text-foreground">What cannot be deleted:</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                            <li>
                                <strong className="text-foreground">On-chain records</strong> — a SHA-256 hash of
                                your credential is anchored on the Stellar blockchain. This hash is
                                immutable by design and does not contain personal data (it is a one-way
                                fingerprint). It is retained under GDPR Art. 17(3)(b).{' '}
                                <Link href="/legal/privacy#on-chain" className="text-primary underline">
                                    Learn more →
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {!showDeleteDialog ? (
                        <Button
                            id="btn-show-delete-dialog"
                            variant="destructive"
                            className="mt-5"
                            onClick={() => setShowDeleteDialog(true)}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete my account
                        </Button>
                    ) : (
                        <div className="mt-5 space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
                            <div className="flex items-start gap-2 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    <strong>This action is irreversible.</strong> Your account and all associated
                                    personal data will be permanently deleted.
                                </span>
                            </div>

                            <div>
                                <label
                                    htmlFor="delete-confirm-input"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Type <strong>DELETE</strong> to confirm
                                </label>
                                <input
                                    id="delete-confirm-input"
                                    type="text"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder="DELETE"
                                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    id="btn-confirm-delete"
                                    variant="destructive"
                                    disabled={confirmText !== 'DELETE' || deleting}
                                    onClick={handleDeleteAccount}
                                >
                                    {deleting ? 'Deleting…' : 'Permanently delete account'}
                                </Button>
                                <Button
                                    id="btn-cancel-delete"
                                    variant="outline"
                                    onClick={() => {
                                        setShowDeleteDialog(false);
                                        setConfirmText('');
                                    }}
                                    disabled={deleting}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </DashboardShell>
    );
}

export default function DashboardSettingsPage() {
    return (
        <ProtectedRoute>
            <SettingsContent />
        </ProtectedRoute>
    );
}
