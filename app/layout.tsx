import "./polyfills";
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

const legacyRedirectScript = `
(function () {
  try {
    var path = window.location.pathname || '';
    var search = window.location.search || '';
    if (path.indexOf('/legacy') === 0 || path.indexOf('/debug') === 0 || path.indexOf('/api') === 0) return;
    if (search.indexOf('forceModern=1') !== -1 || search.indexOf('forceLegacy=1') !== -1) return;

    var ua = String(navigator.userAgent || '').toLowerCase();
    var isWebOs = ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1;
    var chromeMatch = ua.match(/chrome\\/(\\d+)/);
    var chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;
    var needsLegacy = (isWebOs && (!chromeVersion || chromeVersion < 72))
      || typeof Promise === 'undefined'
      || typeof fetch === 'undefined';

    if (needsLegacy) {
      var target = '/legacy?redirect=' + encodeURIComponent(path + search);
      window.location.replace(target);
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
