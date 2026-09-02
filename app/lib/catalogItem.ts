import type { CachedStream, ContentType } from './dbTypes';

export interface CatalogItem {
    id: string;
    type: ContentType;
    name: string;
    image?: string;
    rating?: number;
    year?: number;
    addedAt: number;
    containerExtension?: string;
    releaseDate?: string;
    href: string;
}

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

// `added`/`last_modified` come from two provider generations: some send epoch
// seconds as a numeric string, others an ISO date. Normalizing both to epoch
// ms fixes the split behavior across live/series (compared the string as a
// number) and movies (used `Date`) that produced wrong "recently added" sorts.
function parseAddedAt(value: string | undefined): number {
    if (!value) return 0;

    if (/^\d+$/.test(value)) {
        const seconds = Number.parseInt(value, 10);
        return Number.isFinite(seconds) ? seconds * 1000 : 0;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseYear(releaseDate: string | undefined, name: string): number | undefined {
    const fromDate = releaseDate?.match(YEAR_PATTERN)?.[0];
    if (fromDate) return Number.parseInt(fromDate, 10);

    const fromName = name.match(YEAR_PATTERN)?.[0];
    return fromName ? Number.parseInt(fromName, 10) : undefined;
}

function parseRating(stream: CachedStream): number | undefined {
    const raw = stream.rating ?? stream.rating_5based;
    if (raw === undefined) return undefined;

    const parsed = Number.parseFloat(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function buildHref(type: ContentType, id: string): string {
    const segment = type === 'live' ? 'live' : type === 'movie' ? 'movie' : 'series';
    return `/dashboard/watch/${segment}/${id}`;
}

export function toCatalogItem(stream: CachedStream): CatalogItem {
    const id = String(stream.id);

    return {
        id,
        type: stream.type,
        name: stream.name,
        image: stream.cover ?? stream.icon,
        rating: parseRating(stream),
        year: parseYear(stream.release_date, stream.name),
        addedAt: parseAddedAt(stream.last_modified ?? stream.added),
        containerExtension: stream.container_extension,
        releaseDate: stream.release_date,
        href: buildHref(stream.type, id),
    };
}

export function toCatalogItems(streams: CachedStream[]): CatalogItem[] {
    return streams.map(toCatalogItem);
}
