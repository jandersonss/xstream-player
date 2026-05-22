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
