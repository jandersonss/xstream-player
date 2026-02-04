import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const useTvNavigation = () => {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip navigation logic if the user is typing in an input or textarea
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement;

            if (isInput) return;

            // Only handle navigation keys
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Escape'].includes(e.key)) {
                return;
            }

            // Back Navigation
            if (e.key === 'Backspace' || e.key === 'Escape') {
                e.preventDefault();
                router.back();
                return;
            }

            // Directional Navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                handleDirectionalNav(e.key);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);
};

function handleDirectionalNav(direction: string) {
    const focusableElements = Array.from(document.querySelectorAll('[data-focusable="true"]')) as HTMLElement[];
    const activeElement = document.activeElement as HTMLElement;

    if (!activeElement || !focusableElements.includes(activeElement)) {
        // If nothing focused, focus the first visible focusable element
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
        return;
    }

    const currentRect = activeElement.getBoundingClientRect();
    let bestCandidate: HTMLElement | null = null;
    let minDistance = Infinity;

    focusableElements.forEach((el) => {
        if (el === activeElement) return;

        const rect = el.getBoundingClientRect();
        const threshold = 5; // 5px threshold for overlap/alignment

        // Filter based on direction relative to current element
        let isValid = false;
        switch (direction) {
            case 'ArrowUp':
                isValid = rect.bottom <= currentRect.top + threshold;
                break;
            case 'ArrowDown':
                isValid = rect.top >= currentRect.bottom - threshold;
                break;
            case 'ArrowLeft':
                isValid = rect.right <= currentRect.left + threshold;
                break;
            case 'ArrowRight':
                isValid = rect.left >= currentRect.right - threshold;
                break;
        }

        if (isValid) {
            const currentCenter = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
            const candidateCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

            // Weighted distance: prioritize items aligned in the direction of movement
            const dx = Math.abs(candidateCenter.x - currentCenter.x);
            const dy = Math.abs(candidateCenter.y - currentCenter.y);

            let distance;
            if (direction === 'ArrowUp' || direction === 'ArrowDown') {
                // Focus on Y distance, but penalize X deviation heavily
                distance = dy + (dx * 2);
            } else {
                // Focus on X distance, but penalize Y deviation heavily
                distance = dx + (dy * 2);
            }

            if (distance < minDistance) {
                minDistance = distance;
                bestCandidate = el;
            }
        }
    });

    if (bestCandidate) {
        (bestCandidate as HTMLElement).focus();
    }
}
