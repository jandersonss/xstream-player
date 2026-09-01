/*
 * XStream Player — TV bootstrap.
 *
 * What ships inside the .ipk/.wgt. It has one job: find the server, get this
 * device authorized, and hand control over to the server's own app.
 *
 * Why a bootstrap instead of packaging the whole UI: a packaged app loads from
 * `file://`, where the app's absolute asset paths resolve against the filesystem
 * root and `history.pushState` across directories is refused. Redirecting into
 * the server means the real app runs same-origin, exactly as it does in a
 * browser, so the TV client has every feature the web app has — by construction,
 * not by porting.
 *
 * ES5 only, no dependencies: this must also run on webOS 5 (Chromium 68).
 */
(function () {
    'use strict';

    var STORAGE_SERVER = 'xstream_server_url';
    var STORAGE_TOKEN = 'xstream_device_token';

    var POLL_INTERVAL_MS = 2000;
    var PROBE_TIMEOUT_MS = 6000;
    var KEY_BACK_TV = 461;
    var KEY_BACK_ANDROID = 4;

    var pairingId = null;
    var pollTimer = null;
    var codeExpiresAt = 0;
    var polling = false;

    // --- storage -----------------------------------------------------------

    /**
     * In-memory mirror of the stored values, and the source of truth while the app
     * is running.
     *
     * A packaged app is loaded from `file://`, and Chromium refuses `localStorage`
     * on that origin on some TV firmware — the accessor throws. Reading straight
     * from storage on every use would then lose the server address between the
     * setup screen and the next poll, and the polling would fire at nothing. So
     * storage is only ever used to persist across boots: within a session the
     * memory copy answers.
     */
    var memory = {};

    function read(key) {
        if (Object.prototype.hasOwnProperty.call(memory, key)) {
            return memory[key];
        }

        var value = '';
        try {
            value = window.localStorage.getItem(key) || '';
        } catch (e) {
            value = '';
        }

        memory[key] = value;
        return value;
    }

    function write(key, value) {
        memory[key] = value || '';

        try {
            if (value) {
                window.localStorage.setItem(key, value);
            } else {
                window.localStorage.removeItem(key);
            }
        } catch (e) {
            // Storage unavailable: the app still works for this session, it just
            // asks for the address and pairs again on the next boot.
        }
    }

    // --- dom helpers -------------------------------------------------------

    function $(id) {
        return document.getElementById(id);
    }

    var SCREENS = ['screen-loading', 'screen-setup', 'screen-pair', 'screen-error'];

    function show(id) {
        for (var i = 0; i < SCREENS.length; i++) {
            var element = $(SCREENS[i]);
            if (SCREENS[i] === id) {
                element.className = 'screen';
            } else if (element.className.indexOf('hidden') === -1) {
                element.className = 'screen hidden';
            }
        }

        // Move the remote's focus into the screen that just appeared, otherwise
        // the D-pad has nothing to act on.
        var focusable = $(id).querySelector('[data-focusable="true"]');
        if (focusable) {
            try { focusable.focus(); } catch (e) { /* ignore */ }
        }
    }

    function setText(id, text) {
        $(id).innerHTML = '';
        $(id).appendChild(document.createTextNode(text));
    }

    /**
     * Shows the scan-to-approve QR next to the code, when the server sent one.
     * Older servers (or a reverse proxy that hides the host) omit it — then the
     * typed code is the only path and the column stays hidden.
     */
    function showPairingQr(dataUri) {
        var col = $('pair-qr-col');
        if (dataUri && typeof dataUri === 'string' && dataUri.indexOf('data:image/') === 0) {
            $('pair-qr').src = dataUri;
            col.className = 'pair-qr-col';
        } else {
            $('pair-qr').src = '';
            col.className = 'pair-qr-col hidden';
        }
    }

    // --- server url --------------------------------------------------------

    /**
     * Turns what someone typed on a remote into a base URL. Typing on a TV is
     * painful, so the field accepts the shortest identifying form and fills in
     * the scheme and the default port.
     */
    function normalizeServerUrl(input) {
        var value = String(input || '').replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');

        if (!value) return '';
        if (!/^https?:\/\//i.test(value)) {
            value = 'http://' + value;
        }

        var match = /^(https?):\/\/([^/:\s]+)(?::(\d+))?$/i.exec(value);
        if (!match) return '';

        var scheme = match[1].toLowerCase();
        var host = match[2];
        var port = match[3];

        if (!port && scheme === 'http') {
            port = '3000';
        }

        return scheme + '://' + host + (port ? ':' + port : '');
    }

    // --- http --------------------------------------------------------------

    /**
     * XHR rather than fetch: webOS 5's Chromium 68 has no fetch worth relying on.
     * `bearer` is only used for the token check before handing over to the server.
     */
    function request(method, url, body, onDone, bearer) {
        var xhr = new XMLHttpRequest();
        var settled = false;

        function finish(status, text) {
            if (settled) return;
            settled = true;
            onDone(status, text);
        }

        try {
            xhr.open(method, url, true);
        } catch (e) {
            finish(0, '');
            return;
        }

        // Watchdog on our own timer instead of trusting the XHR's.
        //
        // On the Chromium these TVs ship (as old as 53), `xhr.timeout` /
        // `ontimeout` are unreliable and a request refused before it starts — a
        // blocked cross-origin call, a host that never answers — can leave
        // `onreadystatechange` silent forever. Every caller here drives a screen,
        // so a request that never settles is a screen that never moves.
        var watchdog = window.setTimeout(function () { finish(0, ''); }, PROBE_TIMEOUT_MS);

        var settle = function (status, text) {
            window.clearTimeout(watchdog);
            finish(status, text);
        };

        xhr.timeout = PROBE_TIMEOUT_MS;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                settle(xhr.status, xhr.responseText);
            }
        };
        xhr.ontimeout = function () { settle(0, ''); };
        xhr.onerror = function () { settle(0, ''); };

        if (bearer) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + bearer);
        }

        try {
            if (body) {
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify(body));
            } else {
                xhr.send();
            }
        } catch (e) {
            // Some firmware throws here instead of firing onerror.
            settle(0, '');
        }
    }

    function parseJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    // --- device identity ---------------------------------------------------

    function detectPlatform() {
        var ua = String(navigator.userAgent || '').toLowerCase();

        if (ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1) return 'webos';
        if (ua.indexOf('tizen') !== -1) return 'tizen';
        if (ua.indexOf('android') !== -1) return 'androidtv';
        return 'browser';
    }

    var PLATFORM_LABELS = {
        webos: 'Smart TV (LG)',
        tizen: 'Smart TV (Samsung)',
        androidtv: 'Android TV',
        browser: 'Navegador'
    };

    /**
     * Asks the platform for a real model name, falling back to a generic label.
     * The name is only a suggestion — the owner renames the device when approving.
     */
    function getDeviceName(callback) {
        var platform = detectPlatform();
        var fallback = PLATFORM_LABELS[platform] || 'Aparelho';
        var settled = false;

        function finish(name) {
            if (settled) return;
            settled = true;
            callback(name || fallback);
        }

        setTimeout(function () { finish(fallback); }, 2000);

        try {
            if (platform === 'webos' && window.webOS && window.webOS.service) {
                window.webOS.service.request('luna://com.webos.service.tv.systemproperty', {
                    method: 'getSystemInfo',
                    parameters: { keys: ['modelName'] },
                    onSuccess: function (response) { finish(response && response.modelName); },
                    onFailure: function () { finish(fallback); }
                });
                return;
            }

            if (platform === 'tizen' && window.tizen && window.tizen.systeminfo) {
                finish(window.tizen.systeminfo.getCapability('http://tizen.org/system/model_name'));
                return;
            }
        } catch (e) {
            finish(fallback);
        }
    }

    // --- flow --------------------------------------------------------------

    function showError(title, message) {
        stopPolling();
        setText('error-title', title);
        setText('error-message', message);
        show('screen-error');
    }

    function enterApp(serverUrl, token) {
        // The server swaps the device token for a session on its own origin and
        // sends the TV into the app, so everything past this point is the real
        // web app running same-origin — nothing is reimplemented here.
        window.location.replace(
            serverUrl + '/api/devices/session?token=' + encodeURIComponent(token)
        );
    }

    function start() {
        var serverUrl = read(STORAGE_SERVER);
        var token = read(STORAGE_TOKEN);

        if (!serverUrl) {
            $('host-input').value = '';
            show('screen-setup');
            return;
        }

        if (!token) {
            beginPairing();
            return;
        }

        show('screen-loading');

        // Check the token before navigating away. Once the TV leaves for the
        // server's origin there is no way back into this bootstrap, so a device
        // that was revoked would land on the server's login page with no route to
        // pair again. Any authenticated endpoint answers the question; the config
        // one is the cheapest.
        request('GET', serverUrl + '/api/config', null, function (status) {
            if (status === 401 || status === 403) {
                // The device was revoked — usually because the owner chose "trocar
                // servidor" on the server. Land on setup (not straight into a new
                // code) with the current address filled in, so re-pairing here or
                // pointing at another server are both one step away.
                write(STORAGE_TOKEN, '');
                $('host-input').value = serverUrl;
                setText('setup-note', 'Este aparelho foi desconectado. Confirme o servidor para parear de novo, ou informe outro endereço.');
                $('setup-note').className = 'note';
                show('screen-setup');
                return;
            }

            if (status < 200 || status >= 300) {
                showError(
                    'Servidor fora do ar',
                    'Não foi possível falar com o servidor. Verifique se ele está ligado e na mesma rede.'
                );
                return;
            }

            enterApp(serverUrl, token);
        }, token);
    }

    function handleSetupSubmit() {
        var baseUrl = normalizeServerUrl($('host-input').value);
        var errorNode = $('setup-error');

        if (!baseUrl) {
            setText('setup-error', 'Endereço inválido. Use algo como 192.168.0.10:3000');
            errorNode.className = 'error';
            return;
        }

        errorNode.className = 'error hidden';
        $('host-submit').disabled = true;
        setText('host-submit', 'Testando conexão…');

        // The remote-access state is the only endpoint that answers with no
        // credentials at all, which is exactly what "is the server there?" needs.
        request('GET', baseUrl + '/api/remote-access', null, function (status) {
            $('host-submit').disabled = false;
            setText('host-submit', 'Continuar');

            if (status < 200 || status >= 400) {
                setText(
                    'setup-error',
                    'Não foi possível falar com ' + baseUrl +
                    '. Verifique o endereço e se o servidor está ligado.'
                );
                errorNode.className = 'error';
                return;
            }

            write(STORAGE_SERVER, baseUrl);
            beginPairing();
        });
    }

    function beginPairing() {
        var serverUrl = read(STORAGE_SERVER);

        if (!serverUrl) {
            show('screen-setup');
            return;
        }

        show('screen-loading');

        getDeviceName(function (deviceName) {
            request('POST', serverUrl + '/api/devices/pair/start', {
                deviceName: deviceName,
                platform: detectPlatform()
            }, function (status, text) {
                var data = parseJson(text);

                if (status < 200 || status >= 300 || !data || !data.code) {
                    showError(
                        'Servidor fora do ar',
                        'Não foi possível pedir um código de pareamento. Verifique se o servidor está ligado e na mesma rede.'
                    );
                    return;
                }

                pairingId = data.pairingId;
                codeExpiresAt = data.expiresAt || 0;
                setText('pair-code', data.code);
                showPairingQr(data.qr);
                show('screen-pair');
                startPolling();
            });
        });
    }

    /**
     * Polls in a self-rescheduling chain rather than on an interval.
     *
     * Two reasons. The token is delivered exactly once, so two requests in flight
     * at the same time would race: one takes the token and the other is told the
     * pairing is gone. And on a slow TV an interval can queue faster than the
     * requests come back. Each poll only schedules the next one after it settles.
     */
    function startPolling() {
        stopPolling();
        polling = true;
        pollOnce();
    }

    function stopPolling() {
        polling = false;

        if (pollTimer) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function scheduleNextPoll() {
        if (!polling) return;
        pollTimer = window.setTimeout(pollOnce, POLL_INTERVAL_MS);
    }

    function remainingLabel() {
        if (!codeExpiresAt) return 'Aguardando aprovação…';

        var left = Math.max(0, Math.floor((codeExpiresAt - new Date().getTime()) / 1000));
        var minutes = Math.floor(left / 60);
        var seconds = left % 60;

        return 'Expira em ' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds +
            ' · aguardando aprovação…';
    }

    function pollOnce() {
        // The chain must survive anything this tick throws: a poll that dies
        // silently strands the TV on the code screen with no way forward.
        try {
            var serverUrl = read(STORAGE_SERVER);

            if (!pairingId || !serverUrl) {
                scheduleNextPoll();
                return;
            }

            setText('pair-status', remainingLabel());
        } catch (e) {
            scheduleNextPoll();
            return;
        }

        request('POST', serverUrl + '/api/devices/pair/poll', { pairingId: pairingId },
            function (status, text) {
                if (status < 200 || status >= 300) {
                    // A dropped request is routine on TV Wi-Fi; the next tick retries.
                    scheduleNextPoll();
                    return;
                }

                var data = parseJson(text);

                if (!data) {
                    scheduleNextPoll();
                    return;
                }

                if (data.status === 'approved' && data.token) {
                    stopPolling();
                    write(STORAGE_TOKEN, data.token);
                    enterApp(serverUrl, data.token);
                    return;
                }

                if (data.status === 'expired') {
                    showError(
                        'O código expirou',
                        'Gere um novo código e aprove no servidor antes que ele expire.'
                    );
                    return;
                }

                scheduleNextPoll();
            });
    }

    function forgetServer() {
        stopPolling();
        write(STORAGE_SERVER, '');
        write(STORAGE_TOKEN, '');
        $('host-input').value = '';
        $('setup-error').className = 'error hidden';
        $('setup-note').className = 'note hidden';
        show('screen-setup');
    }

    // --- wiring ------------------------------------------------------------

    function onBackKey(event) {
        if (event.keyCode !== KEY_BACK_TV && event.keyCode !== KEY_BACK_ANDROID) return;

        event.preventDefault();

        // Back from the very first screen leaves the app; anywhere else it walks
        // one step back in the flow.
        if ($('screen-setup').className.indexOf('hidden') === -1) {
            exitApp();
        } else {
            forgetServer();
        }
    }

    function exitApp() {
        try {
            if (window.webOS && window.webOS.platformBack) {
                window.webOS.platformBack();
                return;
            }
            if (window.tizen && window.tizen.application) {
                window.tizen.application.getCurrentApplication().exit();
                return;
            }
        } catch (e) {
            // Fall through to the generic close below.
        }

        window.close();
    }

    function init() {
        $('host-submit').onclick = handleSetupSubmit;

        $('host-input').onkeydown = function (event) {
            if (event.keyCode === 13) {
                handleSetupSubmit();
            }
        };

        $('pair-change').onclick = forgetServer;
        $('error-change').onclick = forgetServer;
        $('error-retry').onclick = start;

        document.addEventListener('keydown', onBackKey, false);

        try {
            if (window.tizen && window.tizen.tvinputdevice) {
                window.tizen.tvinputdevice.registerKey('Back');
            }
        } catch (e) {
            // Older firmware delivers Back without registration.
        }

        start();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init, false);
    }
})();
