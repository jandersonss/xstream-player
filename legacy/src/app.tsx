import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

type ContentType = 'live' | 'movie' | 'series';
type AppView = 'home' | ContentType;

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
        max_connections?: string;
        active_cons?: string;
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
    plot?: string;
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
        plot?: string;
    };
    episodes?: Record<string, Episode[]>;
}

interface PlayerState {
    title: string;
    src: string;
    poster?: string;
}

interface WatchProgress {
    streamId: string | number;
    type: 'movie' | 'series';
    progress: number;
    duration: number;
    timestamp: number;
    name: string;
    image?: string;
    episodeId?: string | number;
    seriesId?: string | number;
}

interface HeroItem {
    id: string;
    title: string;
    description: string;
    backdrop: string;
    type: 'movie' | 'series';
    rating: string;
}

const AUTH_KEY = 'xstream_auth';
const PROGRESS_KEY = 'xstream_watch_progress';
const PLACEHOLDER = 'https://via.placeholder.com/300x450?text=Sem+Capa';
const HERO_INTERVAL_MS = 30000;

const LOGIN_BG = 'https://assets.nflxext.com/ffe/siteui/vlv3/c38a2d52-138e-48a3-ab68-36787ece46b3/eeb03fc9-99c6-438e-82d0-02aeb7154049/BR-en-20240101-popsignuptwoweeks-perspective_alpha_website_large.jpg';
const CARD_LIVE_BG = 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=2070&auto=format&fit=crop';
const CARD_MOVIE_BG = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop';
const CARD_SERIES_BG = 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=2669&auto=format&fit=crop';

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

function formatExpDate(timestamp?: string) {
    if (!timestamp) return 'Ilimitado';
    const date = new Date(parseInt(timestamp, 10) * 1000);
    return date.toLocaleDateString('pt-BR');
}

function greetingText() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

