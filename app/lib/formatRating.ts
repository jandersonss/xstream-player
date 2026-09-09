/**
 * Normalises a rating to a single-decimal label.
 *
 * The provider hands ratings back inconsistently — a raw string like "7.5123" on
 * some paths, an already-parsed number on others, an empty string or "0" when
 * there is no score. Every card, carousel and detail header runs the value
 * through here so they all read the same. Returns null when there is no real
 * score (non-numeric, or <= 0); callers render null as "hidden".
 */
export function formatRating(value: number | string | null | undefined): string | null {
    const parsed = value === null || value === undefined ? NaN : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(1) : null;
}
