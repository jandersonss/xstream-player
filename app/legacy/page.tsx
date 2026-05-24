export default function LegacyPage() {
    return (
        <main className="legacy-shell">
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        html, body { background: #0f0f0f; color: #fff; }
                        .legacy-shell { min-height: 100vh; background: #0f0f0f; color: #fff; font-family: Arial, Helvetica, sans-serif; }
                        .legacy-topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; background: #050505; border-bottom: 1px solid #242424; }
                        .legacy-brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 22px; }
                        .legacy-logo { width: 38px; height: 38px; border-radius: 10px; background: #dc2626; display: flex; align-items: center; justify-content: center; }
                        .legacy-layout { display: flex; min-height: calc(100vh - 75px); }
                        .legacy-sidebar { width: 230px; flex: 0 0 230px; background: #070707; border-right: 1px solid #242424; padding: 18px; }
                        .legacy-content { flex: 1; padding: 24px; overflow: auto; }
                        .legacy-nav-button, .legacy-button { width: 100%; border: 1px solid #333; background: #171717; color: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; text-align: left; font-weight: 700; cursor: pointer; }
                        .legacy-nav-button.active, .legacy-button.primary { background: #dc2626; border-color: #ef4444; }
                        .legacy-button.inline { width: auto; display: inline-block; margin-right: 10px; }
                        .legacy-button:focus, .legacy-nav-button:focus, .legacy-card:focus, input:focus { outline: 3px solid #fff; }
                        .legacy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
                        .legacy-card { min-height: 170px; border: 1px solid #303030; border-radius: 14px; background: #171717; color: #fff; padding: 14px; text-align: left; cursor: pointer; overflow: hidden; }
                        .legacy-card img { width: 100%; height: 210px; object-fit: cover; border-radius: 10px; background: #222; margin-bottom: 10px; }
                        .legacy-title { font-size: 28px; font-weight: 800; margin: 0 0 8px; }
                        .legacy-muted { color: #b3b3b3; }
                        .legacy-error { padding: 14px; border: 1px solid #ef4444; background: rgba(239,68,68,0.12); border-radius: 12px; color: #fecaca; margin-bottom: 16px; }
                        .legacy-panel { max-width: 520px; margin: 40px auto; background: #171717; border: 1px solid #333; border-radius: 18px; padding: 24px; }
                        .legacy-input { display: block; width: 100%; box-sizing: border-box; margin-bottom: 14px; padding: 14px; border-radius: 10px; border: 1px solid #404040; background: #0b0b0b; color: #fff; font-size: 16px; }
                        .legacy-player { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; flex-direction: column; }
                        .legacy-player video { width: 100%; height: 100%; flex: 1; background: #000; }
                        .legacy-player-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #111; border-bottom: 1px solid #333; }
                        .legacy-loading { padding: 24px; color: #ddd; }
                        @media (max-width: 800px) {
                            .legacy-layout { display: block; }
                            .legacy-sidebar { width: auto; display: flex; overflow-x: auto; gap: 10px; }
                            .legacy-nav-button { min-width: 130px; }
                            .legacy-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
                        }
                    `,
                }}
            />
            <div id="legacy-root">
                <div className="legacy-topbar">
                    <div className="legacy-brand">
                        <div className="legacy-logo">X</div>
                        <span>XStream Legacy</span>
                    </div>
                    <a href="/debug" className="legacy-muted">Debug</a>
                </div>
                <div className="legacy-loading">Carregando versão legacy...</div>
            </div>
            <script src="/legacy/app.js" defer />
        </main>
    );
}
