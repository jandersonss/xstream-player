/**
 * Device capability detection for adaptive sync performance.
 * 
 * Detects device tier based on available browser APIs:
 * - navigator.deviceMemory (Chrome 63+)
 * - navigator.hardwareConcurrency (Chrome 37+)
 * - User-Agent (webOS, Tizen, etc.)
 * - performance.memory (Chrome non-standard)
 * 
 * Returns a tier that controls sync batch sizes and other performance parameters.
 */

export type DeviceTier = 'low' | 'medium' | 'high' | 'ultra-high';

export interface DeviceProfile {
    tier: DeviceTier;
    /** Page size for paginated sync (items per page from proxy) */
    syncPageSize: number;
    /** Max items to hold in memory at once for processing */
    maxInMemory: number;
    /** Whether to yield to event loop between batches */
    yieldBetweenBatches: boolean;
    /** How many items to accumulate before writing to SQLite during stream sync */
    streamBatchSize: number;
    /** Whether to run multiple syncs (live, vod) in parallel */
    parallelSync: boolean;
    /** Whether the device supports NDJSON streaming (true if XHR is available) */
    useStreaming: boolean;
    /** Description for logging */
    description: string;
}

const PROFILES: Record<DeviceTier, DeviceProfile> = {
    low: {
        tier: 'low',
        syncPageSize: 500,
        maxInMemory: 500,
        yieldBetweenBatches: true,
        streamBatchSize: 200,
        parallelSync: false,
        useStreaming: true,
        description: 'Low-end (webOS 4, legacy TV, ≤1GB RAM)'
    },
    medium: {
        tier: 'medium',
        syncPageSize: 1000,
        maxInMemory: 1000,
        yieldBetweenBatches: true,
        streamBatchSize: 500,
        parallelSync: true,
        useStreaming: true,
        description: 'Mid-range (webOS 5/6, Tizen, 1-4GB RAM)'
    },
    high: {
        tier: 'high',
        syncPageSize: 2000,
        maxInMemory: 2000,
        yieldBetweenBatches: false,
        streamBatchSize: 1000,
        parallelSync: true,
        useStreaming: true,
        description: 'High-end (Desktop, modern browser, 4GB+ RAM)'
    },
    'ultra-high': {
        tier: 'ultra-high',
        syncPageSize: 3000,
        maxInMemory: 3000,
        yieldBetweenBatches: false,
        streamBatchSize: 2000,
        parallelSync: true,
        useStreaming: true,
        description: 'Ultra (Workstation, 16GB+ RAM, 12+ cores)'
    }
};

let cachedProfile: DeviceProfile | null = null;

/**
 * Detect device tier based on available browser signals.
 * Result is cached for the session lifetime.
 */
export function getDeviceProfile(): DeviceProfile {
    if (cachedProfile) return cachedProfile;

    if (typeof window === 'undefined') {
        // SSR fallback — assume medium
        return PROFILES.medium;
    }

    const tier = detectTier();
    cachedProfile = PROFILES[tier];

    console.log(`[DeviceProfile] Detected: ${cachedProfile.description} (syncPageSize: ${cachedProfile.syncPageSize})`);
    return cachedProfile;
}

function detectTier(): DeviceTier {
    const ua = navigator.userAgent.toLowerCase();

    // --- Force low tier for known legacy TV platforms ---
    // webOS 4.x or older (LG TVs 2018 and earlier, Chrome 53-60)
    if (ua.includes('webos') || ua.includes('web0s')) {
        const webosMatch = ua.match(/chrome\/(\d+)/);
        const chromeVersion = webosMatch ? parseInt(webosMatch[1]) : 0;
        if (chromeVersion > 0 && chromeVersion < 72) {
            return 'low';
        }
        // webOS 5+ with Chrome 72+ is medium
        return 'medium';
    }

    // Tizen (Samsung TVs)
    if (ua.includes('tizen')) {
        const tizenMatch = ua.match(/tizen\s*(\d+)/);
        const tizenVersion = tizenMatch ? parseInt(tizenMatch[1]) : 0;
        // Tizen 4 and below are low-end
        if (tizenVersion <= 4) return 'low';
        return 'medium';
    }

    // Generic smart TV / set-top box detection
    if (ua.includes('smart-tv') || ua.includes('smarttv') || ua.includes('hbbtv') || ua.includes('netcast')) {
        return 'low';
    }

    // --- Use hardware signals for non-TV devices ---

    // navigator.deviceMemory (Chrome 63+, not available on Firefox/Safari)
    const deviceMemory = (navigator as any).deviceMemory as number | undefined;

    // navigator.hardwareConcurrency (widely supported)
    const cpuCores = navigator.hardwareConcurrency || 0;

    // performance.memory (Chrome non-standard)
    const perfMemory = (performance as any).memory as {
        jsHeapSizeLimit?: number;
        totalJSHeapSize?: number;
    } | undefined;

    const heapLimitMB = perfMemory?.jsHeapSizeLimit
        ? Math.round(perfMemory.jsHeapSizeLimit / (1024 * 1024))
        : 0;

    // --- Scoring ---
    let score = 0;

    // Device memory (0 = unknown/not available, treat as medium)
    if (deviceMemory !== undefined) {
        if (deviceMemory <= 1) score -= 2;
        else if (deviceMemory <= 2) score -= 1;
        else if (deviceMemory >= 8) score += 2;
        else if (deviceMemory >= 4) score += 1;
    }

    // CPU cores
    if (cpuCores <= 2) score -= 1;
    else if (cpuCores >= 8) score += 2;
    else if (cpuCores >= 4) score += 1;

    // JS heap limit
    if (heapLimitMB > 0) {
        if (heapLimitMB < 512) score -= 2;
        else if (heapLimitMB < 1024) score -= 1;
        else if (heapLimitMB >= 4096) score += 2;
        else if (heapLimitMB >= 2048) score += 1;
    }

    // If no signals available at all (old browser), assume low
    if (deviceMemory === undefined && cpuCores === 0 && heapLimitMB === 0) {
        return 'low';
    }

    if (score >= 4) return 'ultra-high';
    if (score >= 2) return 'high';
    if (score <= -2) return 'low';
    return 'medium';
}
