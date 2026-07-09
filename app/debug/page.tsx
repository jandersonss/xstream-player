const debugScript = `
(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function text(id, value) {
    var element = byId(id);
    if (element) element.textContent = value;
  }

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback;
    }
  }

  function canUseLocalStorage() {
    return safe(function () {
      var key = '__xstream_debug__';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    }, false);
  }

  function localStorageValue(key) {
    return safe(function () {
      return window.localStorage.getItem(key);
    }, null);
  }

  function chromeVersion() {
    var match = String(navigator.userAgent || '').match(/(?:chrome|chromium)\\/(\\d+)/i);
    return match ? match[1] : 'nao identificado';
  }

  function statusClass(status) {
    if (status === 'fail') return 'debug-pill debug-fail';
    if (status === 'warn') return 'debug-pill debug-warn';
    return 'debug-pill debug-ok';
  }

  function addInfo(label, value) {
    var container = byId('browser-info');
    if (!container) return;

    var item = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = label + ': ';
    item.appendChild(strong);
    item.appendChild(document.createTextNode(value || 'indisponivel'));
    container.appendChild(item);
  }

  function addCheck(name, status, detail) {
    var container = byId('checks');
    if (!container) return;

    var card = document.createElement('div');
    card.className = 'debug-card';

    var header = document.createElement('div');
    header.className = 'debug-card-header';

    var title = document.createElement('h3');
    title.textContent = name;

    var pill = document.createElement('span');
    pill.className = statusClass(status);
    pill.textContent = status === 'fail' ? 'FALHA' : status === 'warn' ? 'ATENCAO' : 'OK';

    var description = document.createElement('p');
    description.className = 'debug-detail';
    description.textContent = detail;

    header.appendChild(title);
    header.appendChild(pill);
    card.appendChild(header);
    card.appendChild(description);
    container.appendChild(card);
  }

  function buildChecks() {
    var video = document.createElement('video');
    var canPlay = !!(video && typeof video.canPlayType === 'function');
    var nativeHls = canPlay && (
      video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
      video.canPlayType('application/x-mpegURL') !== ''
    );
    var mp4H264 = canPlay && video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== '';
    var mediaSource = 'MediaSource' in window;
    var sourceBuffer = 'SourceBuffer' in window;
    var blobUrl = 'Blob' in window && 'URL' in window && typeof URL.createObjectURL === 'function';
    var localStorageOk = canUseLocalStorage();
    var hasAuth = !!localStorageValue('xstream_auth');
    var hasNextData = !!byId('__NEXT_DATA__');

    return [
      ['Script de debug', 'ok', 'Este script simples executou no navegador.'],
      ['Dados do Next.js', hasNextData ? 'ok' : 'warn', hasNextData ? '__NEXT_DATA__ encontrado' : '__NEXT_DATA__ nao encontrado'],
      ['JavaScript moderno', typeof Promise !== 'undefined' && typeof Object.assign === 'function' ? 'ok' : 'fail', typeof Promise !== 'undefined' ? 'Promise disponivel' : 'Promise ausente'],
      ['Promise.finally', typeof Promise !== 'undefined' && Promise.prototype && typeof Promise.prototype.finally === 'function' ? 'ok' : 'warn', typeof Promise !== 'undefined' && Promise.prototype && typeof Promise.prototype.finally === 'function' ? 'Nativo ou polyfill ativo' : 'Polyfill pode ser necessario'],
      ['Requisicoes HTTP', typeof fetch === 'function' || typeof XMLHttpRequest !== 'undefined' ? 'ok' : 'fail', typeof fetch === 'function' ? 'fetch disponivel' : typeof XMLHttpRequest !== 'undefined' ? 'XHR disponivel' : 'fetch/XHR ausentes'],
      ['Sincronizacao de lista', typeof XMLHttpRequest !== 'undefined' ? 'ok' : 'fail', typeof XMLHttpRequest !== 'undefined' ? 'XHR suportado para sincronizacao' : 'XHR ausente'],
      ['Cache de dados', 'ok', 'SQLite server-side via API'],
      ['Sessao local', localStorageOk ? 'ok' : 'fail', localStorageOk ? 'localStorage gravavel' : 'localStorage bloqueado'],
      ['Login salvo', hasAuth ? 'ok' : 'warn', hasAuth ? 'xstream_auth encontrado no localStorage' : 'xstream_auth nao encontrado'],
      ['Cookies', navigator.cookieEnabled ? 'ok' : 'warn', navigator.cookieEnabled ? 'Cookies habilitados' : 'Cookies desabilitados'],
      ['Blob/Object URL', blobUrl ? 'ok' : 'warn', blobUrl ? 'Necessario para legendas salvo' : 'Legendas locais podem falhar'],
      ['AbortController', typeof AbortController !== 'undefined' ? 'ok' : 'warn', typeof AbortController !== 'undefined' ? 'Cancelamento de requests disponivel' : 'Usando fallback/timeout simples'],
      ['Elemento de video', canPlay ? 'ok' : 'fail', canPlay ? 'HTMLVideoElement OK' : 'Video HTML nao suportado'],
      ['HLS para canais ao vivo', nativeHls || mediaSource ? 'ok' : 'fail', nativeHls ? 'HLS nativo suportado' : mediaSource ? 'MediaSource disponivel para HLS.js' : 'Sem HLS nativo e sem MediaSource'],
      ['MediaSource/HLS.js', mediaSource && sourceBuffer ? 'ok' : nativeHls ? 'warn' : 'fail', mediaSource && sourceBuffer ? 'MSE e SourceBuffer disponiveis' : nativeHls ? 'Sem MSE, mas HLS nativo pode tocar' : 'MSE indisponivel'],
      ['MP4 H.264/AAC', mp4H264 ? 'ok' : 'warn', mp4H264 ? 'MP4 H.264/AAC suportado' : 'Codec MP4 nao confirmado pelo navegador'],
      ['Fullscreen', document.fullscreenEnabled || 'webkitFullscreenEnabled' in document ? 'ok' : 'warn', document.fullscreenEnabled ? 'Fullscreen padrao disponivel' : 'Pode depender de fullscreen nativo da TV'],
      ['Legendas HTML5', 'textTracks' in video ? 'ok' : 'warn', 'textTracks' in video ? 'TextTracks disponivel' : 'TextTracks nao identificado']
    ];
  }

  window.onerror = function (message, source, lineno, colno) {
    text('last-error', String(message || 'Erro desconhecido') + ' em ' + String(source || '-') + ':' + String(lineno || '-'));
  };

  function runDebug() {
    var info = byId('browser-info');
    var checksContainer = byId('checks');
    if (info) info.innerHTML = '';
    if (checksContainer) checksContainer.innerHTML = '';

    addInfo('Chrome/Chromium', chromeVersion());
    addInfo('Plataforma', navigator.platform || 'nao informado');
    addInfo('Idioma', navigator.language || 'nao informado');
    addInfo('Online', navigator.onLine ? 'sim' : 'nao');
    addInfo('Cookies', navigator.cookieEnabled ? 'sim' : 'nao');
    addInfo('Tela', String(window.screen.width) + 'x' + String(window.screen.height));
    addInfo('Viewport', String(window.innerWidth) + 'x' + String(window.innerHeight));
    addInfo('Memoria', navigator.deviceMemory ? String(navigator.deviceMemory) + ' GB' : 'indisponivel');
    addInfo('CPU', navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'indisponivel');
    addInfo('User-Agent', navigator.userAgent || 'indisponivel');
    text('last-error', 'Nenhum erro capturado nesta pagina.');

    var checks = buildChecks();
    var failures = 0;
    var warnings = 0;
    for (var i = 0; i < checks.length; i++) {
      if (checks[i][1] === 'fail') failures++;
      if (checks[i][1] === 'warn') warnings++;
      addCheck(checks[i][0], checks[i][1], checks[i][2]);
    }

    var summary = failures > 0 ? 'Ha falhas de compatibilidade' : warnings > 0 ? 'Ha avisos de compatibilidade' : 'Compatibilidade principal OK';
    text('summary-title', summary);
    text('summary-detail', 'Checks executados: ' + checks.length + '. Falhas: ' + failures + '. Avisos: ' + warnings + '.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDebug);
  } else {
    runDebug();
  }
})();
`;

