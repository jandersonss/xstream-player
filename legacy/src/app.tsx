import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

type ContentType = 'live' | 'movie' | 'series';

interface Credentials {
    hostUrl: string;
    username: string;
    password: string;
}

interface AuthData {
    credentials: Credentials;
    user?: {
        username?: string;
        status?: string;
        exp_date?: string;
    };
    server?: {
        url?: string;
        timezone?: string;
    };
}

interface Category {
    category_id: string;
    category_name: string;
}

interface StreamItem {
    stream_id?: number | string;
    series_id?: number | string;
    name?: string;
    title?: string;
    stream_icon?: string;
    cover?: string;
    rating?: string | number;
    container_extension?: string;
    category_id?: string;
}

interface Episode {
    id: string;
    episode_num?: string | number;
    title?: string;
    container_extension?: string;
    season?: string | number;
}

interface SeriesInfo {
    info?: {
        name?: string;
        cover?: string;
    };
    episodes?: Record<string, Episode[]>;
}

interface PlayerState {
    title: string;
    src: string;
    poster?: string;
}

const AUTH_KEY = 'xstream_auth';
const PLACEHOLDER = 'https://via.placeholder.com/300x450?text=Sem+Capa';

function requestJson<T>(url: string, method: string, body?: unknown, timeoutMs = 20000): Promise<T> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.timeout = timeoutMs;
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onreadystatechange = () => {
            if (xhr.readyState !== 4) return;

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(xhr.responseText ? JSON.parse(xhr.responseText) as T : {} as T);
                } catch (error) {
                    reject(error);
                }
                return;
            }

            reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
        };

        xhr.onerror = () => reject(new Error('Erro de rede'));
        xhr.ontimeout = () => reject(new Error('Tempo esgotado na requisicao'));
        xhr.send(body ? JSON.stringify(body) : undefined);
    });
}

function readStoredAuth(): AuthData | null {
    try {
        const raw = window.localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AuthData;
        if (!parsed.credentials) return null;
        return parsed;
    } catch {
        window.localStorage.removeItem(AUTH_KEY);
        return null;
    }
}

