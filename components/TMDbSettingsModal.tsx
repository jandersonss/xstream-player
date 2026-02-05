'use client';

import { useState } from 'react';
import { X, Key, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useTMDb } from '../app/context/TMDbContext';

interface TMDbSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TMDbSettingsModal({ isOpen, onClose }: TMDbSettingsModalProps) {
    const { config, saveConfig } = useTMDb();
    const [apiKey, setApiKey] = useState(config?.apiKey || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!apiKey.trim()) {
            setError('Por favor, insira uma chave de API');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess(false);

        const result = await saveConfig(apiKey.trim());

        setIsLoading(false);

        if (result) {
            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 1500);
        } else {
            setError('Chave de API inválida. Verifique e tente novamente.');
        }
    };

    const handleClose = () => {
        if (!isLoading) {
            setError('');
            setSuccess(false);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[#333]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-600/20 rounded-lg">
                            <Key size={24} className="text-red-500" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Configuração TMDb</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                        <p className="text-sm text-blue-300 mb-2">
                            Para usar as sugestões do TMDb, você precisa de uma chave de API gratuita.
                        </p>
                        <a
                            href="https://www.themoviedb.org/settings/api"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                            Obter chave de API
                            <ExternalLink size={14} />
                        </a>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300">
                            Chave de API (v3)
                        </label>
                        <input
                            id="apiKey"
                            type="text"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            disabled={isLoading}
                            placeholder="Digite sua chave de API do TMDb"
                            className="w-full px-4 py-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent disabled:opacity-50 transition-all"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg animate-in slide-in-from-top-2 duration-200">
                            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg animate-in slide-in-from-top-2 duration-200">
                            <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                            <p className="text-sm text-green-300">Configuração salva com sucesso!</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-[#333]">
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-[#333] rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Testando...
                            </>
                        ) : (
                            'Salvar'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
