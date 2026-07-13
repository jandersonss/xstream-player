'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { SavedSubtitle } from '../lib/db';

interface SubtitleConfig {
    apiKey: string;
}

interface SubtitleResult {
    id: string;
    attributes: {
        language: string;
        download_count: number;
        hearing_impaired: boolean;
        release: string;
        uploader: {
            name: string;
        };
        files: Array<{
            file_id: number;
            file_name: string;
        }>;
        feature_details?: {
            movie_name?: string;
            year?: number;
            season_number?: number;
            episode_number?: number;
        };
    };
}

interface SubtitleContextType {
    config: SubtitleConfig | null;
    isConfigured: boolean;
    isLoading: boolean;
    /** False until the lazy config load has settled, so UIs don't read `isConfigured` too early. */
    isConfigResolved: boolean;
    remainingDownloads: number | null;
    /** Loads the config on first real need. Subtitle UIs must call this on mount/open. */
    ensureConfigLoaded: () => Promise<void>;
    saveConfig: (apiKey: string) => Promise<boolean>;
    clearConfig: () => Promise<void>;
    searchSubtitles: (params: {
        query?: string;
        languages?: string;
        season_number?: number;
        episode_number?: number;
        year?: number;
        tmdb_id?: number | string;
        parent_tmdb_id?: number | string;
    }) => Promise<SubtitleResult[]>;
    downloadSubtitle: (fileId: number, streamId: string) => Promise<string | null>;
    /**
     * Busca + baixa a melhor legenda de um único episódio, de forma silenciosa
     * (sem alertas), para o carregamento sob demanda ao abrir o player.
     */
    autoDownloadEpisodeSubtitle: (
        streamId: string,
        searchParams: {
            languages: string;
            season_number: number;
            episode_number: number;
            parent_tmdb_id?: number;
            query?: string;
            year?: number;
        },
    ) => Promise<{ url: string | null; quotaExceeded: boolean; notFound: boolean }>;
    /**
     * Busca (sem baixar) a melhor legenda para cada episódio, informando o que
     * está disponível, o que já foi baixado e o que não tem legenda. Só consome
     * o rate limit de busca — nunca a cota diária de downloads.
     */
    searchSeriesSubtitles: (
        episodes: Array<{ streamId: string; seasonNumber: number; episodeNumber: number }>,
        opts: { languages: string; parentTmdbId?: number; query?: string; year?: number },
        onProgress?: (done: number, total: number, partial: EpisodeSubtitleStatus[]) => void,
        shouldCancel?: () => boolean,
    ) => Promise<EpisodeSubtitleStatus[]>;
    /**
     * Baixa em sequência as legendas já encontradas pela busca (por file_id).
     * Respeita o rate limit com uma pausa entre requisições e para de forma
     * limpa ao atingir a cota diária (407).
     */
    downloadSeriesSubtitles: (
        items: Array<{ streamId: string; fileId: number }>,
        language: string,
        onProgress?: (done: number, total: number, last: { streamId: string; ok: boolean }) => void,
        shouldCancel?: () => boolean,
    ) => Promise<{ downloaded: number; failed: number; quotaHit: boolean; done: number; total: number }>;
    getSavedSubtitle: (streamId: string) => Promise<SavedSubtitle | undefined>;
    clearSavedSubtitle: (streamId: string) => Promise<void>;
}

interface EpisodeSubtitleStatus {
    streamId: string;
    status: 'available' | 'unavailable' | 'downloaded';
    fileId?: number;
    release?: string;
    language?: string;
}

const SubtitleContext = createContext<SubtitleContextType | undefined>(undefined);

