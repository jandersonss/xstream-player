'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import VideoPlayer from '@/components/VideoPlayer';

export default function WatchLivePage() {
    const { credentials } = useAuth();
    const params = useParams();
    const router = useRouter();
    const streamId = params.streamId as string;
    const [streamUrl, setStreamUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!credentials || !streamId) return;

        const { hostUrl, username, password } = credentials;
        // Construct standard Xtream Codes Live URL
        const url = `${hostUrl}/live/${username}/${password}/${streamId}.m3u8`;
        setStreamUrl(url);
    }, [credentials, streamId]);

    if (!streamUrl) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">Preparando stream...</div>;
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            {/* Background Blur for atmosphere */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10"></div>
            </div>

            <div className="relative flex-1 flex items-center justify-center">
                <VideoPlayer
                    src={streamUrl}
                    autoPlay={true}
                    onBack={() => router.back()}
                    enterFullscreen={true}
                />
            </div>
        </div>
    );
}
