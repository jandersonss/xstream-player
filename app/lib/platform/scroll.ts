/**
 * `scrollIntoView` only accepts an options object from Chromium 61 onward; on
 * webOS 4 (Chromium 53) calling it with an object throws and the focused item
 * never centers. Try the modern signature first, fall back to the legacy
 * boolean one so every target browser gets at least "scroll to visible".
 */
export function scrollIntoViewSafe(
    el: Element,
    inline: ScrollLogicalPosition = 'center',
): void {
    try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline });
    } catch {
        el.scrollIntoView(false);
    }
}
