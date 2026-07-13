'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Radio } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import VideoPlayer from '@/components/VideoPlayer';
import { useShareBroadcast } from '@/app/hooks/useLiveShare';

export default function WatchLivePage() {
    const { credentials } = useAuth();
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const streamId = params.streamId as string;

    // Vindo do "Modo TV": assisto a transmissão de outro aparelho (via relay, 0 conexão nova).
    const isJoining = searchParams.get('join') === '1';
    const title = searchParams.get('title') || `Canal ${streamId}`;
    const poster = searchParams.get('poster') || undefined;

    // Toggle de transmissão (só faz sentido quando NÃO estou entrando na de outro).
    const [isSharing, setIsSharing] = useState(false);
    const useRelay = isJoining || isSharing;

    const streamUrl = useMemo(() => {
        if (!credentials || !streamId) return null;
        if (useRelay) {
            // Relay compartilhado no servidor: uma conexão upstream para todos.
            return `/api/relay?type=live&streamId=${encodeURIComponent(streamId)}`;
        }
        const { hostUrl, username, password } = credentials;
        return `${hostUrl}/live/${username}/${password}/${streamId}.m3u8`;
    }, [credentials, streamId, useRelay]);

    const broadcastInfo = useMemo(
        () => ({ contentType: 'live' as const, streamId, title, poster }),
        [streamId, title, poster]
    );
    // Registro/heartbeat só quando EU estou transmitindo (não ao apenas assistir a de outro).
    useShareBroadcast(isSharing && !isJoining, broadcastInfo);

    if (!streamUrl) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Preparando stream...</div>;
    }

    const shareToggle = !isJoining ? (
        <button
            onClick={() => setIsSharing((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transition-all shadow-xl focus:outline-none focus:ring-2 focus:ring-red-500 ${isSharing
                ? 'bg-red-600 text-white'
                : 'bg-black/60 text-gray-200 hover:bg-white/20'
                }`}
            title={isSharing ? 'Transmitindo para o Modo TV' : 'Transmitir este canal no Modo TV'}
        >
            <Radio size={18} className={isSharing ? 'animate-pulse' : ''} />
            <span>{isSharing ? 'Transmitindo' : 'Transmitir'}</span>
        </button>
    ) : (
        <span className="px-3 py-2 rounded-full text-sm font-semibold bg-black/60 text-red-300 flex items-center gap-2">
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
                    topRightSlot={shareToggle}
                />
            </div>
        </div>
    );
}
