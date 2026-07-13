---
name: open-pr
description: Abre um PR neste repositório com a frase de aceite do CLA na descrição. Use quando o usuário pedir para criar um PR, abrir um pull request, ou submeter uma branch para review.
---

Fluxo para abrir um PR no Xstream Player.

## Antes de abrir

1. Rode `/build-check` (lint + build completo). Não abra PR com build quebrado.
2. Confirme que não está na `main` — commits vão sempre numa feature branch.
3. A branch deve ter **exatamente um commit** (`git commit --amend` se precisar ajustar).
   Mensagem em inglês, imperativo, sem prefixo do tipo `feat:`, até 50 caracteres.

## Descrição do PR

Título e corpo em **pt-BR**. Explique *o que* muda e *por quê* — não descreva o diff.

O corpo **deve terminar** com a frase de aceite do CLA, exatamente assim:

```
I have read the CLA (CLA.md) and I agree to its terms for this and all my future contributions to this project.
```

O workflow `.github/workflows/cla-check.yml` reprova o PR se essa frase não estiver
na descrição. Ele ignora PRs abertos por `jandersonss` (titular do copyright, não
assina CLA para si mesmo), mas inclua a frase de qualquer forma: mantém o histórico
consistente e o check verde.

## Comando

```bash
git push -u origin <branch>
gh pr create --title "<título em pt-BR>" --body "$(cat <<'EOF'
## O que muda

<resumo objetivo>

## Por quê

<motivação>

I have read the CLA (CLA.md) and I agree to its terms for this and all my future contributions to this project.
EOF
)"
```

Ao final, reporte a URL do PR ao usuário.
