'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    background: '#1a1a1a',
                    color: '#ff4d4d',
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    border: '5px solid #ff4d4d'
                }}>
                    <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️ Erro na Aplicação (TV Debug)</h1>
                    <p style={{ color: '#ccc', marginBottom: '20px' }}>Ocorreu um erro ao renderizar a interface.</p>
                    <div style={{
                        background: '#000',
                        padding: '15px',
                        borderRadius: '8px',
                        textAlign: 'left',
                        maxWidth: '90%',
                        overflow: 'auto',
                        fontSize: '14px',
                        color: '#fff',
                        border: '1px solid #333'
                    }}>
                        <p><strong>Mensagem:</strong> {this.state.error?.message}</p>
                        <details open style={{ marginTop: '10px' }}>
                            <summary style={{ cursor: 'pointer', color: '#888' }}>Stack Trace</summary>
                            <pre style={{
                                marginTop: '10px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                fontSize: '10px',
                                color: '#666'
                            }}>
                                {this.state.error?.stack}
                            </pre>
                        </details>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '30px',
                            padding: '10px 20px',
                            background: '#e50914',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        Recarregar App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
