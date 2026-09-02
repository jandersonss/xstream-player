'use client';

import { RefObject, useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Ao trocar de rota, se o foco atual não estiver dentro do conteúdo (por
 * exemplo, o usuário clicou/selecionou um item do menu lateral ou da barra
 * inferior), move o foco para o primeiro item focável do conteúdo. Sem isso,
 * o cursor do controle remoto fica preso no menu até que o usuário pressione
 * a seta direita manualmente.
 *
 * Não interfere quando a própria página já colocou o foco em algo dentro do
 * conteúdo (ex.: um input com `autoFocus`).
 *
 * O "primeiro item" pode mudar enquanto a página carrega — por exemplo, o
 * Hero da Home busca seus dados de forma assíncrona e só monta seus botões
 * depois de outros blocos que já estavam no DOM (HomeShortcuts). Enquanto o
 * usuário ainda não tomou o controle (nenhuma tecla/clique desde a troca de
 * rota), o hook continua preferindo o item que hoje é o primeiro em ordem
 * DOM, mesmo que isso signifique mover o foco de novo quando algo anterior
 * termina de montar.
 */
export function useAutoFocusMainContent(mainRef: RefObject<HTMLElement | null>) {
    const pathname = usePathname();

    useEffect(() => {
        const main = mainRef.current;
        if (!main) return;

        if (main.contains(document.activeElement)) return;

        let autoFocusedElement: HTMLElement | null = null;
        let userTookOver = false;

        const markUserTookOver = () => {
            userTookOver = true;
        };
        window.addEventListener('keydown', markUserTookOver, { once: true });
        window.addEventListener('pointerdown', markUserTookOver, { once: true });

        const focusFirst = () => {
            if (userTookOver) return;
            const first = main.querySelector<HTMLElement>('[data-focusable="true"]');
            if (first && first !== autoFocusedElement) {
                first.focus();
                autoFocusedElement = first;
            }
        };

        focusFirst();

        // Conteúdo carregado de forma assíncrona (heróis, carrosséis) pode
        // ainda não ter renderizado seus itens focáveis, ou pode montar
        // depois de algo que já estava na tela — observa o DOM em vez de
        // desistir após a primeira tentativa.
        const observer = new MutationObserver(focusFirst);
        observer.observe(main, { childList: true, subtree: true });

        const timeout = setTimeout(() => observer.disconnect(), 5000);

        return () => {
            observer.disconnect();
            clearTimeout(timeout);
            window.removeEventListener('keydown', markUserTookOver);
            window.removeEventListener('pointerdown', markUserTookOver);
        };
    }, [pathname, mainRef]);
}
