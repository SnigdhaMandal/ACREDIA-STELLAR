/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupabaseClient } from '@supabase/supabase-js';

export interface Job {
    id: string;
    name: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    max_attempts: number;
    run_at: string;
    locked_at: string | null;
    locked_by: string | null;
    error_log: string | null;
    idempotency_key: string | null;
    created_at: string;
    updated_at: string;
}

export type JobHandler = (payload: any) => Promise<void> | void;

/**
 * Enqueue a new background job.
 * If a unique idempotencyKey is provided and conflicts with an existing job,
 * this function will gracefully ignore the insert and return the existing job.
 */
export async function enqueueJob(
    client: SupabaseClient,
    name: string,
    payload: Record<string, unknown>,
    options?: {
        idempotencyKey?: string;
        runAt?: Date;
        maxAttempts?: number;
    }
): Promise<{ success: boolean; job?: Job; error?: string }> {
    const data = {
        name,
        payload,
        status: 'pending',
        idempotency_key: options?.idempotencyKey || null,
        run_at: options?.runAt ? options.runAt.toISOString() : new Date().toISOString(),
        max_attempts: options?.maxAttempts !== undefined ? options.maxAttempts : 3,
    };

    const { data: inserted, error } = await client
        .from('jobs')
        .insert([data])
        .select()
        .maybeSingle();

    if (error) {
        // Unique constraint violation code is 23505
        if (error.code === '23505' && options?.idempotencyKey) {
            const { data: existing } = await client
                .from('jobs')
                .select('*')
                .eq('idempotency_key', options.idempotencyKey)
                .maybeSingle();
            return { success: true, job: existing as Job };
        }
        return { success: false, error: error.message };
    }

    return { success: true, job: inserted as Job };
}

/**
 * Poll for a single pending job, lock it, process it using the provided handlers,
 * and record success or handle retries/failure logging.
 * Returns true if a job was found and processed.
 */
export async function pollAndProcessJob(
    client: SupabaseClient,
    workerId: string,
    handlers: Record<string, JobHandler>
): Promise<{ processed: boolean; job?: Job; error?: string }> {
    // 1. Fetch next job and mark status as processing using Skip Locked via next_job RPC function
    const { data: jobData, error: lockError } = await client.rpc('next_job', {
        p_worker_id: workerId,
    });

    if (lockError) {
        return { processed: false, error: `Failed to lock job: ${lockError.message}` };
    }

    const job = (Array.isArray(jobData) ? jobData[0] : jobData) as Job | undefined;
    if (!job) {
        return { processed: false };
    }

    const handler = handlers[job.name];
    if (!handler) {
        const errorMsg = `No handler registered for job name: ${job.name}`;
        await client
            .from('jobs')
            .update({
                status: 'failed',
                error_log: errorMsg,
                updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        return { processed: true, job: { ...job, status: 'failed', error_log: errorMsg } };
    }

    try {
        await handler(job.payload);

        // Success: Mark completed
        const { data: completedJob } = await client
            .from('jobs')
            .update({
                status: 'completed',
                updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
            .select()
            .single();

        return { processed: true, job: completedJob as Job };
    } catch (err: unknown) {
        // Failure: Check attempts vs max_attempts to retry or mark failed
        const failed = job.attempts >= job.max_attempts;
        const errorStack = err instanceof Error ? err.stack || err.message : String(err);

        const { data: updatedJob } = await client
            .from('jobs')
            .update({
                status: failed ? 'failed' : 'pending',
                error_log: errorStack,
                updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
            .select()
            .single();

        return { processed: true, job: updatedJob as Job };
    }
}

