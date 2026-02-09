// EPG (Electronic Program Guide) Types and Utilities

export interface EPGProgram {
    id: string;
    title: string;
    description: string;
    start: string; // ISO timestamp
    end: string; // ISO timestamp
    startTimestamp: number; // Unix timestamp
    stopTimestamp: number; // Unix timestamp
    channelId: string;
    hasArchive?: string;
    nowPlaying?: string;
}

export interface EPGChannel {
    streamId: string | number;
    name: string;
    icon: string;
    epgChannelId: string;
    programs: EPGProgram[];
}

export interface EPGData {
    channels: EPGChannel[];
    startTime: number;
    endTime: number;
}

export interface XtreamEPGListingItem {
    id: string;
    epg_id: string;
    title: string;
    lang: string;
    start: string; // "2024-02-09 14:00:00"
    end: string; // "2024-02-09 16:00:00"
    description: string;
    channel_id: string;
    start_timestamp: string; // Unix timestamp as string
    stop_timestamp: string; // Unix timestamp as string
    now_playing?: string; // "1" or "0"
    has_archive?: string; // "1" or "0"
}

export interface XtreamShortEPGItem {
    id: string;
    title: string;
    start: string;
    end: string;
    description: string;
    start_timestamp: string;
    stop_timestamp: string;
}

/**
 * Formats timestamp to readable time string (HH:MM)
 */
export function formatTime(timestamp: number | string): string {
    const date = new Date(typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp);
    return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Formats timestamp to readable date and time string
 */
export function formatDateTime(timestamp: number | string): string {
    const date = new Date(typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Formats timestamp to readable date string
 */
export function formatDate(timestamp: number | string): string {
    const date = new Date(typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp);
    return date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
    });
}

/**
 * Calculates duration in minutes
 */
export function getDuration(start: number | string, end: number | string): number {
    const startTime = typeof start === 'string' ? parseInt(start) * 1000 : start;
    const endTime = typeof end === 'string' ? parseInt(end) * 1000 : end;
    return Math.round((endTime - startTime) / 1000 / 60);
}

/**
 * Checks if a program is currently playing
 */
export function isNowPlaying(start: number | string, end: number | string): boolean {
    const now = Date.now();
    const startTime = typeof start === 'string' ? parseInt(start) * 1000 : start;
    const endTime = typeof end === 'string' ? parseInt(end) * 1000 : end;
    return now >= startTime && now <= endTime;
}

/**
 * Gets progress percentage for a program (0-100)
 */
export function getProgramProgress(start: number | string, end: number | string): number {
    const now = Date.now();
    const startTime = typeof start === 'string' ? parseInt(start) * 1000 : start;
    const endTime = typeof end === 'string' ? parseInt(end) * 1000 : end;

    if (now < startTime) return 0;
    if (now > endTime) return 100;

    const totalDuration = endTime - startTime;
    const elapsed = now - startTime;
    return Math.round((elapsed / totalDuration) * 100);
}

/**
 * Converts Xtream API EPG listing to EPGProgram
 */
export function convertXtreamToEPGProgram(item: XtreamEPGListingItem): EPGProgram {
    return {
        id: item.id,
        title: item.title,
        description: item.description || '',
        start: item.start,
        end: item.end,
        startTimestamp: parseInt(item.start_timestamp),
        stopTimestamp: parseInt(item.stop_timestamp),
        channelId: item.channel_id,
        hasArchive: item.has_archive,
        nowPlaying: item.now_playing
    };
}

/**
 * Groups programs by hour for easy display
 */
export function groupProgramsByHour(programs: EPGProgram[]): Map<number, EPGProgram[]> {
    const grouped = new Map<number, EPGProgram[]>();

    programs.forEach(program => {
        const hour = new Date(program.startTimestamp * 1000).getHours();
        if (!grouped.has(hour)) {
            grouped.set(hour, []);
        }
        grouped.get(hour)!.push(program);
    });

    return grouped;
}

/**
 * Gets programs for a specific time range
 */
export function getProgramsInRange(
    programs: EPGProgram[],
    startTime: number,
    endTime: number
): EPGProgram[] {
    return programs.filter(program => {
        const programStart = program.startTimestamp * 1000;
        const programEnd = program.stopTimestamp * 1000;

        // Program overlaps with time range
        return (programStart < endTime && programEnd > startTime);
    });
}

/**
 * Generates time slots for EPG grid (every 30 minutes)
 */
export function generateTimeSlots(startHour: number = 0, hours: number = 24): Date[] {
    const slots: Date[] = [];
    const now = new Date();
    now.setHours(startHour, 0, 0, 0);

    const totalSlots = hours * 2; // 2 slots per hour (30 min each)

    for (let i = 0; i < totalSlots; i++) {
        slots.push(new Date(now));
        now.setMinutes(now.getMinutes() + 30);
    }

    return slots;
}

/**
 * Gets the current program for a channel
 */
export function getCurrentProgram(programs: EPGProgram[]): EPGProgram | null {
    const now = Date.now();
    return programs.find(program => {
        const start = program.startTimestamp * 1000;
        const end = program.stopTimestamp * 1000;
        return now >= start && now <= end;
    }) || null;
}

/**
 * Gets the next program for a channel
 */
export function getNextProgram(programs: EPGProgram[]): EPGProgram | null {
    const now = Date.now();
    const upcoming = programs
        .filter(program => program.startTimestamp * 1000 > now)
        .sort((a, b) => a.startTimestamp - b.startTimestamp);

    return upcoming[0] || null;
}
