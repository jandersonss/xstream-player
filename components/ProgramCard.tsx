'use client';

import { formatTime, getDuration, getProgramProgress, isNowPlaying } from '@/app/lib/epg';

interface ProgramCardProps {
    title: string;
    description: string;
    start: string;
    end: string;
    startTimestamp: number;
    stopTimestamp: number;
    nowPlaying?: boolean;
    onClick?: () => void;
}

export default function ProgramCard({
    title,
    description,
    start,
    end,
    startTimestamp,
    stopTimestamp,
    nowPlaying,
    onClick
}: ProgramCardProps) {
    const isLive = nowPlaying || isNowPlaying(startTimestamp, stopTimestamp);
    const progress = isLive ? getProgramProgress(startTimestamp, stopTimestamp) : 0;
    const duration = getDuration(startTimestamp, stopTimestamp);

    return (
        <div
            onClick={onClick}
            className="group relative bg-[#1f1f1f] border border-[#333] rounded-lg p-3 hover:border-red-600 transition-all cursor-pointer"
        >
            {/* Live Badge */}
            {isLive && (
                <div className="absolute top-2 right-2 bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider animate-pulse">
                    AO VIVO
                </div>
            )}

            {/* Program Title */}
            <h4 className="font-semibold text-white text-sm mb-1 pr-16 line-clamp-2 group-hover:text-red-500 transition-colors">
                {title || 'Sem título'}
            </h4>

            {/* Time */}
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span>{formatTime(startTimestamp)}</span>
                <span>•</span>
                <span>{formatTime(stopTimestamp)}</span>
                <span>•</span>
                <span>{duration} min</span>
            </div>

            {/* Progress Bar (only for live programs) */}
            {isLive && (
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-2">
                    <div
                        className="h-full bg-red-600 transition-all"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* Description */}
            {description && (
                <p className="text-xs text-gray-500 line-clamp-2">
                    {description}
                </p>
            )}

            {/* Hover tooltip with full description */}
            {description && (
                <div className="absolute bottom-full left-0 mb-2 w-full max-w-sm bg-black border border-red-600 rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                    <h5 className="font-semibold text-white text-sm mb-1">{title}</h5>
                    <p className="text-xs text-gray-400 mb-2">
                        {formatTime(startTimestamp)} - {formatTime(stopTimestamp)} ({duration} min)
                    </p>
                    <p className="text-xs text-gray-300">{description}</p>
                </div>
            )}
        </div>
    );
}
