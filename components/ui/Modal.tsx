'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import IconButton from './IconButton';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSNAME: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'max-w-[28rem]',
    md: 'max-w-[34rem]',
    lg: 'max-w-[48rem]',
};

export default function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md',
}: ModalProps) {
    const cardRef = useRef<HTMLDivElement>(null);

    // A single z-index for every modal in the app (spec 00 fixes the stacking
    // mess where ad hoc modals fought over z-index).
    // The TV remote's Back key is handled through NavigationContext, not a
    // native browser back — this is what lets Back close the modal instead
    // of leaving the page.
    useNavigationOverride(isOpen ? onClose : null);

    useEffect(() => {
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;

        const firstFocusable = cardRef.current?.querySelector<HTMLElement>('[data-focusable="true"]');
        firstFocusable?.focus();
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                ref={cardRef}
                className={[
                    'w-full bg-surface-2 border border-line rounded-xl p-6 max-h-[90vh] overflow-y-auto',
                    SIZE_CLASSNAME[size],
                ].join(' ')}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg md:text-xl font-semibold text-ink">{title}</h2>
                        {description && <p className="text-xs md:text-sm text-ink-2 mt-1">{description}</p>}
                    </div>
                    <IconButton icon={X} label="Fechar" onClick={onClose} className="focus-flat" />
                </div>

                {children}

                {footer && <div className="mt-6">{footer}</div>}
            </div>
        </div>
    );
}
