import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient, requireAuthenticatedRequest } from '@/lib/serverAuth';
import { structuredLog } from '@/lib/debug';

export async function POST(request: NextRequest) {
    try {
        const authCheck = await requireAuthenticatedRequest(request);
        if (!authCheck.ok) {
            return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
        }

        const body = await request.json();
        const { type, tokenId } = body;

        if (!['issued', 'revoked'].includes(type) || !tokenId) {
            return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
        }

        const supabase = getServiceRoleClient();

        // Verify institution and credential
        const { data: institution } = await supabase
            .from('institutions')
            .select('id, name')
            .eq('auth_user_id', authCheck.userId)
            .single();

        if (!institution) {
            return NextResponse.json({ success: false, error: 'Institution not found' }, { status: 404 });
        }

        const { data: credential } = await supabase
            .from('credentials')
            .select('*, students(id, email, auth_user_id)')
            .eq('token_id', tokenId)
            .eq('institution_id', institution.id)
            .single();

        if (!credential) {
            return NextResponse.json({ success: false, error: 'Credential not found' }, { status: 404 });
        }

        const studentEmail = credential.students?.email || credential.metadata?.credentialData?.studentEmail;
        if (!studentEmail) {
            return NextResponse.json({ success: false, error: 'Student email not available' }, { status: 400 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://acredia.io';
        const credentialUrl = `${appUrl}/verify/${tokenId}`;
        const studentName = credential.metadata?.credentialData?.studentName || 'Student';

        const jobPayload = {
            to: studentEmail,
            subject: type === 'issued' ? 'New Credential Issued' : 'Credential Revoked',
            type,
            userId: credential.students?.auth_user_id || null, // pass user ID for preference checking
            payload: {
                studentName,
                institutionName: institution.name,
                credentialUrl,
            }
        };

        const { error: jobError } = await supabase
            .from('jobs')
            .insert({
                name: 'send_email',
                payload: jobPayload
            });

        if (jobError) {
            throw jobError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        structuredLog('ERROR', 'Failed to trigger notification', 'system', { error: String(error) });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
