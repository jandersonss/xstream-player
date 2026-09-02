import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationContext } from '@/app/context/NavigationContext';
import { isBackKey } from '@/app/lib/platform/keys';

export const useTvNavigation = () => {
    const router = useRouter();
    const { getActiveBackHandler } = useNavigationContext();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isFormControl = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement;

            const isBack = isBackKey(e);

            // Only handle navigation keys
            if (!isBack && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
                return;
            }

            // A focused field owns the keys that do something inside it: the
            // horizontal arrows move the caret, change a range value or pick a
            // select option, and Enter submits. The vertical arrows never belong
            // to it — a remote has no Tab key and no pointer, so a field that
            // swallows them is a dead end the user cannot leave.
            if (isFormControl && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
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
    const activeElement = document.activeElement as HTMLElement | null;

    // The origin only has to be *somewhere on screen*, not a registered target.
    // A field that never got `data-focusable` is still a real position to move
    // away from, and jumping to the first element of the page instead would
    // throw the cursor across the screen when the user simply pressed up.
    const hasOrigin = activeElement instanceof HTMLElement && activeElement !== document.body;

    if (!hasOrigin) {
        // Nothing focused yet — start at the first focusable element.
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
        return;
    }

    const currentRect = activeElement.getBoundingClientRect();
    const isVertical = direction === 'ArrowUp' || direction === 'ArrowDown';

    // Candidates that share the current element's span on the cross axis are in
    // the same column (going up/down) or the same row (going left/right), and
    // always win over one that merely happens to be close. Weighted distance
    // alone is not enough: from a button in the settings column, a nav rail item
    // slightly below but far to the left could beat the next setting further
    // down the same column, so the cursor jumped back into the menu.
    let bestAligned: HTMLElement | null = null;
    let bestAlignedDistance = Infinity;
    let bestLoose: HTMLElement | null = null;
    let bestLooseDistance = Infinity;

    focusableElements.forEach((el) => {
        if (el === activeElement) return;

        const rect = el.getBoundingClientRect();

        // A hidden element reports a zero rect at the origin, which would make it
        // the nearest thing above and to the left of everything.
        if (rect.width === 0 && rect.height === 0) return;

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

        if (!isValid) return;

        const currentCenter = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
        const candidateCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        const dx = Math.abs(candidateCenter.x - currentCenter.x);
        const dy = Math.abs(candidateCenter.y - currentCenter.y);

        // Primary axis first, cross-axis deviation as a penalty.
        const distance = isVertical ? dy + (dx * 2) : dx + (dy * 2);

        const isAligned = isVertical
            ? rect.left < currentRect.right && rect.right > currentRect.left
            : rect.top < currentRect.bottom && rect.bottom > currentRect.top;

        if (isAligned) {
            if (distance < bestAlignedDistance) {
                bestAlignedDistance = distance;
                bestAligned = el;
            }
        } else if (distance < bestLooseDistance) {
            bestLooseDistance = distance;
            bestLoose = el;
        }
    });

    // Only leave the current column/row when nothing in it lies ahead.
    // The cast mirrors the original code: TypeScript narrows both to `never`
    // because it cannot see the assignments made inside the forEach closure.
    const target = (bestAligned ?? bestLoose) as HTMLElement | null;
    if (target) {
        target.focus();
    }
}
