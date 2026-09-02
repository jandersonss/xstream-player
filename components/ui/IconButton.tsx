'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import type { ButtonSize, ButtonVariant } from './Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    label: string;
    size?: ButtonSize;
    variant?: ButtonVariant;
    active?: boolean;
}

const VARIANT_CLASSNAME: Record<ButtonVariant, string> = {
    primary: 'bg-ink text-bg',
    secondary: 'bg-surface-2 text-ink border border-line',
    ghost: 'text-ink-2 hover:text-ink',
    danger: 'bg-surface-2 text-brand border border-line',
};

const SIZE_CLASSNAME: Record<ButtonSize, string> = {
    sm: 'h-9 w-9',
    md: 'h-11 w-11',
    lg: 'h-14 w-14',
};

const ICON_SIZE: Record<ButtonSize, number> = {
    sm: 16,
    md: 20,
    lg: 24,
};

export default function IconButton({
    icon: Icon,
    label,
    size = 'md',
    variant = 'ghost',
    active = false,
    disabled,
    className = '',
    ...rest
}: IconButtonProps) {
    return (
        <button
            {...rest}
            disabled={disabled}
            aria-label={label}
            title={label}
            data-focusable={disabled ? undefined : 'true'}
            tabIndex={disabled ? undefined : 0}
            className={[
                'inline-flex items-center justify-center rounded-lg transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                // Active state uses the neutral scale, not a stray accent color —
                // spec 00 keeps the accent palette to focus (white) and brand (red).
                active ? 'bg-surface-3 text-ink' : VARIANT_CLASSNAME[variant],
                SIZE_CLASSNAME[size],
                className,
            ].join(' ')}
        >
            <Icon size={ICON_SIZE[size]} />
        </button>
    );
}
