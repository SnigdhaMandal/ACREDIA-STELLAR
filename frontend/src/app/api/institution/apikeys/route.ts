import { NextResponse, NextRequest } from 'next/server';
import { getServiceRoleClient, verifySession } from '@/lib/serverAuth';
import { hashApiKey } from '@/lib/apiKey';
import { captureException } from '@/lib/debug';
import { randomBytes } from 'crypto';

function generateRandomKey() {
    return 'sk_acredia_' + randomBytes(24).toString('base64url');
}

export async function GET(request: NextRequest) {
    try {
        const session = await verifySession(request);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getServiceRoleClient();
        const { data: institution } = await supabase
            .from('institutions')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (!institution) {
            return NextResponse.json({ success: false, error: 'Institution not found' }, { status: 404 });
        }

        const { data: apiKeys, error } = await supabase
            .from('api_keys')
            .select('id, key_prefix, name, revoked, created_at')
            .eq('institution_id', institution.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, apiKeys });
    } catch (err) {
        captureException(err, { context: 'GET /api/institution/apikeys' });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await verifySession(request);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const name = body.name?.trim();
        if (!name) {
            return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
        }

        const supabase = getServiceRoleClient();
        const { data: institution } = await supabase
            .from('institutions')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (!institution) {
            return NextResponse.json({ success: false, error: 'Institution not found' }, { status: 404 });
        }

        const cleartextKey = generateRandomKey();
        const keyHash = await hashApiKey(cleartextKey);
        const keyPrefix = cleartextKey.substring(0, 15) + '...';

        const { data: newKey, error } = await supabase
            .from('api_keys')
            .insert({
                institution_id: institution.id,
                name,
                key_prefix: keyPrefix,
                key_hash: keyHash,
            })
            .select('id, key_prefix, name, revoked, created_at')
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            apiKey: newKey,
            cleartextKey, // Only returned once
        });
    } catch (err) {
        captureException(err, { context: 'POST /api/institution/apikeys' });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await verifySession(request);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const id = body.id;
        if (!id) {
            return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
        }

        const supabase = getServiceRoleClient();
        const { data: institution } = await supabase
            .from('institutions')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (!institution) {
            return NextResponse.json({ success: false, error: 'Institution not found' }, { status: 404 });
        }

        const { error } = await supabase
            .from('api_keys')
            .update({ revoked: true })
            .eq('id', id)
            .eq('institution_id', institution.id);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        captureException(err, { context: 'DELETE /api/institution/apikeys' });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
