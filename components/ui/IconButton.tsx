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
                // The border is load-bearing: on the near-black player gradient a bare
                // `bg-surface-3` fill is almost invisible at 3 m, and on a light
                // (`bg-ink`) context the fill alone reads as a hover, not a locked-on
                // state. `border-line-strong` gives the "on" a hard edge on both.
                active ? 'bg-surface-3 text-ink border border-line-strong' : VARIANT_CLASSNAME[variant],
                SIZE_CLASSNAME[size],
                className,
            ].join(' ')}
        >
            {/* A filled glyph is the primary "locked-on" signal — it survives TV
                overscan and gamma where the surface/border shift alone does not,
                and costs no accent colour (spec 00 §2.1). */}
            <Icon size={ICON_SIZE[size]} fill={active ? 'currentColor' : 'none'} />
        </button>
    );
}
