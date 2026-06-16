import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { syncXtreamToSqlite, type SyncProgressUpdate, type XtreamCredentials } from '@/app/lib/xtreamSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SyncJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

interface SyncJob {
    id: string;
    status: SyncJobStatus;
    progress: number;
    message: string;
    startedAt: number;
    updatedAt: number;
    lastSync?: number;
    error?: string;
    controller: AbortController;
}

interface SyncJobResponse extends Omit<SyncJob, 'controller'> { }

const globalSyncState = globalThis as typeof globalThis & {
    xstreamSyncJobs?: Map<string, SyncJob>;
};

function jobs() {
    if (!globalSyncState.xstreamSyncJobs) {
        globalSyncState.xstreamSyncJobs = new Map();
    }

    return globalSyncState.xstreamSyncJobs;
}

function publicJob(job: SyncJob): SyncJobResponse {
    const { controller: _controller, ...safeJob } = job;
    return safeJob;
}

function currentRunningJob() {
    for (const job of jobs().values()) {
        if (job.status === 'running') return job;
    }

    return undefined;
}

function createJob() {
    const job: SyncJob = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: 'running',
        progress: 0,
        message: 'Iniciando sincronizacao no servidor',
        startedAt: Date.now(),
        updatedAt: Date.now(),
        controller: new AbortController(),
    };

    jobs().set(job.id, job);
    return job;
}

function updateJob(job: SyncJob, update: Partial<SyncProgressUpdate>) {
    if (typeof update.progress === 'number') {
        job.progress = Math.max(0, Math.min(100, update.progress));
    }
    if (update.message) job.message = update.message;
    job.updatedAt = Date.now();
}

async function runJob(job: SyncJob, credentials: XtreamCredentials) {
    try {
        const lastSync = await syncXtreamToSqlite(credentials, job.controller.signal, update => updateJob(job, update));
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Sincronizacao concluida';
        job.lastSync = lastSync;
    } catch (error) {
        if (job.controller.signal.aborted) {
            job.status = 'cancelled';
            job.message = 'Sincronizacao cancelada';
        } else {
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : 'Erro desconhecido na sincronizacao';
            job.message = job.error;
            console.error('[ServerSync] Job failed:', error);
        }
    } finally {
        job.updatedAt = Date.now();
    }
}

export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const body = await request.json() as Partial<XtreamCredentials>;
        const { hostUrl, username, password } = body;

        if (!hostUrl || !username || !password) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const running = currentRunningJob();
        if (running) {
            return NextResponse.json({ job: publicJob(running), reused: true });
        }

        const job = createJob();
        void runJob(job, { hostUrl, username, password });

        return NextResponse.json({ job: publicJob(job) });
    } catch (error) {
        console.error('[ServerSync] Failed to start job:', error);
        return NextResponse.json({ error: 'Failed to start sync' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const job = jobId ? jobs().get(jobId) : currentRunningJob();

    if (!job) {
        return NextResponse.json({ job: null });
    }

    return NextResponse.json({ job: publicJob(job) });
}

export async function DELETE(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const job = jobId ? jobs().get(jobId) : currentRunningJob();

    if (!job) {
        return NextResponse.json({ success: true });
    }

    job.controller.abort();
    job.status = 'cancelled';
    job.progress = 0;
    job.message = 'Sincronizacao cancelada';
    job.updatedAt = Date.now();

    return NextResponse.json({ success: true, job: publicJob(job) });
}
