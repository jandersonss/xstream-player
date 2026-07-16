'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Radio } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import VideoPlayer from '@/components/VideoPlayer';
import SyncButton from '@/components/SyncButton';
import { useShareBroadcast, useSyncPlayback, syncKey } from '@/app/hooks/useLiveShare';
import { getAutoBroadcast } from '@/app/lib/device';

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
    const { canSync, sync } = useSyncPlayback({
        videoEl,
        streamKey: syncKey('live', streamId),
        role: isJoining ? 'viewer' : 'broadcaster',
        active: useRelay,
    });

    const streamUrl = useMemo(() => {
        if (!credentials || !streamId) return null;
        if (useRelay) {
            // Shared relay on the server: one upstream connection for everyone.
            return `/api/relay?type=live&streamId=${encodeURIComponent(streamId)}`;
        }
        const { hostUrl, username, password } = credentials;
        return `${hostUrl}/live/${username}/${password}/${streamId}.m3u8`;
    }, [credentials, streamId, useRelay]);

    const broadcastInfo = useMemo(
        () => ({ contentType: 'live' as const, streamId, title, poster }),
        [streamId, title, poster]
    );
    // Register/heartbeat only when I am broadcasting (not when just watching someone else).
    useShareBroadcast(isSharing && !isJoining, broadcastInfo);

    if (!streamUrl) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Preparando stream...</div>;
    }

    const shareToggle = !isJoining ? (
        <button
            onClick={() => setIsSharing((v) => !v)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-semibold transition-all shadow-xl focus:outline-none focus:ring-2 focus:ring-red-500 ${isSharing
                ? 'bg-red-600 text-white'
                : 'bg-black/60 text-gray-200 hover:bg-white/20'
                }`}
            title={isSharing ? 'Transmitindo para o Modo TV' : 'Transmitir este canal no Modo TV'}
        >
            <Radio size={18} className={isSharing ? 'animate-pulse' : ''} />
            <span>{isSharing ? 'Transmitindo' : 'Transmitir'}</span>
        </button>
    ) : (
        <span className="px-3 py-2 rounded-full text-sm font-semibold bg-black/60 text-red-300 flex items-center space-x-2">
            <Radio size={18} className="animate-pulse" /> Modo TV
        </span>
    );

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10"></div>
            </div>

            <div className="relative flex-1 flex items-center justify-center">
                <VideoPlayer
                    src={streamUrl}
                    poster={poster}
                    autoPlay={true}
                    onBack={() => router.back()}
                    enterFullscreen={true}
                    title={title}
                    onVideoElement={setVideoEl}
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
