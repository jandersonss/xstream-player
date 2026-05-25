const legacyStyles = `
html, body { background: #050505; color: #fff; margin: 0; }
.legacy-shell { min-height: 100vh; background: #050505; color: #fff; font-family: Arial, Helvetica, sans-serif; }
.legacy-topbar, .legacy-topbar-overlay { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; background: #050505; border-bottom: 1px solid #242424; }
.legacy-topbar-overlay { position: relative; z-index: 3; background: transparent; border: 0; }
.legacy-brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 22px; }
.legacy-logo { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #dc2626, #991b1b); display: flex; align-items: center; justify-content: center; font-weight: 800; }
.legacy-layout { display: flex; min-height: 100vh; }
.legacy-sidebar { width: 220px; flex: 0 0 220px; background: rgba(0,0,0,0.85); border-right: 1px solid #242424; padding: 18px 14px; }
.legacy-sidebar-brand { display: flex; align-items: center; gap: 10px; font-weight: 800; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #242424; }
.legacy-content { flex: 1; padding: 0; overflow: auto; background: #0f0f0f; }
.legacy-nav-button, .legacy-button { width: 100%; border: 1px solid #333; background: #171717; color: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; text-align: left; font-weight: 700; cursor: pointer; font-size: 14px; }
.legacy-nav-button.active, .legacy-button.primary { background: #dc2626; border-color: #ef4444; }
.legacy-nav-danger { margin-top: 12px; }
.legacy-button.inline { width: auto; display: inline-block; margin-right: 10px; margin-bottom: 10px; }
.legacy-button:focus, .legacy-nav-button:focus, .legacy-card:focus, .legacy-carousel-card:focus, input:focus { outline: 3px solid #fff; }
.legacy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; padding: 0 24px 24px; }
.legacy-card { min-height: 120px; border: 1px solid #303030; border-radius: 14px; background: #171717; color: #fff; padding: 14px; text-align: left; cursor: pointer; overflow: hidden; }
.legacy-card img { width: 100%; height: 210px; object-fit: cover; border-radius: 10px; background: #222; margin-bottom: 10px; display: block; }
.legacy-card-category { min-height: 90px; display: flex; align-items: flex-end; }
.legacy-title { font-size: 28px; font-weight: 800; margin: 0 0 8px; }
.legacy-muted { color: #b3b3b3; }
.legacy-error { padding: 14px; border: 1px solid #ef4444; background: rgba(239,68,68,0.12); border-radius: 12px; color: #fecaca; margin: 16px 24px; }
.legacy-panel { max-width: 520px; margin: 80px auto 40px; background: rgba(0,0,0,0.75); border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; padding: 28px; position: relative; z-index: 2; }
.legacy-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; font-weight: 700; }
.legacy-input { display: block; width: 100%; box-sizing: border-box; margin-bottom: 14px; padding: 14px; border-radius: 10px; border: 1px solid #404040; background: rgba(255,255,255,0.05); color: #fff; font-size: 16px; }
.legacy-player { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; flex-direction: column; }
.legacy-player video { width: 100%; height: 100%; flex: 1; background: #000; }
.legacy-player-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #111; border-bottom: 1px solid #333; }
.legacy-loading { padding: 24px; color: #ddd; }
.legacy-login-page { min-height: 100vh; position: relative; }
.legacy-login-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.35; transform: scale(1.05); }
.legacy-login-overlay { position: absolute; inset: 0; background: linear-gradient(to top, #000 10%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.4)); }
.legacy-home { padding-bottom: 32px; }
.legacy-home-header { padding: 24px 24px 8px; }
.legacy-header-meta { display: flex; flex-wrap: wrap; gap: 12px; color: #b3b3b3; font-size: 13px; }
.legacy-hero { position: relative; height: 52vh; min-height: 320px; max-height: 560px; cursor: pointer; overflow: hidden; }
.legacy-hero-backdrop { position: absolute; inset: 0; background-size: cover; background-position: center top; transition: opacity 0.8s ease; }
.legacy-hero-gradient { position: absolute; inset: 0; background: linear-gradient(to top, #0f0f0f 18%, rgba(15,15,15,0.2) 55%, rgba(0,0,0,0.35)); }
.legacy-hero-content { position: absolute; left: 0; right: 0; bottom: 48px; padding: 0 24px; z-index: 2; max-width: 720px; }
.legacy-hero-title { font-size: 32px; font-weight: 800; margin: 8px 0; line-height: 1.1; }
.legacy-hero-description { color: #d4d4d4; font-size: 15px; line-height: 1.4; margin: 0 0 14px; max-height: 4.2em; overflow: hidden; }
.legacy-hero-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.legacy-tag { display: inline-block; padding: 4px 10px; border-radius: 6px; background: rgba(255,255,255,0.15); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.legacy-tag-red { background: #dc2626; }
.legacy-hero-cta { width: auto; min-width: 180px; }
.legacy-hero-dots { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 3; }
.legacy-hero-dot { width: 28px; height: 6px; border-radius: 999px; border: 0; background: rgba(255,255,255,0.3); cursor: pointer; padding: 0; }
.legacy-hero-dot.active { background: #fff; width: 40px; }
.legacy-section { padding: 8px 0 20px; }
.legacy-section-title { font-size: 20px; font-weight: 800; margin: 0 0 12px; padding: 0 24px; }
.legacy-carousel { display: flex; gap: 14px; overflow-x: auto; padding: 0 24px 8px; scrollbar-width: thin; }
.legacy-carousel-card { position: relative; flex: 0 0 180px; height: 270px; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; overflow: hidden; background: #171717; cursor: pointer; text-align: left; color: #fff; padding: 0; }
.legacy-carousel-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.legacy-carousel-overlay { position: absolute; inset: 0; background: linear-gradient(to top, #000 30%, transparent 60%); pointer-events: none; }
.legacy-carousel-card p { position: absolute; left: 10px; right: 10px; bottom: 10px; margin: 0; font-size: 13px; font-weight: 700; z-index: 2; }
.legacy-progress-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,0.2); z-index: 3; }
.legacy-progress-bar span { display: block; height: 100%; background: #dc2626; }
.legacy-category-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 8px 24px 0; }
.legacy-category-card { position: relative; height: 220px; border: 1px solid #333; border-radius: 18px; overflow: hidden; cursor: pointer; text-align: left; padding: 0; background: #111; }
.legacy-category-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform 0.5s ease; }
.legacy-category-card:hover .legacy-category-card-bg { transform: scale(1.08); }
.legacy-category-card-content { position: absolute; inset: 0; padding: 18px; display: flex; flex-direction: column; justify-content: flex-end; background: linear-gradient(to top, #000 25%, rgba(0,0,0,0.35)); z-index: 1; color: #fff; }
.legacy-category-card h3 { margin: 6px 0 4px; font-size: 22px; }
.legacy-category-card p { margin: 0; color: #d4d4d4; font-size: 13px; }

.legacy-carousel-meta { position: absolute; left: 10px; right: 10px; bottom: 34px; font-size: 11px; color: #fbbf24; z-index: 2; }
.legacy-tmdb-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 24px 4px; }
.legacy-tmdb-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; box-shadow: 0 0 8px rgba(34,197,94,0.6); }
.legacy-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px; }
.legacy-modal { width: 100%; max-width: 480px; background: #171717; border: 1px solid #333; border-radius: 18px; padding: 24px; }
.legacy-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
.legacy-button-inline-primary { width: auto; min-width: 120px; }
.legacy-success { padding: 12px; border: 1px solid #22c55e; background: rgba(34,197,94,0.12); border-radius: 12px; color: #bbf7d0; margin-bottom: 12px; }
.legacy-series-cover { max-width: 220px; border-radius: 12px; margin: 12px 24px; display: block; }
@media (max-width: 900px) {
    .legacy-layout { display: block; }
    .legacy-sidebar { width: auto; display: flex; flex-wrap: wrap; gap: 8px; border-right: 0; border-bottom: 1px solid #242424; }
    .legacy-sidebar-brand { width: 100%; }
    .legacy-nav-button { width: auto; min-width: 120px; flex: 1; }
    .legacy-category-cards { grid-template-columns: 1fr; }
    .legacy-hero { height: 42vh; min-height: 260px; }
    .legacy-hero-title { font-size: 24px; }
}
`;