export function SubtitleProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<SubtitleConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isConfigResolved, setIsConfigResolved] = useState(false);
    const [remainingDownloads, setRemainingDownloads] = useState<number | null>(null);
    // Best practice: cache search results to reduce redundant API calls
    const searchCacheRef = useRef<Map<string, { data: SubtitleResult[]; timestamp: number }>>(new Map());
    // Mirrors `config` so callbacks can read it after awaiting the lazy load,
    // where the value captured in their closure would still be stale.
    const configRef = useRef<SubtitleConfig | null>(null);
    // Holds the in-flight (or settled) load so concurrent callers share it.
    const configLoadRef = useRef<Promise<void> | null>(null);

    const applyConfig = useCallback((next: SubtitleConfig | null) => {
        configRef.current = next;
        setConfig(next);
        setIsConfigResolved(true);
        // A config written locally is authoritative, so a later lazy load
        // must not re-fetch and clobber it.
        configLoadRef.current = Promise.resolve();
    }, []);

    const ensureConfigLoaded = useCallback((): Promise<void> => {
        if (configLoadRef.current) return configLoadRef.current;

        const loadConfig = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/subtitles/config');
                if (response.ok) {
                    const data = await response.json();
                    if (data.apiKey) {
                        applyConfig({ apiKey: data.apiKey });
                    }
                }
            } catch (error) {
                console.error('[SubtitleContext] Failed to load config:', error);
            } finally {
                setIsLoading(false);
                setIsConfigResolved(true);
            }
        };

        configLoadRef.current = loadConfig();
        return configLoadRef.current;
    }, [applyConfig]);

    const saveConfigHandler = useCallback(async (apiKey: string): Promise<boolean> => {
        try {
            // Save to backend (which validates the key)
            const response = await fetch('/api/subtitles/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ apiKey }),
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('[SubtitleContext] Failed to save config:', error);
                return false;
            }

            const { config: newConfig } = await response.json();
            applyConfig({ apiKey: newConfig.apiKey });
            return true;
        } catch (error) {
            console.error('[SubtitleContext] Failed to save config:', error);
            return false;
        }
    }, [applyConfig]);

    const clearConfigHandler = useCallback(async () => {
        try {
            await fetch('/api/subtitles/config', {
                method: 'DELETE',
            });
            applyConfig(null);
        } catch (error) {
            console.error('[SubtitleContext] Failed to clear config:', error);
        }
    }, [applyConfig]);

    const searchSubtitles = useCallback(async (params: {
        query?: string;
        languages?: string;
        season_number?: number;
        episode_number?: number;
        year?: number;
        tmdb_id?: number | string;
        parent_tmdb_id?: number | string;
    }): Promise<SubtitleResult[]> => {
        await ensureConfigLoaded();
        const activeConfig = configRef.current;
        if (!activeConfig) return [];

        // Best practice: cache search results (5 min TTL)
        const cacheKey = JSON.stringify(params);
        const cached = searchCacheRef.current.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            return cached.data;
        }

        try {
            const response = await fetch('/api/subtitles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'search',
                    apiKey: activeConfig.apiKey,
                    ...params,
                }),
            });

            if (!response.ok) {
                console.error('[SubtitleContext] Search failed:', response.status);
                return [];
            }

            const data = await response.json();
            const results = data.data || [];

            // Cache the results
            searchCacheRef.current.set(cacheKey, { data: results, timestamp: Date.now() });

            return results;
        } catch (error) {
            console.error('[SubtitleContext] Search error:', error);
            return [];
        }
    }, [ensureConfigLoaded]);

    // Baixa e persiste a legenda de um único file_id, sem efeitos de UI.
    // `quotaExceeded` sinaliza o 407 (cota diária) para que o chamador em lote
    // possa parar em vez de continuar disparando requisições que vão falhar.
    const performDownload = useCallback(async (
        fileId: number,
        streamId: string,
        language: string,
    ): Promise<{ ok: boolean; quotaExceeded?: boolean; vtt?: string }> => {
        const activeConfig = configRef.current;
        if (!activeConfig) return { ok: false };

        try {
            const response = await fetch('/api/subtitles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'download',
                    apiKey: activeConfig.apiKey,
                    file_id: fileId,
                }),
            });

            // Cota diária esgotada (o servidor normaliza 406/407 para 406).
            if (response.status === 406 || response.status === 407) {
                setRemainingDownloads(0);
                return { ok: false, quotaExceeded: true };
            }

            if (!response.ok) {
                console.error('[SubtitleContext] Download failed:', response.status);
                return { ok: false };
            }

            const remaining = response.headers.get('X-Downloads-Remaining');
            if (remaining) {
                setRemainingDownloads(parseInt(remaining));
            }

            const vtt = await response.text();
            if (!vtt || !vtt.startsWith('WEBVTT')) {
                console.error('[SubtitleContext] Invalid VTT content received');
                return { ok: false };
            }

            // Save for persistence to server
            try {
                await fetch('/api/subtitles/user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streamId: String(streamId), vtt, language })
                });
            } catch (err) {
                console.warn('[SubtitleContext] Failed to sync subtitle to server:', err);
            }

            return { ok: true, vtt };
        } catch (error) {
            console.error('[SubtitleContext] Download error:', error);
            return { ok: false };
        }
    }, []);

    const downloadSubtitle = useCallback(async (fileId: number, streamId: string): Promise<string | null> => {
        await ensureConfigLoaded();
        const result = await performDownload(fileId, streamId, 'pt-BR');

        if (result.quotaExceeded) {
            alert('Limite diário de downloads atingido. Tente novamente amanhã (reset à meia-noite UTC).');
            return null;
        }
        if (!result.ok || !result.vtt) return null;

        const blob = new Blob([result.vtt], { type: 'text/vtt' });
        return URL.createObjectURL(blob);
    }, [ensureConfigLoaded, performDownload]);

    const getSavedSubtitle = useCallback(async (streamId: string) => {
        try {
            const response = await fetch(`/api/subtitles/user?streamId=${streamId}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (err) {
            console.warn('[SubtitleContext] Failed to fetch saved subtitle:', err);
        }
        return null;
    }, []);

    const clearSavedSubtitle = useCallback(async (streamId: string) => {
        try {
            await fetch(`/api/subtitles/user?streamId=${streamId}`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.warn('[SubtitleContext] Failed to clear saved subtitle:', err);
        }
    }, []);

    const autoDownloadEpisodeSubtitle = useCallback(async (
        streamId: string,
        searchParams: {
            languages: string;
            season_number: number;
            episode_number: number;
            parent_tmdb_id?: number;
            query?: string;
            year?: number;
        },
    ): Promise<{ url: string | null; quotaExceeded: boolean; notFound: boolean }> => {
        await ensureConfigLoaded();
        if (!configRef.current) return { url: null, quotaExceeded: false, notFound: false };

        const results = await searchSubtitles(searchParams);
        const fileId = results[0]?.attributes?.files?.[0]?.file_id;
        if (!fileId) return { url: null, quotaExceeded: false, notFound: true };

        const res = await performDownload(fileId, streamId, searchParams.languages);
        if (res.quotaExceeded) return { url: null, quotaExceeded: true, notFound: false };
        if (!res.ok || !res.vtt) return { url: null, quotaExceeded: false, notFound: false };

        const blob = new Blob([res.vtt], { type: 'text/vtt' });
        return { url: URL.createObjectURL(blob), quotaExceeded: false, notFound: false };
    }, [ensureConfigLoaded, searchSubtitles, performDownload]);

    const searchSeriesSubtitles = useCallback(async (
        episodes: Array<{ streamId: string; seasonNumber: number; episodeNumber: number }>,
        opts: { languages: string; parentTmdbId?: number; query?: string; year?: number },
        onProgress?: (done: number, total: number, partial: EpisodeSubtitleStatus[]) => void,
        shouldCancel?: () => boolean,
    ): Promise<EpisodeSubtitleStatus[]> => {
        await ensureConfigLoaded();

        const out: EpisodeSubtitleStatus[] = [];
        if (!configRef.current) return out;

        for (let i = 0; i < episodes.length; i++) {
            if (shouldCancel?.()) break;
            const ep = episodes[i];

            // Já tem legenda salva → nada a buscar.
            const existing = await getSavedSubtitle(ep.streamId);
            if (existing && existing.vtt) {
                out.push({ streamId: ep.streamId, status: 'downloaded' });
                onProgress?.(i + 1, episodes.length, out);
                continue;
            }

            const searchParams: {
                languages: string;
                season_number: number;
                episode_number: number;
                parent_tmdb_id?: number;
                query?: string;
                year?: number;
            } = {
                languages: opts.languages,
                season_number: ep.seasonNumber,
                episode_number: ep.episodeNumber,
            };
            if (opts.parentTmdbId) {
                searchParams.parent_tmdb_id = opts.parentTmdbId;
            } else {
                searchParams.query = opts.query;
                if (opts.year) searchParams.year = opts.year;
            }

            const results = await searchSubtitles(searchParams);
            const best = results[0];
            const fileId = best?.attributes?.files?.[0]?.file_id;

            if (fileId) {
                out.push({
                    streamId: ep.streamId,
                    status: 'available',
                    fileId,
                    release: best.attributes.release,
                    language: best.attributes.language,
                });
            } else {
                out.push({ streamId: ep.streamId, status: 'unavailable' });
            }
            onProgress?.(i + 1, episodes.length, out);

            // Pausa gentil entre buscas para respeitar o rate limit da API.
            if (i < episodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return out;
    }, [ensureConfigLoaded, getSavedSubtitle, searchSubtitles]);

    const downloadSeriesSubtitles = useCallback(async (
        items: Array<{ streamId: string; fileId: number }>,
        language: string,
        onProgress?: (done: number, total: number, last: { streamId: string; ok: boolean }) => void,
        shouldCancel?: () => boolean,
    ): Promise<{ downloaded: number; failed: number; quotaHit: boolean; done: number; total: number }> => {
        await ensureConfigLoaded();

        let downloaded = 0;
        let failed = 0;
        const total = items.length;
        if (!configRef.current) return { downloaded, failed, quotaHit: false, done: 0, total };

        for (let i = 0; i < items.length; i++) {
            if (shouldCancel?.()) return { downloaded, failed, quotaHit: false, done: i, total };
            const item = items[i];

            const result = await performDownload(item.fileId, item.streamId, language);
            if (result.quotaExceeded) {
                // Cota diária atingida: para aqui; o que já baixou fica salvo.
                return { downloaded, failed, quotaHit: true, done: i, total };
            }

            if (result.ok) downloaded++;
            else failed++;
            onProgress?.(i + 1, total, { streamId: item.streamId, ok: result.ok });

            // Pausa gentil entre downloads para respeitar o rate limit da API.
            if (i < items.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return { downloaded, failed, quotaHit: false, done: total, total };
    }, [ensureConfigLoaded, performDownload]);

    return (
        <SubtitleContext.Provider
            value={{
                config,
                isConfigured: !!config,
                isLoading,
                isConfigResolved,
                remainingDownloads,
                ensureConfigLoaded,
                saveConfig: saveConfigHandler,
                clearConfig: clearConfigHandler,
                searchSubtitles,
                downloadSubtitle,
                autoDownloadEpisodeSubtitle,
                searchSeriesSubtitles,
                downloadSeriesSubtitles,
                getSavedSubtitle,
                clearSavedSubtitle,
            }}
        >
            {children}
        </SubtitleContext.Provider>
    );
}

export function useSubtitle() {
    const context = useContext(SubtitleContext);
    if (!context) {
        throw new Error('useSubtitle must be used within a SubtitleProvider');
    }
    return context;
}

export type { SubtitleResult, EpisodeSubtitleStatus };
