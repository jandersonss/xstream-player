'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Tv } from 'lucide-react';
import ProgramCard from './ProgramCard';
import {
    EPGProgram,
    XtreamEPGListingItem,
    convertXtreamToEPGProgram,
    formatTime,
    getCurrentProgram,
    getNextProgram
} from '@/app/lib/epg';

interface Channel {
    streamId: string;
    name: string;
    icon: string;
    programs: EPGProgram[];
}

interface EPGGridProps {
    channels: Channel[];
    onChannelClick?: (streamId: string) => void;
}

export default function EPGGrid({ channels, onChannelClick }: EPGGridProps) {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(Date.now());
    const timelineRef = useRef<HTMLDivElement>(null);
    const [scrollToNow, setScrollToNow] = useState(false);

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(Date.now());
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, []);

    // Scroll to current time on mount
    useEffect(() => {
        if (scrollToNow && timelineRef.current) {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();

            // Approximate scroll position (each hour is roughly 300px wide)
            const scrollPosition = (hours * 300) + (minutes * 5);
            timelineRef.current.scrollLeft = Math.max(0, scrollPosition - 200);
            setScrollToNow(false);
        }
    }, [scrollToNow]);

    useEffect(() => {
        setScrollToNow(true);
    }, []);

    const handleChannelClick = (streamId: string) => {
        if (onChannelClick) {
            onChannelClick(streamId);
        } else {
            router.push(`/dashboard/watch/live/${streamId}`);
        }
    };

    if (channels.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Clock size={48} className="text-gray-600 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Nenhum dado EPG disponível</h3>
                <p className="text-gray-400 max-w-md">
                    Os dados de programação não estão disponíveis no momento.
                    Verifique se seu provedor IPTV oferece suporte a EPG.
                </p>
            </div>
        );
    }

    // Generate timeline (24 hours)
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    return (
        <div className="space-y-4">
            {/* Header with current time */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock size={20} className="text-red-500" />
                    <h2 className="text-xl font-bold text-white">
                        {now.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        })}
                    </h2>
                </div>
                <button
                    onClick={() => setScrollToNow(true)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-medium transition-colors"
                >
                    Ir para Agora
                </button>
            </div>

            {/* EPG Grid Container */}
            <div className="relative border border-[#333] rounded-xl overflow-hidden bg-[#1a1a1a]">
                {/* Timeline Header */}
                <div className="sticky top-0 z-20 bg-[#1f1f1f] border-b border-[#333]">
                    <div className="flex">
                        {/* Channel column spacer */}
                        <div className="w-48 flex-shrink-0 border-r border-[#333] p-3">
                            <span className="text-sm font-semibold text-gray-400">Canal</span>
                        </div>

                        {/* Timeline */}
                        <div ref={timelineRef} className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            <div className="flex min-w-max">
                                {hours.map((hour) => (
                                    <div
                                        key={hour}
                                        className="w-[300px] flex-shrink-0 border-r border-[#333] p-3 relative"
                                    >
                                        <span className="text-sm font-semibold text-white">
                                            {hour.toString().padStart(2, '0')}:00
                                        </span>
                                        {/* Current time indicator */}
                                        {hour === currentHour && (
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-10"
                                                style={{ left: `${(currentMinute / 60) * 300}px` }}
                                            >
                                                <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-600 rounded-full" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Channels and Programs */}
                <div className="max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {channels.map((channel) => {
                        const currentProgram = getCurrentProgram(channel.programs);
                        const nextProgram = getNextProgram(channel.programs);

                        return (
                            <div
                                key={channel.streamId}
                                className="flex border-b border-[#333] hover:bg-white/5 transition-colors"
                            >
                                {/* Channel Info */}
                                <div
                                    className="w-48 flex-shrink-0 border-r border-[#333] p-3 cursor-pointer"
                                    onClick={() => handleChannelClick(channel.streamId)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 flex-shrink-0 bg-black rounded-md flex items-center justify-center overflow-hidden border border-[#333]">
                                            {channel.icon ? (
                                                <img
                                                    src={channel.icon}
                                                    alt={channel.name}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                                />
                                            ) : (
                                                <Tv size={16} className="text-gray-600" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-white truncate">
                                                {channel.name}
                                            </p>
                                            {currentProgram && (
                                                <p className="text-xs text-gray-500 truncate">
                                                    {currentProgram.title}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Programs Timeline */}
                                <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                    <div className="flex min-w-max h-full">
                                        {channel.programs.length > 0 ? (
                                            channel.programs.map((program) => (
                                                <div
                                                    key={program.id}
                                                    className="p-2"
                                                    style={{
                                                        width: `${getDurationWidth(program.startTimestamp, program.stopTimestamp)}px`,
                                                        minWidth: '150px'
                                                    }}
                                                >
                                                    <ProgramCard
                                                        title={program.title}
                                                        description={program.description}
                                                        start={program.start}
                                                        end={program.end}
                                                        startTimestamp={program.startTimestamp}
                                                        stopTimestamp={program.stopTimestamp}
                                                        nowPlaying={program.nowPlaying === '1'}
                                                        onClick={() => handleChannelClick(channel.streamId)}
                                                    />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-4 text-gray-500 text-sm">
                                                Sem programação disponível
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full" />
                    <span>Hora Atual</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-12 h-3 bg-red-600/20 border border-red-600 rounded" />
                    <span>Ao Vivo</span>
                </div>
            </div>
        </div>
    );
}

// Calculate width based on program duration (5px per minute)
function getDurationWidth(start: number, end: number): number {
    const durationMinutes = (end - start) / 60;
    return Math.max(150, durationMinutes * 5); // Minimum 150px width
}
