'use client';

import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';

type BackHandler = () => void;

interface NavigationContextType {
    registerBackHandler: (handler: BackHandler) => void;
    unregisterBackHandler: (handler: BackHandler) => void;
    getActiveBackHandler: () => BackHandler | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
    // Use a ref to store handlers to avoid re-renders
    const handlersRef = useRef<BackHandler[]>([]);

    const registerBackHandler = (handler: BackHandler) => {
        // Add to the end of the stack (most recent = highest priority)
        handlersRef.current.push(handler);
    };

    const unregisterBackHandler = (handler: BackHandler) => {
        // Remove the handler from the stack
        handlersRef.current = handlersRef.current.filter(h => h !== handler);
    };

    const getActiveBackHandler = (): BackHandler | null => {
        // Return the most recently registered handler (top of stack)
        const handlers = handlersRef.current;
        return handlers.length > 0 ? handlers[handlers.length - 1] : null;
    };

    return (
        <NavigationContext.Provider value={{ registerBackHandler, unregisterBackHandler, getActiveBackHandler }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigationContext() {
    const context = useContext(NavigationContext);
    if (!context) {
        throw new Error('useNavigationContext must be used within NavigationProvider');
    }
    return context;
}

/**
 * Hook to register a custom back handler that overrides the default navigation behavior.
 * The handler is automatically cleaned up when the component unmounts.
 * 
 * @param handler - Function to call when back navigation is triggered
 */
export function useNavigationOverride(handler: BackHandler | null) {
    const { registerBackHandler, unregisterBackHandler } = useNavigationContext();

    useEffect(() => {
        if (!handler) return;

        registerBackHandler(handler);

        return () => {
            unregisterBackHandler(handler);
        };
    }, [handler, registerBackHandler, unregisterBackHandler]);
}
