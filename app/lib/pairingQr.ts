import 'server-only';

import qrcode from 'qrcode-generator';

/**
 * Builds a scannable QR code for the device-pairing approval URL, returned as an
 * SVG `data:` URI ready to drop into an `<img src>`.
 *
 * The TV shows this next to the 6-char code: the owner points a phone camera at
 * it and lands on `/dashboard/devices?code=…` with the code already filled in,
 * so typing it by hand becomes optional. Scanning still only pre-fills the form —
 * the owner approves on their own authenticated session, same as before.
 *
 * SVG (not PNG) keeps it dependency-light and razor-sharp at any size on the
 * 10-foot screen; `image/svg+xml` in an `<img>` works even on the webOS 4
 * (Chromium 53) container.
 */
export function buildPairingApprovalUrl(baseOrigin: string, code: string): string {
    const origin = baseOrigin.replace(/\/+$/, '');
    return `${origin}/dashboard/devices?code=${encodeURIComponent(code)}`;
}

export function buildPairingQrDataUri(approvalUrl: string): string {
    // typeNumber 0 = pick the smallest version that fits; 'M' tolerates the
    // glare and low contrast of a photo taken of a TV.
    const qr = qrcode(0, 'M');
    qr.addData(approvalUrl);
    qr.make();

    const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
