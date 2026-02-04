'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'next/navigation';
import { Play, Server, User, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [hostUrl, setHostUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!hostUrl || !username || !password) {
      setError('Por favor, preencha todos os campos');
      setIsSubmitting(false);
      return;
    }

    try {
      await login(hostUrl, username, password);
    } catch (err: any) {
      setError(err.message || 'Falha no login. Por favor, verifique suas credenciais.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] relative overflow-hidden">
      {/* Cinematic Background with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[url('https://assets.nflxext.com/ffe/siteui/vlv3/c38a2d52-138e-48a3-ab68-36787ece46b3/eeb03fc9-99c6-438e-82d0-02aeb7154049/BR-en-20240101-popsignuptwoweeks-perspective_alpha_website_large.jpg')] bg-cover bg-center opacity-40 blur-sm scale-105"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80"></div>
      </div>

      <div className="w-full max-w-md p-8 sm:p-10 bg-black/60 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 relative z-10 mx-4 transition-all duration-500 hover:border-white/20 hover:shadow-red-900/10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 bg-red-600 rounded-2xl mb-6 shadow-[0_0_30px_rgba(229,9,20,0.4)] transform hover:scale-105 transition-transform duration-300">
            <Play className="w-8 h-8 text-white fill-current ml-1" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Bem-vindo</h1>
          <p className="text-gray-400 text-sm font-medium tracking-wide">Insira suas credenciais IPTV para transmitir</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-200 text-sm animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={18} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">URL do Servidor</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Server className="h-5 w-5 text-gray-500 group-focus-within:text-red-500 transition-colors" />
              </div>
              <input
                type="url"
                placeholder="http://example.com:8080"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                className="block w-full pl-10 pr-3 py-3.5 border border-white/10 rounded-xl leading-5 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-red-500/50 focus:ring-1 focus:ring-red-500 transition-all duration-200 font-medium"
                required
                data-focusable="true"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Usuário</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-500 group-focus-within:text-red-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-3 py-3.5 border border-white/10 rounded-xl leading-5 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-red-500/50 focus:ring-1 focus:ring-red-500 transition-all duration-200 font-medium"
                required
                data-focusable="true"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Senha</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-red-500 transition-colors" />
              </div>
              <input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3.5 border border-white/10 rounded-xl leading-5 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-red-500/50 focus:ring-1 focus:ring-red-500 transition-all duration-200 font-medium"
                required
                data-focusable="true"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-[1.02] shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
            data-focusable="true"
          >
            {isSubmitting ? (
              <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>Conectar <Play size={20} fill="currentColor" /></>
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <p className="text-xs text-gray-500 font-mono">Compatível com Xtream Codes API</p>
        </div>
      </div>
    </div>
  );
}
