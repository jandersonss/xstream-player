export type ContentType = 'live' | 'movie' | 'series';

export interface CachedCategory {
    category_id: string;
    category_name: string;
    parent_id: number;
    type: ContentType;
}

export interface CachedStream {
    id: string | number;
    category_id: string;
    name: string;
    type: ContentType;
    icon?: string;
    rating?: string;
    added?: string;
    normalized_name?: string;
    container_extension?: string;
    epg_channel_id?: string;
    stream_type?: string;
    cover?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    release_date?: string;
    rating_5based?: string;
    backdrop_path?: string[];
    last_modified?: string;
}

export interface SyncMetadata {
    type: ContentType | 'categories';
    lastSync: number;
}

export interface SavedSubtitle {
    streamId: string;
    vtt: string;
    language: string;
    timestamp: number;
}
