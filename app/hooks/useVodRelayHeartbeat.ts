'use client';

import { useEffect, useRef } from 'react';
import { getDeviceId } from '@/app/lib/device';

/** Same cadence as the sync tick: positions move slowly and this is cheap. */
const TICK_MS = 4000;

type ConsumerState = 'playing' | 'paused' | 'stalled';

/**
 * Tells the server this device is really PLAYING the VOD relay, so ffmpeg (and the
 * single upstream connection behind it) is released as soon as nobody is watching.
 *
 * Segment downloads cannot be used for this: on a DEMUXER_ERROR hls.js keeps fetching
 * fragments with 200 OK while the <video> is dead, which looked exactly like someone
 * watching and kept the broadcast pinned forever. Only the client can tell the
 * difference, and the discriminator is whether `currentTime` moved.
 *
 * A deliberate pause still counts as watching — the viewer is there. A forgotten pause
 * is handled by the manual stop on the TV Mode screen, not by a timeout.
 */
export function useVodRelayHeartbeat(opts: {
    videoEl: HTMLVideoElement | null;
    contentType: 'movie' | 'series';
    streamId: string;
    active: boolean;
    /** Called when the broadcast no longer exists (ended elsewhere or stopped by hand). */
    onEnded?: () => void;
}) {
    const { videoEl, contentType, streamId, active, onEnded } = opts;
    const videoRef = useRef(videoEl);
    const onEndedRef = useRef(onEnded);
    const lastTimeRef = useRef<number | null>(null);
    const everAliveRef = useRef(false);

    useEffect(() => { videoRef.current = videoEl; }, [videoEl]);
    useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

    useEffect(() => {
        if (!active || !streamId) return;

        const key = `${contentType}_${streamId}`;
        const deviceId = getDeviceId();
        lastTimeRef.current = null;
        everAliveRef.current = false;
        let cancelled = false;

        const classify = (): ConsumerState => {
            const video = videoRef.current;
            if (!video) return 'stalled';
            // An errored player (DEMUXER_ERROR…) may still be downloading segments.
            if (video.error) return 'stalled';
            if (video.paused) return 'paused';

            const previous = lastTimeRef.current;
            lastTimeRef.current = video.currentTime;
            if (previous === null) return 'playing'; // first tick: no delta to compare against
            return video.currentTime !== previous ? 'playing' : 'stalled';
        };

        const post = (state: ConsumerState, keepalive = false) =>
            fetch('/api/relay/vod/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, deviceId, state }),
                keepalive,
            });

        const tick = async () => {
            try {
                const res = await post(classify());
                const data = await res.json();
                if (cancelled || !data) return;

                // The first beats can outrun the ffmpeg spawn triggered by the playlist
                // request, so `alive: false` only means "ended" after we have seen it alive.
                if (data.alive === true) {
                    everAliveRef.current = true;
                } else if (everAliveRef.current) {
                    onEndedRef.current?.();
                }
            } catch {
                /* best-effort */
            }
        };

        // Release the broadcast right away instead of holding it for the whole TTL.
        const release = () => { post('stalled', true).catch(() => {}); };

        tick();
        const interval = setInterval(() => { if (!cancelled) tick(); }, TICK_MS);
        window.addEventListener('pagehide', release);

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener('pagehide', release);
            release();
        };
    }, [active, contentType, streamId]);
}
