'use client';

import AccountSection from '@/components/settings/AccountSection';
import CatalogSection from '@/components/settings/CatalogSection';
import ProfilesSection from '@/components/settings/ProfilesSection';
import SubtitlesSection from '@/components/settings/SubtitlesSection';
import TmdbSection from '@/components/settings/TmdbSection';
import TvModeSection from '@/components/settings/TvModeSection';
import DiagnosticsSection from '@/components/settings/DiagnosticsSection';

/** Everything that used to live in the sidebar and the home header pills. */
export default function SettingsPage() {
    return (
        <div className="px-6 md:px-10 lg:px-14 py-8 max-w-3xl">
            <h1 className="text-2xl md:text-3xl font-semibold text-ink mb-8">Ajustes</h1>

            <div className="space-y-8">
                <AccountSection />
                <div className="border-t border-line pt-8">
                    <CatalogSection />
                </div>
                <div className="border-t border-line pt-8">
                    <ProfilesSection />
                </div>
                <div id="legendas" className="border-t border-line pt-8">
                    <SubtitlesSection />
                </div>
                <div className="border-t border-line pt-8">
                    <TmdbSection />
                </div>
                <div className="border-t border-line pt-8">
                    <TvModeSection />
                </div>
                <div className="border-t border-line pt-8 pb-4">
                    <DiagnosticsSection />
                </div>
            </div>
        </div>
    );
}
