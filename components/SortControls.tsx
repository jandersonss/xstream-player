'use client';

import { ArrowDownAZ, ArrowUpAZ, Calendar, Clock, SortAsc } from 'lucide-react';

export type SortOption = 'name-asc' | 'name-desc' | 'added' | 'year';

interface SortControlsProps {
    currentSort: SortOption;
    onSortChange: (sort: SortOption) => void;
    showYear?: boolean;
}

export default function SortControls({ currentSort, onSortChange, showYear = false }: SortControlsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
            <button
                onClick={() => onSortChange('name-asc')}
                data-focusable="true"
                tabIndex={0}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-600 ${currentSort === 'name-asc'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
            >
                <ArrowDownAZ size={14} />
                A-Z
            </button>
            <button
                onClick={() => onSortChange('name-desc')}
                data-focusable="true"
                tabIndex={0}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-600 ${currentSort === 'name-desc'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
            >
                <ArrowUpAZ size={14} />
                Z-A
            </button>
            <button
                onClick={() => onSortChange('added')}
                data-focusable="true"
                tabIndex={0}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-600 ${currentSort === 'added'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
            >
                <Clock size={14} />
                Added
            </button>
            {showYear && (
                <button
                    onClick={() => onSortChange('year')}
                    data-focusable="true"
                    tabIndex={0}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-600 ${currentSort === 'year'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Calendar size={14} />
                    Year
                </button>
            )}
        </div>
    );
}
