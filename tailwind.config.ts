import type { Config } from "tailwindcss";

/**
 * Tokens espelham `app/globals.css` (docs/redesign/00-design-system.md §3).
 * Nenhum hex literal deve aparecer em componentes — só aqui e no globals.
 */
const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: "var(--bg)",
                surface: {
                    DEFAULT: "var(--surface)",
                    2: "var(--surface-2)",
                    3: "var(--surface-3)",
                },
                line: {
                    DEFAULT: "var(--line)",
                    strong: "var(--line-strong)",
                },
                ink: {
                    DEFAULT: "var(--text)",
                    2: "var(--text-2)",
                    3: "var(--text-3)",
                },
                brand: {
                    DEFAULT: "var(--brand)",
                    soft: "var(--brand-soft)",
                },
                ok: "var(--ok)",
                warn: "var(--warn)",

                // Aliases legados: mantidos só enquanto telas ainda não migradas
                // os referenciam. Removê-los quando as specs 02-06 concluírem.
                background: "var(--bg)",
                foreground: "var(--text)",
                primary: { DEFAULT: "var(--brand)", hover: "#f40612" },
                secondary: "var(--surface-2)",
                accent: "var(--surface-3)",
                "card-bg": "var(--surface)",
            },
            fontFamily: {
                sans: ["var(--font-ui)"],
                mono: ["var(--font-mono)"],
            },
        },
    },
    plugins: [],
};
export default config;