function progressPercent(progress: number, duration: number) {
    if (!duration) return 0;
    return Math.min(100, Math.round((progress / duration) * 100));
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
        <div className="legacy-login-page">
            <div className="legacy-login-bg" style={{ backgroundImage: `url(${LOGIN_BG})` }} />
            <div className="legacy-login-overlay" />
            <div className="legacy-topbar legacy-topbar-overlay">
                <div className="legacy-brand">
                    <div className="legacy-logo">▶</div>
                    <span>XStream</span>
                </div>
            </div>
            <form className="legacy-panel" onSubmit={submit}>
                <h1 className="legacy-title">Bem-vindo</h1>
                <p className="legacy-muted">Insira suas credenciais IPTV para transmitir.</p>
                {error && <div className="legacy-error">{error}</div>}
                <label className="legacy-label">URL do servidor</label>
                <input className="legacy-input" value={hostUrl} onChange={event => setHostUrl(event.target.value)} placeholder="http://example.com:8080" />
                <label className="legacy-label">Usuario</label>
                <input className="legacy-input" value={username} onChange={event => setUsername(event.target.value)} placeholder="Usuario" />
                <label className="legacy-label">Senha</label>
                <input className="legacy-input" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha" type="password" />
                <button className="legacy-button primary" type="submit" disabled={loading}>
                    {loading ? 'Entrando...' : 'Conectar'}
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

function HeroSection({
    items,
    currentIndex,
    onSelect,
    onChangeIndex,
}: {
    items: HeroItem[];
    currentIndex: number;
    onSelect: (item: HeroItem) => void;
    onChangeIndex: (index: number) => void;
}) {
    if (!items.length) return null;
    const current = items[currentIndex];

    return (
        <div className="legacy-hero" onClick={() => onSelect(current)}>
            <div
                className="legacy-hero-backdrop"
                style={{ backgroundImage: `url(${current.backdrop})` }}
            />
            <div className="legacy-hero-gradient" />
            <div className="legacy-hero-content">
                <div className="legacy-hero-tags">
                    <span className="legacy-tag legacy-tag-red">{current.type === 'movie' ? 'Filme' : 'Serie'}</span>
                    {current.rating && <span className="legacy-tag">★ {current.rating}</span>}
                </div>
                <h2 className="legacy-hero-title">{current.title}</h2>
                <p className="legacy-hero-description">{current.description}</p>
                <button className="legacy-button primary legacy-hero-cta" type="button" onClick={event => { event.stopPropagation(); onSelect(current); }}>
                    Assistir agora
                </button>
            </div>
            <div className="legacy-hero-dots">
                {items.map((_, index) => (
                    <button
                        key={index}
                        type="button"
                        className={`legacy-hero-dot ${index === currentIndex ? 'active' : ''}`}
                        onClick={event => {
                            event.stopPropagation();
                            onChangeIndex(index);
                        }}
                        aria-label={`Slide ${index + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}

function ContinueWatchingCarousel({
    items,
    onPlay,
}: {
    items: WatchProgress[];
    onPlay: (item: WatchProgress) => void;
}) {
    if (!items.length) return null;

    return (
        <section className="legacy-section">
            <h2 className="legacy-section-title">Continuar Assistindo</h2>
            <div className="legacy-carousel">
                {items.map(item => (
                    <button
                        key={`${item.type}-${item.streamId}-${item.episodeId || ''}`}
                        className="legacy-carousel-card"
                        onClick={() => onPlay(item)}
                        type="button"
                    >
                        <img src={item.image || PLACEHOLDER} alt={item.name} />
                        <div className="legacy-carousel-overlay" />
                        <div className="legacy-progress-bar">
                            <span style={{ width: `${progressPercent(item.progress, item.duration)}%` }} />
                        </div>
                        <p>{item.name}</p>
                    </button>
                ))}
            </div>
        </section>
    );
}

function LegacyApp() {
    const [auth, setAuth] = useState<AuthData | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [view, setView] = useState<AppView>('home');
    const [activeType, setActiveType] = useState<ContentType>('live');
    const [categories, setCategories] = useState<Category[]>([]);
    const [items, setItems] = useState<StreamItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [player, setPlayer] = useState<PlayerState | null>(null);
    const [heroItems, setHeroItems] = useState<HeroItem[]>([]);
    const [heroIndex, setHeroIndex] = useState(0);
    const [continueWatching, setContinueWatching] = useState<WatchProgress[]>([]);

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
        if (!auth || view === 'home') return;
        loadCategories(activeType);
    }, [auth, activeType, view]);

    useEffect(() => {
        if (!auth) return;

        requestJson<Record<string, WatchProgress>>('/api/watch-progress', 'GET', undefined, 15000)
            .then(data => {
                const list = Object.values(data || {})
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 10);
                setContinueWatching(list);
                window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(data || {}));
            })
            .catch(() => {
                try {
                    const raw = window.localStorage.getItem(PROGRESS_KEY);
                    if (!raw) return;
                    const parsed = JSON.parse(raw) as Record<string, WatchProgress>;
                    const list = Object.values(parsed)
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, 10);
                    setContinueWatching(list);
                } catch {
                    /* ignore */
                }
            });
    }, [auth]);

    useEffect(() => {
        if (!auth) return;

        Promise.all([
            proxy<StreamItem[]>(auth.credentials, 'get_vod_streams'),
            proxy<StreamItem[]>(auth.credentials, 'get_series'),
        ])
            .then(([movies, series]) => {
                const pool = [
                    ...(Array.isArray(movies) ? movies.slice(0, 80) : []),
                    ...(Array.isArray(series) ? series.slice(0, 80) : []),
                ].filter(item => contentImage(item) !== PLACEHOLDER);

                const selected = pool.slice(0, 12).map((item, index) => {
                    const type: 'movie' | 'series' = item.series_id ? 'series' : 'movie';
                    const image = contentImage(item);
                    return {
                        id: contentId(item, type === 'series' ? 'series' : 'movie'),
                        title: contentName(item),
                        description: item.plot || 'Assista agora no XStream.',
                        backdrop: image,
                        type,
                        rating: item.rating ? String(item.rating) : '',
                    } as HeroItem;
                }).filter(item => item.id && item.backdrop);

                if (selected.length) {
                    setHeroItems(selected.slice(0, 5));
                    setHeroIndex(0);
                }
            })
            .catch(() => undefined);
    }, [auth]);

    useEffect(() => {
        if (heroItems.length <= 1) return;
        const timer = window.setInterval(() => {
            setHeroIndex(prev => (prev + 1) % heroItems.length);
        }, HERO_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [heroItems.length]);

    const navItems = useMemo(() => [
        { view: 'home' as AppView, label: 'Inicio' },
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

    const openItem = (item: StreamItem, type: ContentType = activeType) => {
        if (!auth) return;
        const id = contentId(item, type);
        if (type === 'series') {
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
            src: streamUrl(auth.credentials, type, id, item.container_extension),
            poster: contentImage(item),
        });
    };

    const openHeroItem = (item: HeroItem) => {
        if (!auth) return;
        if (item.type === 'movie') {
            setPlayer({
                title: item.title,
                src: streamUrl(auth.credentials, 'movie', item.id),
                poster: item.backdrop,
            });
            return;
        }

        setView('series');
        setActiveType('series');
        setLoading(true);
        proxy<SeriesInfo>(auth.credentials, 'get_series_info', { series_id: item.id })
            .then(data => setSeriesInfo(data))
            .catch(err => setError(err instanceof Error ? err.message : 'Falha ao carregar serie'))
            .finally(() => setLoading(false));
    };

    const openContinueWatching = (item: WatchProgress) => {
        if (!auth) return;
        if (item.type === 'movie') {
            setPlayer({
                title: item.name,
                src: streamUrl(auth.credentials, 'movie', String(item.streamId)),
                poster: item.image,
            });
            return;
        }

        const episodeId = item.episodeId || item.streamId;
        setPlayer({
            title: item.name,
            src: streamUrl(auth.credentials, 'series', String(episodeId)),
            poster: item.image,
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
        setView('home');
    };

    const openBrowse = (type: ContentType) => {
        setView(type);
        setActiveType(type);
        setSeriesInfo(null);
        setSelectedCategory(null);
    };

    const goHome = () => {
        setView('home');
        setSeriesInfo(null);
        setSelectedCategory(null);
        setError('');
    };

    if (loadingAuth) {
        return <div className="legacy-loading">Carregando...</div>;
    }

    if (!auth) {
        return <LoginScreen onLogin={setAuth} />;
    }

    const seasons = seriesInfo && seriesInfo.episodes ? Object.keys(seriesInfo.episodes) : [];

    return (
        <div>
            {player && <Player player={player} onClose={() => setPlayer(null)} />}
            <div className="legacy-layout">
                <aside className="legacy-sidebar">
                    <div className="legacy-sidebar-brand">
                        <div className="legacy-logo">X</div>
                        <span>XStream</span>
                    </div>
                    {navItems.map(item => {
                        const isActive = item.view === 'home' ? view === 'home' : view === item.type;
                        return (
                            <button
                                key={item.label}
                                className={`legacy-nav-button ${isActive ? 'active' : ''}`}
                                onClick={() => {
                                    if (item.view === 'home') goHome();
                                    else openBrowse(item.type as ContentType);
                                }}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                    <button className="legacy-nav-button" onClick={() => window.location.href = '/debug'}>Debug</button>
                    <button
                        className="legacy-nav-button"
                        onClick={() => {
                            const params = new URLSearchParams(window.location.search);
                            params.set('forceModern', '1');
                            window.location.href = `/dashboard?${params.toString()}`;
                        }}
                    >
                        App moderno
                    </button>
                    <button className="legacy-nav-button legacy-nav-danger" onClick={logout}>Sair</button>
                </aside>
                <section className="legacy-content">
                    {view === 'home' && (
                        <div className="legacy-home">
                            <div className="legacy-home-header">
                                <h1 className="legacy-title">{greetingText()}, {auth.user?.username || auth.credentials.username}</h1>
                                <div className="legacy-header-meta">
                                    <span>{auth.user?.status === 'Active' ? 'Ativo' : auth.user?.status || 'Conta'}</span>
                                    <span>Expira: {formatExpDate(auth.user?.exp_date)}</span>
                                </div>
                            </div>
                            <HeroSection
                                items={heroItems}
                                currentIndex={heroIndex}
                                onSelect={openHeroItem}
                                onChangeIndex={setHeroIndex}
                            />
                            <ContinueWatchingCarousel items={continueWatching} onPlay={openContinueWatching} />
                            <div className="legacy-category-cards">
                                <button className="legacy-category-card" onClick={() => openBrowse('live')} type="button">
                                    <div className="legacy-category-card-bg" style={{ backgroundImage: `url(${CARD_LIVE_BG})` }} />
                                    <div className="legacy-category-card-content">
                                        <span className="legacy-tag legacy-tag-red">Ao vivo</span>
                                        <h3>TV ao Vivo</h3>
                                        <p>Assista seus canais favoritos.</p>
                                    </div>
                                </button>
                                <button className="legacy-category-card" onClick={() => openBrowse('movie')} type="button">
                                    <div className="legacy-category-card-bg" style={{ backgroundImage: `url(${CARD_MOVIE_BG})` }} />
                                    <div className="legacy-category-card-content">
                                        <span className="legacy-tag">On demand</span>
                                        <h3>Filmes</h3>
                                        <p>Lancamentos e classicos.</p>
                                    </div>
                                </button>
                                <button className="legacy-category-card" onClick={() => openBrowse('series')} type="button">
                                    <div className="legacy-category-card-bg" style={{ backgroundImage: `url(${CARD_SERIES_BG})` }} />
                                    <div className="legacy-category-card-content">
                                        <span className="legacy-tag">Maratonar</span>
                                        <h3>Series</h3>
                                        <p>Programas e episodios.</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {view !== 'home' && (
                        <div>
                            <h1 className="legacy-title">
                                {seriesInfo
                                    ? seriesInfo.info?.name || 'Serie'
                                    : selectedCategory
                                        ? selectedCategory.category_name
                                        : activeType === 'live'
                                            ? 'TV ao Vivo'
                                            : activeType === 'movie'
                                                ? 'Filmes'
                                                : 'Series'}
                            </h1>
                            {error && <div className="legacy-error">{error}</div>}
                            {loading && <div className="legacy-loading">Carregando...</div>}

                            {seriesInfo && (
                                <div>
                                    <button className="legacy-button inline" onClick={() => setSeriesInfo(null)}>Voltar</button>
                                    {seriesInfo.info?.cover && (
                                        <img className="legacy-series-cover" src={seriesInfo.info.cover} alt={seriesInfo.info.name || 'Serie'} />
                                    )}
                                    {seasons.map(season => (
                                        <div key={season}>
                                            <h3>Temporada {season}</h3>
                                            <div className="legacy-grid">
                                                {(seriesInfo.episodes?.[season] || []).map(episode => (
                                                    <button key={episode.id} className="legacy-card" onClick={() => openEpisode(episode)}>
                                                        <strong>{episode.episode_num}. {episode.title || 'Episodio'}</strong>
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
                                        <button key={category.category_id} className="legacy-card legacy-card-category" onClick={() => loadCategoryItems(category)}>
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
