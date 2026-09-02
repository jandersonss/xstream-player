---
name: tv-ui-design
description: Padrões de UX para telas de TV (10-foot UI) — foco por controle remoto, tipografia/contraste a distância, densidade de informação. Use ao criar ou refatorar qualquer componente visível em app/dashboard ou components/.
---

Interface é vista a **~3m de distância**, navegada só por **D-pad/controle remoto** (sem mouse, sem hover confiável). Toda decisão de UX parte disso. Para limites técnicos de browser (CSS/JS suportado), veja `tv-css-compat`.

## Foco é o cursor

- Todo elemento interativo leva `data-focusable="true"` — é o contrato que `useTvNavigation` (`app/hooks/useTvNavigation.ts`) usa para navegação espacial (`querySelectorAll('[data-focusable="true"]')` + distância geométrica ponderada por eixo). Sem o atributo, o elemento é invisível para o D-pad mesmo que clicável.
- Estado de foco **sempre visível e óbvio à distância** — nunca dependa de `:hover`. Padrão do projeto: `focus:outline-none focus:ring-2 focus:ring-red-600` (a cor primária `#e50914`); escale para `ring-4` só em cards grandes de carousel onde o anel fino some a 3m. Não invente outra cor de anel — quebra a leitura "isto está focado" em toda a app.
- `group-hover:` continua ok como *reforço* visual quando o mouse existe (dev/debug), mas a versão `focus:`/`focus-within:` equivalente é obrigatória — é o que dispara na TV real.
- Ordem de leitura do foco = ordem geométrica na tela (linhas/colunas), não a ordem do DOM se o layout usa `flex-wrap`/grid não-linear. Teste navegação nas 4 direções antes de considerar pronto.
- Ao entrar numa nova tela/modal, mova o foco para o primeiro elemento focável relevante — nunca deixe o D-pad "sem cursor" (o hook foca o primeiro elemento da lista se `document.activeElement` não é focável, mas isso pode não ser o elemento certo semanticamente).
- Carousels horizontais marcam o container com `data-carousel="true"` para que `ArrowLeft/ArrowRight` sejam tratados pelo próprio componente (scroll) em vez do nav global — replique esse padrão em qualquer lista horizontal nova.

## Tipografia e contraste a distância

- Corpo de texto legível a 3m começa em `text-base`/`text-lg`; `text-xs`/`text-sm` só para metadados secundários (ano, duração, badges) nunca para o texto principal de uma ação.
- Contraste alto sempre: fundo escuro (`bg-black`/`bg-card-bg`) + texto branco/`gray-300` no máximo — evite `gray-500`/`gray-600` para texto que carrega informação (ok para labels realmente descartáveis).
- Não use apenas cor para indicar estado (focado/selecionado/erro) — a TV pode ter overscan ou calibração ruim. Combine cor com escala (`focus:scale-105`), anel ou ícone.

## Densidade e layout

- Respeite **safe area**: nada crítico (texto, botões) a menos de ~5% da borda — TVs reais fazem overscan. Containers de página já devem ter padding lateral generoso (`px-6`+ em telas grandes).
- Menos itens por tela do que em desktop — cada passo de D-pad tem custo; prefira carousels/paginação a grids densos que exigem muitos toques de seta.
- Ações primárias (play, confirmar) precisam do alvo de foco grande e centralizado no fluxo — não esconda atrás de menus secundários se for a ação mais comum da tela.
- Sem gestos, drag-and-drop ou tooltips-on-hover como única forma de acessar uma função — tudo tem que ser alcançável só com D-pad + Enter/Back (`isBackKey`, `app/lib/platform/keys.ts`).

## Ao refatorar um componente existente

1. Ele já tem `data-focusable`/anel de foco? Se não, é o primeiro gap a fechar, antes de qualquer redesign visual.
2. Ele depende de `:hover` para revelar informação/ação essencial? Adicione o par `focus:`/`focus-within:`.
3. Rode o componente pela navegação de D-pad (ou veja `tv-live-inspection-cdp` na memória do projeto para inspecionar numa TV real) antes de dar como concluído.