export default function DebugPage() {
    return (
        <main className="min-h-screen bg-[#111] text-white px-5 py-6">
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        .debug-card { border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
                        .debug-card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
                        .debug-card-header h3 { font-size: 18px; font-weight: 600; margin: 0; }
                        .debug-detail { margin-top: 8px; font-size: 14px; color: #d1d5db; word-break: break-word; }
                        .debug-pill { display: inline-block; width: fit-content; border-radius: 999px; border: 1px solid; padding: 4px 12px; font-size: 12px; font-weight: 700; }
                        .debug-ok { color: #6ee7b7; background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.3); }
                        .debug-warn { color: #fef08a; background: rgba(234,179,8,0.15); border-color: rgba(234,179,8,0.3); }
                        .debug-fail { color: #fca5a5; background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }
                        #browser-info { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: 14px; }
                        #browser-info p { margin: 0; word-break: break-word; }
                        @media (max-width: 700px) { #browser-info { grid-template-columns: 1fr; } .debug-card-header { align-items: flex-start; flex-direction: column; } }
                    `,
                }}
            />
            <div className="mx-auto max-w-5xl">
                <div className="mb-6">
                    <form action="/" method="get">
                        <button type="submit" className="text-red-300 underline font-semibold">
                            Voltar ao app
                        </button>
                    </form>
                    <h1 className="mt-4 text-3xl font-bold">Diagnostico do navegador</h1>
                    <p className="mt-2 text-gray-300">
                        Checklist independente de React para TVs/browsers antigos.
                    </p>
                </div>

                <section className="mb-6 rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-4">
                    <h2 id="summary-title" className="text-xl font-bold">Aguardando diagnostico...</h2>
                    <p id="summary-detail" className="mt-1 text-sm text-gray-200">
                        Se esta mensagem nao mudar, o JavaScript basico tambem nao executou neste navegador.
                    </p>
                </section>

                <section className="mb-6 rounded-xl border border-white/10 bg-black/30 p-4">
                    <h2 className="mb-3 text-xl font-bold">Informacoes do browser</h2>
                    <div id="browser-info">
                        <p className="text-gray-300">Aguardando script de diagnostico...</p>
                    </div>
                </section>

                <section className="mb-6 rounded-xl border border-white/10 bg-black/30 p-4">
                    <h2 className="mb-3 text-xl font-bold">Ultimo erro JavaScript capturado</h2>
                    <p id="last-error" className="text-sm text-gray-300">Aguardando script de diagnostico...</p>
                </section>

                <section id="checks">
                    <div className="debug-card">
                        <div className="debug-card-header">
                            <h3>Script de diagnostico</h3>
                            <span className="debug-pill debug-warn">AGUARDANDO</span>
                        </div>
                        <p className="debug-detail">Aguardando execucao do script simples da pagina.</p>
                    </div>
                </section>
            </div>
            <script dangerouslySetInnerHTML={{ __html: debugScript }} />
        </main>
    );
}
