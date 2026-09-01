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