const modernRedirectScript = `
(function () {
  try {
    var search = window.location.search || '';
    if (search.indexOf('forceLegacy=1') !== -1) return;
    var ua = String(navigator.userAgent || '').toLowerCase();
    var isWebOs = ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1;
    var chromeMatch = ua.match(/chrome\\/(\\d+)/);
    var chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;
    var supportsModern = !(isWebOs && (!chromeVersion || chromeVersion < 72))
      && typeof Promise !== 'undefined'
      && typeof fetch !== 'undefined';
    if (!supportsModern) return;
    var params = new URLSearchParams(search);
    var redirectPath = params.get('redirect') || '/dashboard';
    params.delete('redirect');
    params.set('forceModern', '1');
    var query = params.toString();
    window.location.replace(redirectPath + (query ? '?' + query : '?forceModern=1'));
  } catch (e) {}
})();
`;

export default function LegacyPage() {
    return (
        <main className="legacy-shell">
            <script dangerouslySetInnerHTML={{ __html: modernRedirectScript }} />
            <style dangerouslySetInnerHTML={{ __html: legacyStyles }} />
            <div id="legacy-boot" className="legacy-loading" suppressHydrationWarning>
                Carregando XStream...
            </div>
            <div id="legacy-root" suppressHydrationWarning />
            <script src="/legacy/app.js" defer />
        </main>
    );
}
