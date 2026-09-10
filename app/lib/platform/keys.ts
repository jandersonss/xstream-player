/**
 * Remote-control key codes shared by the TV platforms.
 *
 * TV remotes do not send `key: 'Escape'` for Back: webOS and Tizen both emit
 * keyCode 461, and Android TV webviews emit 4 (KEYCODE_BACK). `event.key` is
 * unreliable for these on old Chromium, so they are matched by keyCode.
 */

export const KEY_BACK_TV = 461;
export const KEY_BACK_ANDROID = 4;

/** True for every "go back" the app can receive: TV remotes, and a keyboard. */
export function isBackKey(event: KeyboardEvent): boolean {
    return (
        event.keyCode === KEY_BACK_TV ||
        event.keyCode === KEY_BACK_ANDROID ||
        event.key === 'GoBack' ||
        event.key === 'BrowserBack' ||
        event.key === 'Backspace' ||
        event.key === 'Escape'
    );
}

/**
 * True for the primary "OK"/select press: keyboard Enter and every TV remote's
 * center button (all emit keyCode 13, but `event.key` is `Unidentified` on old
 * webOS Chromium, so it is matched by code too).
 */
export function isOkKey(event: KeyboardEvent): boolean {
    return event.key === 'Enter' || event.keyCode === 13;
}

/**
 * Transport action requested by a dedicated media key on a TV remote.
 *
 * webOS 5/6 and Tizen emit the standard `MediaPlay`/`MediaPause`/... `event.key`
 * values; webOS 4 (Chromium 53) only sets `event.keyCode` to the numeric VK_*
 * codes, and `event.key` is `Unidentified` — so both are matched here.
 */
export type MediaKeyAction = 'playpause' | 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'forward' | 'rewind';

const MEDIA_KEY_BY_NAME: Record<string, MediaKeyAction> = {
    MediaPlayPause: 'playpause',
    MediaPlay: 'play',
    Play: 'play',
    MediaPause: 'pause',
    Pause: 'pause',
    MediaStop: 'stop',
    MediaTrackNext: 'next',
    MediaTrackPrevious: 'previous',
    MediaFastForward: 'forward',
    FastFwd: 'forward',
    MediaRewind: 'rewind',
    Rewind: 'rewind',
};

const MEDIA_KEY_BY_CODE: Record<number, MediaKeyAction> = {
    415: 'play', // VK_PLAY (webOS, Tizen)
    19: 'pause', // VK_PAUSE (webOS, Tizen) — also desktop Pause/Break, harmless in the player
    413: 'stop', // VK_STOP
    417: 'forward', // VK_FAST_FWD
    412: 'rewind', // VK_REWIND
    10252: 'playpause', // Tizen play/pause toggle
    10233: 'next', // Tizen VK_MEDIA_TRACK_NEXT
    10232: 'previous', // Tizen VK_MEDIA_TRACK_PREVIOUS
};

/** The transport action a media key asks for, or `null` if the key is not one. */
export function getMediaKeyAction(event: KeyboardEvent): MediaKeyAction | null {
    return MEDIA_KEY_BY_NAME[event.key] ?? MEDIA_KEY_BY_CODE[event.keyCode] ?? null;
}
