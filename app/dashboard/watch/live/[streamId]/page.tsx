'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import VideoPlayer from '@/components/VideoPlayer';
import type Hls from 'hls.js';
import SyncButton from '@/components/SyncButton';
import BroadcastToggle from '@/components/BroadcastToggle';
import Badge from '@/components/ui/Badge';
import { useShareBroadcast, useSyncPlayback, syncKey } from '@/app/hooks/useLiveShare';
import { getAutoBroadcast } from '@/app/lib/device';
import { apiUrl } from '@/app/lib/apiClient';

export default function WatchLivePage() {
    const { credentials } = useAuth();
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const streamId = params.streamId as string;

    // Coming from "Modo TV": I watch another device broadcast (via relay, 0 new connection).
    const isJoining = searchParams.get('join') === '1';
    const title = searchParams.get('title') || `Canal ${streamId}`;
    const poster = searchParams.get('poster') || undefined;

    // Broadcast toggle (starts on if the device is in "broadcast everything").
    const [isSharing, setIsSharing] = useState(() => getAutoBroadcast());
    const useRelay = isJoining || isSharing;

    // Time sync between players (only when playback goes through the relay).
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const [hlsInstance, setHlsInstance] = useState<Hls | null>(null);
    const { canSync, sync } = useSyncPlayback({
        videoEl,
        hls: hlsInstance,
        streamKey: syncKey('live', streamId),
        role: isJoining ? 'viewer' : 'broadcaster',
        active: useRelay,
    });

    const streamUrl = useMemo(() => {
        if (!credentials || !streamId) return null;
        // Live always goes through the same-origin relay — never straight to the
        // provider. Xtream answers the .m3u8 with a 302 to a tokenized CDN that
        // sends no CORS headers, so hls.js (the only HLS path on WebOS/desktop
        // Chrome, which lack native HLS) is blocked when it fetches directly.
        // The relay does the cross-origin fetch server-side, rewrites the
        // playlist, and coalesces viewers into ~1 upstream connection.
        return apiUrl(`/api/relay?type=live&streamId=${encodeURIComponent(streamId)}`);
    }, [credentials, streamId]);

    const broadcastInfo = useMemo(
        () => ({ contentType: 'live' as const, streamId, title, poster }),
        [streamId, title, poster]
    );
    // Register/heartbeat only when I am broadcasting (not when just watching someone else).
    useShareBroadcast(isSharing && !isJoining, broadcastInfo);

    if (!streamUrl) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center text-ink-2">
                Preparando stream...
            </div>
        );
    }

    const shareToggle = !isJoining ? (
        <BroadcastToggle active={isSharing} onToggle={() => setIsSharing((v) => !v)} />
    ) : (
        <Badge tone="live" dot>Modo TV</Badge>
    );

    return (
        <div className="fixed inset-0 bg-bg z-50 flex flex-col">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent z-10" />
            </div>

            <div className="relative flex-1 flex items-center justify-center">
                <VideoPlayer
                    src={streamUrl}
                    poster={poster}
                    autoPlay={true}
                    onBack={() => router.back()}
                    title={title}
                    onVideoElement={setVideoEl}
                    onHlsInstance={setHlsInstance}
                    topRightSlot={
                        <div className="flex items-center space-x-2">
                            {useRelay && canSync && <SyncButton role={isJoining ? 'viewer' : 'broadcaster'} onClick={sync} />}
                            {shareToggle}
                        </div>
                    }
                />
            </div>
        </div>
    );
}
