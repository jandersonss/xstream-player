import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationContext } from '@/app/context/NavigationContext';
import { isBackKey } from '@/app/lib/platform/keys';

export const useTvNavigation = () => {
    const router = useRouter();
    const { getActiveBackHandler } = useNavigationContext();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip navigation logic if the user is typing in an input or textarea
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement;

            if (isInput) return;

            const isBack = isBackKey(e);

            // Only handle navigation keys
            if (!isBack && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
                return;
            }

            // Back Navigation
            if (isBack) {
                e.preventDefault();
                if (document.fullscreenElement) {
                    return;
                }

                // Check if there's a custom back handler registered
                const customHandler = getActiveBackHandler();
                if (customHandler) {
                    console.log('TVNavigation::Using custom back handler');
                    customHandler();
                } else {
                    console.log('TVNavigation::Using default router.back()');
                    router.back();
                }
                return;
            }

            // Directional Navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                // If the focused element is a carousel, let ArrowLeft/ArrowRight be
                // handled by the component itself (it will preventDefault internally)
                const isCarousel = activeElement?.getAttribute('data-carousel') === 'true';
                if (isCarousel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    return;
                }
                e.preventDefault();
                handleDirectionalNav(e.key, e.repeat);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router, getActiveBackHandler]);
};

// Holding a directional key on a TV remote fires a burst of auto-repeat
// keydown events, and each one triggers a full querySelectorAll +
// getBoundingClientRect scan over every focusable element (160+ on the home
// screen), which stutters on weak TV CPUs. Auto-repeat is rate limited to one
// scan per NAV_REPEAT_MIN_INTERVAL_MS; deliberate presses always run, since
// dropping one of those would lose input the user meant to give us.
const NAV_REPEAT_MIN_INTERVAL_MS = 100;
let navLastExecTime = 0;

function handleDirectionalNav(direction: string, isAutoRepeat: boolean) {
    const now = performance.now();

    if (isAutoRepeat && now - navLastExecTime < NAV_REPEAT_MIN_INTERVAL_MS) {
        return;
    }

    navLastExecTime = now;
    runDirectionalNav(direction);
}

function runDirectionalNav(direction: string) {
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
