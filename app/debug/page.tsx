import { redirect } from 'next/navigation';

/**
 * The diagnostics live in `public/debug/index.html`, not here.
 *
 * The whole point of that page is to run on browsers that cannot run this app —
 * a TV whose Chromium predates CSS grid will render the static file and nothing
 * else. Keeping a React copy of it meant maintaining the same checklist twice,
 * and the two had already drifted apart in wording. This route only forwards to
 * the real one, so `/debug` keeps working from anywhere.
 */
export default function DebugPage() {
    redirect('/debug/index.html');
}
