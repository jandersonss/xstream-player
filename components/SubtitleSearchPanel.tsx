'use client';

import { useState, useCallback } from 'react';
import { Search, Download, Loader2, Subtitles, X, Globe } from 'lucide-react';
import { useSubtitle, SubtitleResult } from '../app/context/SubtitleContext';

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
    const { searchSubtitles, downloadSubtitle, isConfigured, remainingDownloads } = useSubtitle();
    const [results, setResults] = useState<SubtitleResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isDownloading, setIsDownloading] = useState<number | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState('pt-BR');
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = useCallback(async () => {
        setIsSearching(true);
        setHasSearched(true);

        const searchParams: any = {
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
    }, [downloadSubtitle, onSubtitleSelected, onClose]);

    if (!isConfigured) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 text-center animate-in zoom-in-95 duration-200">
                    <Subtitles size={48} className="text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Legendas não configuradas</h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Configure sua chave de API do OpenSubtitles no menu lateral para buscar legendas.
                    </p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[#333]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-600/20 rounded-lg">
                            <Subtitles size={24} className="text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Buscar Legendas</h2>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-gray-500 truncate max-w-[200px]">{title}</p>
                                {remainingDownloads !== null && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${remainingDownloads <= 3 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                        {remainingDownloads} restantes
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                {/* Search Controls */}
                <div className="p-4 border-b border-[#333] space-y-3">
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <select
                                value={selectedLanguage}
                                onChange={(e) => setSelectedLanguage(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-[#0f0f0f] border border-[#333] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 appearance-none cursor-pointer"
                            >
                                {LANGUAGES.map(lang => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
                        >
                            {isSearching ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Search size={16} />
                            )}
                            Buscar
                        </button>
                    </div>

                    {seasonNumber !== undefined && episodeNumber !== undefined && (
                        <p className="text-xs text-gray-500">
                            Temporada {seasonNumber}, Episódio {episodeNumber}
                        </p>
                    )}
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isSearching && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={32} className="text-emerald-500 animate-spin" />
                        </div>
                    )}

                    {!isSearching && hasSearched && results.length === 0 && (
                        <div className="text-center py-12">
                            <Subtitles size={48} className="text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-400">Nenhuma legenda encontrada</p>
                            <p className="text-xs text-gray-600 mt-1">Tente outro idioma ou verifique o nome do conteúdo</p>
                        </div>
                    )}

                    {!isSearching && results.map((result) => {
                        const fileId = result.attributes.files?.[0]?.file_id;
                        if (!fileId) return null;

                        return (
                            <button
                                key={result.id}
                                onClick={() => handleDownload(fileId)}
                                disabled={isDownloading !== null}
                                className="w-full text-left p-3 bg-[#252525] hover:bg-[#2f2f2f] rounded-xl transition-all border border-white/5 hover:border-emerald-500/30 disabled:opacity-50 group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold px-2 py-0.5 bg-emerald-600/20 text-emerald-400 rounded uppercase">
                                                {result.attributes.language}
                                            </span>
                                            {result.attributes.hearing_impaired && (
                                                <span className="text-xs px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded">
                                                    CC
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-white truncate">
                                            {result.attributes.release || result.attributes.files[0].file_name}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {result.attributes.uploader?.name || 'Anônimo'} · {result.attributes.download_count} downloads
                                        </p>
                                    </div>
                                    <div className="ml-3 flex-shrink-0">
                                        {isDownloading === fileId ? (
                                            <Loader2 size={20} className="text-emerald-500 animate-spin" />
                                        ) : (
                                            <Download size={20} className="text-gray-500 group-hover:text-emerald-400 transition-colors" />
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
