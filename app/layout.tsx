import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import ErrorBoundary from "@/components/ErrorBoundary";
import RemoteAccessGate from "@/components/RemoteAccessGate";
import { cookies, headers } from "next/headers";
import {
  getRemoteAccessState,
  REMOTE_ACCESS_COOKIE_NAME,
} from "@/app/lib/remoteAccess";

export const metadata: Metadata = {
  title: "XStream Player",
  description: "Premium Web IPTV Player",
};

/**
 * Runtime polyfills, read once at module load and inlined below.
 *
 * Built from `app/polyfills.ts` by `npm run build:polyfills`. It has to be inline
 * rather than a `<script src>`: Next's own bundles are async, so only a blocking
 * inline script is guaranteed to run before the vendor chunk that touches
 * `globalThis` at module scope — the crash that black-screened webOS 4.
 */
const polyfillScript = (() => {
    try {
        return fs.readFileSync(path.join(process.cwd(), 'public', 'polyfills-legacy.js'), 'utf-8');
    } catch {
        // Missing build artifact must not take the whole app down; only old TVs care.
        console.error('[Layout] public/polyfills-legacy.js not found — run npm run build:polyfills');
        return '';
    }
})();

/**
 * First script on the page, before any bundle.
 *
 * Besides the legacy redirect it installs an error trap. A TV has no console you
 * can reach, and on webOS 4 the remote debugger's Log/Runtime domains report
 * nothing — so a startup crash there is completely silent. Collecting into a
 * global lets `/debug`, a remote `Runtime.evaluate`, or `?showErrors=1` say what
 * actually broke. It costs a few lines and runs before anything that could fail.
 */
const legacyRedirectScript = `
(function () {
  window.__XSTREAM_ERRORS = [];

  function record(entry) {
    if (window.__XSTREAM_ERRORS.length < 20) window.__XSTREAM_ERRORS.push(entry);
    if (String(window.location.search || '').indexOf('showErrors=1') === -1) return;
    try {
      var box = document.getElementById('xstream-error-box');
      if (!box) {
        box = document.createElement('div');
        box.id = 'xstream-error-box';
        box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#450a0a;color:#fecaca;font:14px monospace;padding:12px;white-space:pre-wrap;max-height:60%;overflow:auto';
        (document.body || document.documentElement).appendChild(box);
      }
      box.appendChild(document.createTextNode(entry + '\\n'));
    } catch (e) {}
  }

  window.addEventListener('error', function (event) {
    var where = String(event.filename || '').split('/').pop() + ':' + event.lineno;
    var stack = event.error && event.error.stack ? '\\n   ' + String(event.error.stack).split('\\n').slice(0, 4).join('\\n   ') : '';
    record('ERROR: ' + (event.message || '') + ' @ ' + where + stack);
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    record('REJECT: ' + (reason && reason.message ? reason.message : String(reason)) +
      (reason && reason.stack ? '\\n   ' + String(reason.stack).split('\\n').slice(0, 4).join('\\n   ') : ''));
  });

  // React reports render/effect failures through console.error, not window.onerror,
  // and a component that catches its own error reports it the same way. Neither
  // reaches the handlers above, so the console is mirrored too.
  if (window.console && typeof console.error === 'function') {
    var nativeError = console.error;
    console.error = function () {
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          parts.push(a && a.stack ? String(a.stack).split('\\n').slice(0, 3).join(' | ') : String(a && a.message ? a.message : a));
        }
        record('CONSOLE: ' + parts.join(' ').slice(0, 400));
      } catch (e) {}
      return nativeError.apply(console, arguments);
    };
  }

  try {
    var path = window.location.pathname || '';
    var search = window.location.search || '';
    if (path.indexOf('/legacy') === 0 || path.indexOf('/debug') === 0 || path.indexOf('/api') === 0) return;
    if (search.indexOf('forceModern=1') !== -1) return;

    var ua = String(navigator.userAgent || '').toLowerCase();
    var isWebOs = ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1;
    var chromeMatch = ua.match(/chrome\\/(\\d+)/);
    var chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

    // Keep this threshold in sync with MODERN_APP_MIN_CHROME in middleware.ts.
    if (isWebOs && (!chromeVersion || chromeVersion < 53)) {
      window.location.replace('/legacy/index.html');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const cookiesList = await cookies();
  const remoteAccess = await getRemoteAccessState(
    headersList.get("x-forwarded-host") || headersList.get("host"),
    cookiesList.get(REMOTE_ACCESS_COOKIE_NAME)?.value
  );
  const shouldGateRemoteAccess = remoteAccess.required && !remoteAccess.authorized;

  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {/* Order matters: polyfills first, then the error trap and the legacy
            redirect. Both run before any application bundle. */}
        <script dangerouslySetInnerHTML={{ __html: polyfillScript }} />
        <script dangerouslySetInnerHTML={{ __html: legacyRedirectScript }} />
        {shouldGateRemoteAccess ? (
          <RemoteAccessGate mode={remoteAccess.configured ? "verify" : "setup"} />
        ) : (
          <ErrorBoundary>
            <ClientProviders>
              {children}
            </ClientProviders>
          </ErrorBoundary>
        )}
      </body>
    </html>
  );
}