function saveAuth(auth: AuthData) {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function removeAuth() {
    window.localStorage.removeItem(AUTH_KEY);
}

function proxy<T>(credentials: Credentials, action: string, params?: Record<string, string | number>): Promise<T> {
    return requestJson<T>('/api/proxy', 'POST', {
        ...credentials,
        action,
        ...(params || {}),
    }, 30000);
}

function contentId(item: StreamItem, type: ContentType) {
    return String(type === 'series' ? item.series_id : item.stream_id);
}

function contentName(item: StreamItem) {
    return item.name || item.title || 'Sem nome';
}

function contentImage(item: StreamItem) {
    return item.stream_icon || item.cover || PLACEHOLDER;
}

function streamUrl(credentials: Credentials, type: ContentType, id: string, extension?: string) {
    const base = credentials.hostUrl.replace(/\/$/, '');
    if (type === 'live') {
        return `${base}/live/${credentials.username}/${credentials.password}/${id}.m3u8`;
    }
    if (type === 'movie') {
        return `${base}/movie/${credentials.username}/${credentials.password}/${id}.${extension || 'mp4'}`;
    }
    return `${base}/series/${credentials.username}/${credentials.password}/${id}.${extension || 'mp4'}`;
}

function categoryAction(type: ContentType) {
    if (type === 'movie') return 'get_vod_categories';
    if (type === 'series') return 'get_series_categories';
    return 'get_live_categories';
}

function streamsAction(type: ContentType) {
    if (type === 'movie') return 'get_vod_streams';
    if (type === 'series') return 'get_series';
    return 'get_live_streams';
}

function LoginScreen({ onLogin }: { onLogin: (auth: AuthData) => void }) {
    const [hostUrl, setHostUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');

        requestJson<{ user_info?: AuthData['user']; server_info?: AuthData['server']; error?: string }>('/api/auth/login', 'POST', {
            hostUrl,
            username,
            password,
        }, 30000)
            .then(data => {
                if (data.error) throw new Error(data.error);
                const auth: AuthData = {
                    credentials: { hostUrl, username, password },
                    user: data.user_info,
                    server: data.server_info,
                };
                saveAuth(auth);
                onLogin(auth);
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Falha no login'))
            .finally(() => setLoading(false));
    };

    return (
        <div>
            <div className="legacy-topbar">
                <div className="legacy-brand">
                    <div className="legacy-logo">X</div>
                    <span>XStream Legacy</span>
                </div>
                <a href="/debug" className="legacy-muted">Debug</a>
            </div>
            <form className="legacy-panel" onSubmit={submit}>
                <h1 className="legacy-title">Entrar</h1>
                <p className="legacy-muted">Versao React legacy para TVs WebOS antigas.</p>
                {error && <div className="legacy-error">{error}</div>}
                <input className="legacy-input" value={hostUrl} onChange={event => setHostUrl(event.target.value)} placeholder="URL do servidor" />
                <input className="legacy-input" value={username} onChange={event => setUsername(event.target.value)} placeholder="Usuario" />
                <input className="legacy-input" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha" type="password" />
                <button className="legacy-button primary" type="submit" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                </button>
            </form>
        </div>
    );
}

function Player({ player, onClose }: { player: PlayerState; onClose: () => void }) {
    return (
        <div className="legacy-player">
            <div className="legacy-player-bar">
                <strong>{player.title}</strong>
                <button className="legacy-button inline" onClick={onClose}>Voltar</button>
            </div>
            <video src={player.src} poster={player.poster} controls autoPlay />
        </div>
    );
}

function LegacyApp() {
    const [auth, setAuth] = useState<AuthData | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [activeType, setActiveType] = useState<ContentType>('live');
    const [categories, setCategories] = useState<Category[]>([]);
    const [items, setItems] = useState<StreamItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [player, setPlayer] = useState<PlayerState | null>(null);

    useEffect(() => {
        const stored = readStoredAuth();
        if (stored) {
            setAuth(stored);
            setLoadingAuth(false);
            return;
        }

        requestJson<Partial<AuthData>>('/api/config', 'GET', undefined, 7000)
            .then(data => {
                if (data.credentials) {
                    const nextAuth = data as AuthData;
                    saveAuth(nextAuth);
                    setAuth(nextAuth);
                }
            })
            .catch(() => undefined)
            .finally(() => setLoadingAuth(false));
    }, []);

    useEffect(() => {
        if (!auth) return;
        loadCategories(activeType);
    }, [auth, activeType]);

    const navItems = useMemo(() => [
        { type: 'live' as ContentType, label: 'TV ao vivo' },
        { type: 'movie' as ContentType, label: 'Filmes' },
        { type: 'series' as ContentType, label: 'Series' },
    ], []);

    const loadCategories = (type: ContentType) => {
        if (!auth) return;
        setLoading(true);
        setError('');
        setItems([]);
        setSeriesInfo(null);
        setSelectedCategory(null);

        proxy<Category[]>(auth.credentials, categoryAction(type))
            .then(data => setCategories(Array.isArray(data) ? data : []))
            .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar categorias'))
            .finally(() => setLoading(false));
    };

    const loadCategoryItems = (category: Category) => {
        if (!auth) return;
        setLoading(true);
        setError('');
        setSelectedCategory(category);
        setSeriesInfo(null);

        proxy<StreamItem[]>(auth.credentials, streamsAction(activeType), { category_id: category.category_id })
            .then(data => setItems(Array.isArray(data) ? data.slice(0, 120) : []))
            .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar conteudo'))
            .finally(() => setLoading(false));
    };

    const openItem = (item: StreamItem) => {
        if (!auth) return;
        const id = contentId(item, activeType);
        if (activeType === 'series') {
            setLoading(true);
            setError('');
            proxy<SeriesInfo>(auth.credentials, 'get_series_info', { series_id: id })
                .then(data => setSeriesInfo(data))
                .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar serie'))
                .finally(() => setLoading(false));
            return;
        }

        setPlayer({
            title: contentName(item),
            src: streamUrl(auth.credentials, activeType, id, item.container_extension),
            poster: contentImage(item),
        });
    };

    const openEpisode = (episode: Episode) => {
        if (!auth) return;
        setPlayer({
            title: episode.title || `Episodio ${episode.episode_num || ''}`,
            src: streamUrl(auth.credentials, 'series', String(episode.id), episode.container_extension),
            poster: seriesInfo?.info?.cover,
        });
    };

    const logout = () => {
        removeAuth();
        setAuth(null);
        setCategories([]);
        setItems([]);
    };

    if (loadingAuth) {
        return <div className="legacy-loading">Carregando sessao legacy...</div>;
    }

    if (!auth) {
        return <LoginScreen onLogin={setAuth} />;
    }

    const seasons = seriesInfo && seriesInfo.episodes ? Object.keys(seriesInfo.episodes) : [];

    return (
        <div>
            {player && <Player player={player} onClose={() => setPlayer(null)} />}
            <div className="legacy-topbar">
                <div className="legacy-brand">
                    <div className="legacy-logo">X</div>
                    <span>XStream Legacy</span>
                </div>
                <div>
                    <span className="legacy-muted">{auth.user?.username || auth.credentials.username}</span>
                    <button className="legacy-button inline" onClick={logout}>Sair</button>
                </div>
            </div>
            <div className="legacy-layout">
                <aside className="legacy-sidebar">
                    {navItems.map(item => (
                        <button
                            key={item.type}
                            className={`legacy-nav-button ${activeType === item.type ? 'active' : ''}`}
                            onClick={() => setActiveType(item.type)}
                        >
                            {item.label}
                        </button>
                    ))}
                    <button className="legacy-nav-button" onClick={() => loadCategories(activeType)}>Recarregar</button>
                    <button className="legacy-nav-button" onClick={() => window.location.href = '/debug'}>Debug</button>
                    <button className="legacy-nav-button" onClick={() => window.location.href = '/dashboard?forceModern=1'}>App moderno</button>
                </aside>
                <section className="legacy-content">
                    <h1 className="legacy-title">
                        {selectedCategory ? selectedCategory.category_name : 'Categorias'}
                    </h1>
                    <p className="legacy-muted">
                        Versao simplificada em React para WebOS antigo. Carrega conteudo sob demanda.
                    </p>
                    {error && <div className="legacy-error">{error}</div>}
                    {loading && <div className="legacy-loading">Carregando...</div>}

                    {seriesInfo && (
                        <div>
                            <button className="legacy-button inline" onClick={() => setSeriesInfo(null)}>Voltar para series</button>
                            <h2>{seriesInfo.info?.name || 'Serie'}</h2>
                            {seasons.map(season => (
                                <div key={season}>
                                    <h3>Temporada {season}</h3>
                                    <div className="legacy-grid">
                                        {(seriesInfo.episodes?.[season] || []).map(episode => (
                                            <button key={episode.id} className="legacy-card" onClick={() => openEpisode(episode)}>
                                                <strong>{episode.episode_num}. {episode.title || 'Episodio'}</strong>
                                                <p className="legacy-muted">{episode.container_extension || 'video'}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!seriesInfo && !selectedCategory && (
                        <div className="legacy-grid">
                            {categories.map(category => (
                                <button key={category.category_id} className="legacy-card" onClick={() => loadCategoryItems(category)}>
                                    <strong>{category.category_name}</strong>
                                </button>
                            ))}
                        </div>
                    )}

                    {!seriesInfo && selectedCategory && (
                        <div>
                            <button className="legacy-button inline" onClick={() => setSelectedCategory(null)}>Voltar para categorias</button>
                            <div className="legacy-grid">
                                {items.map(item => (
                                    <button key={contentId(item, activeType)} className="legacy-card" onClick={() => openItem(item)}>
                                        <img src={contentImage(item)} alt={contentName(item)} />
                                        <strong>{contentName(item)}</strong>
                                        {item.rating && <p className="legacy-muted">Nota: {item.rating}</p>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

const rootElement = document.getElementById('legacy-root');

if (rootElement) {
    createRoot(rootElement).render(<LegacyApp />);
}
