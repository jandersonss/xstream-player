'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Download, Loader2, Subtitles, Globe } from 'lucide-react';
import { useSubtitle, SubtitleResult } from '../app/context/SubtitleContext';
import { useProfile } from '../app/context/ProfileContext';
import { useT } from '../app/context/I18nContext';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import { inputClassName } from '@/components/ui/Field';

interface SubtitleSearchPanelProps {
    title: string;
    year?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    tmdbId?: number;
    parentTmdbId?: number;
    streamId: string;
    onSubtitleSelected: (vttUrl: string) => void;
    onClose: () => void;
}

interface SearchParams {
    languages: string;
    tmdb_id?: number;
    parent_tmdb_id?: number;
    season_number?: number;
    episode_number?: number;
    query?: string;
    year?: number;
}

const LANGUAGES = [
    { code: 'pt-BR', label: 'Português BR' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'zh', label: '中文' },
    { code: 'ar', label: 'العربية' },
    { code: 'ru', label: 'Русский' },
];

export default function SubtitleSearchPanel({
    title,
    year,
    seasonNumber,
    episodeNumber,
    tmdbId,
    parentTmdbId,
    streamId,
    onSubtitleSelected,
    onClose,
}: SubtitleSearchPanelProps) {
    const { searchSubtitles, downloadSubtitle, isConfigured, isConfigResolved, remainingDownloads, ensureConfigLoaded } = useSubtitle();
    const { activeProfile, updatePrefs } = useProfile();
    const t = useT();
    const [results, setResults] = useState<SubtitleResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isDownloading, setIsDownloading] = useState<number | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState(
        () => activeProfile?.prefs.subtitleLanguage ?? 'pt-BR'
    );
    const [hasSearched, setHasSearched] = useState(false);

    useEffect(() => {
        ensureConfigLoaded();
    }, [ensureConfigLoaded]);

    // The language picked here becomes the profile's preference, so the next
    // content already searches (and auto-downloads) in it.
    const changeLanguage = useCallback((language: string) => {
        setSelectedLanguage(language);
        updatePrefs({ subtitleLanguage: language });
    }, [updatePrefs]);

    const handleSearch = useCallback(async () => {
        setIsSearching(true);
        setHasSearched(true);

        const searchParams: SearchParams = {
            languages: selectedLanguage,
        };

        // Prioritize TMDB ID for movies
        if (tmdbId) {
            searchParams.tmdb_id = tmdbId;
        }

        // Prioritize parent_tmdb_id for episodes
        if (parentTmdbId) {
            searchParams.parent_tmdb_id = parentTmdbId;
            if (seasonNumber) searchParams.season_number = seasonNumber;
            if (episodeNumber) searchParams.episode_number = episodeNumber;
        }

        // Fallback to title/query if IDs aren't available
        if (!tmdbId && !parentTmdbId) {
            searchParams.query = title;
            if (seasonNumber) searchParams.season_number = seasonNumber;
            if (episodeNumber) searchParams.episode_number = episodeNumber;

            // Extract year for better query matching
            if (year && !seasonNumber) {
                const match = year.match(/\d{4}/);
                if (match) searchParams.year = parseInt(match[0]);
            }
        }

        const searchResults = await searchSubtitles(searchParams);

        setResults(searchResults);
        setIsSearching(false);
    }, [title, year, seasonNumber, episodeNumber, tmdbId, parentTmdbId, selectedLanguage, searchSubtitles]);

    const handleDownload = useCallback(async (fileId: number) => {
        setIsDownloading(fileId);
        const vttUrl = await downloadSubtitle(fileId, streamId);
        setIsDownloading(null);

        if (vttUrl) {
            onSubtitleSelected(vttUrl);
            onClose();
        }
    }, [downloadSubtitle, streamId, onSubtitleSelected, onClose]);

    // `ensureConfigLoaded` only runs after the first paint, so gating on
    // "resolved" (rather than "loading") avoids flashing the not-configured
    // message at a user who does have a key saved.
    if (!isConfigResolved) {
        return (
            <Modal isOpen onClose={onClose} title={t('subtitlePanel.title')} size="lg">
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={32} className="text-ink animate-spin" />
                </div>
            </Modal>
        );
    }

    if (!isConfigured) {
        return (
            <Modal isOpen onClose={onClose} title={t('subtitlePanel.title')} size="sm">
                <EmptyState
                    icon={Subtitles}
                    title={t('subtitlePanel.notConfiguredTitle')}
                    description={t('subtitlePanel.notConfiguredDesc')}
                    action={<Button variant="secondary" onClick={onClose}>{t('subtitlePanel.close')}</Button>}
                />
            </Modal>
        );
    }

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={t('subtitlePanel.title')}
            description={title}
            size="lg"
        >
            <div className="space-y-3 mb-4">
                <div className="flex items-center space-x-2">
                    {remainingDownloads !== null && (
                        <Badge tone={remainingDownloads <= 3 ? 'warn' : 'ok'}>
                            {t('subtitlePanel.remaining', { n: remainingDownloads })}
                        </Badge>
                    )}
                </div>

                <div className="flex space-x-3">
                    <div className="relative flex-1">
                        <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                        <select
                            value={selectedLanguage}
                            onChange={(e) => changeLanguage(e.target.value)}
                            data-focusable="true"
                            tabIndex={0}
                            className={`${inputClassName} pl-9 appearance-none`}
                        >
                            {LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <Button
                        variant="primary"
                        icon={isSearching ? undefined : Search}
                        loading={isSearching}
                        onClick={handleSearch}
                    >
                        {t('subtitlePanel.search')}
                    </Button>
                </div>

                {seasonNumber !== undefined && episodeNumber !== undefined && (
                    <p className="text-xs text-ink-2">
                        {t('subtitlePanel.seasonEpisode', { season: seasonNumber, episode: episodeNumber })}
                    </p>
                )}
            </div>

            {/* `px-1 -mx-1` keeps the focus ring of the full-width result rows from
                being clipped by this vertical scroller (spec 00 §4.4). */}
            <div className="max-h-96 overflow-y-auto space-y-2 px-1 -mx-1">
                {isSearching && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={32} className="text-ink animate-spin" />
                    </div>
                )}

                {!isSearching && hasSearched && results.length === 0 && (
                    <EmptyState
                        icon={Subtitles}
                        title={t('subtitlePanel.noneFoundTitle')}
                        description={t('subtitlePanel.noneFoundDesc')}
                        compact
                    />
                )}

                {!isSearching && results.map((result) => {
                    const fileId = result.attributes.files?.[0]?.file_id;
                    if (!fileId) return null;

                    return (
                        <button
                            key={result.id}
                            onClick={() => handleDownload(fileId)}
                            disabled={isDownloading !== null}
                            data-focusable={isDownloading !== null ? undefined : 'true'}
                            tabIndex={isDownloading !== null ? undefined : 0}
                            // Dense list row inside a scroller: flat ring, no scale
                            // (spec 00 §4) so the neighbours don't shift and the ring
                            // isn't swallowed by the container's vertical overflow.
                            className="focus-flat w-full text-left p-3 bg-surface border border-line rounded-xl disabled:opacity-50"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2 mb-1">
                                        <Badge tone="ok">{result.attributes.language}</Badge>
                                        {result.attributes.hearing_impaired && (
                                            <Badge tone="neutral">CC</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-ink truncate">
                                        {result.attributes.release || result.attributes.files[0].file_name}
                                    </p>
                                    <p className="text-xs text-ink-2 mt-0.5 tnum">
                                        {result.attributes.uploader?.name || t('subtitlePanel.anonymous')} · {result.attributes.download_count} {t('subtitlePanel.downloads')}
                                    </p>
                                </div>
                                <div className="ml-3 flex-shrink-0">
                                    {isDownloading === fileId ? (
                                        <Loader2 size={20} className="text-ink animate-spin" />
                                    ) : (
                                        <Download size={20} className="text-ink-3" />
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </Modal>
    );
}
