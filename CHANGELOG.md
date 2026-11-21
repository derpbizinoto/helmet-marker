# Novidades

## 0.3.0 — produtividade (fase 2)

- Duração: mesma duração para vários marcadores (em segundos ou frames) e tornar pontuais.
- Distribuir igualmente entre o primeiro e o último selecionado.
- Encaixar no corte mais próximo (começo/fim dos clipes de vídeo e/ou áudio), até uma distância máxima.
- Remover duplicados e mesclar marcadores próximos juntando os comentários (com confirmação).
- Rolagem mais rápida com a roda do mouse (velocidade ajustável em Ferramentas de teste › Painel).

- Localizar e substituir em nomes e comentários (só no nome, só no comentário ou nos dois; com ou sem diferenciar maiúsculas).
- Numeração automática dos nomes em ordem de tempo, com prefixo, sufixo, número inicial, passo e zeros à esquerda.
- Duplo clique no nome ou no comentário edita direto na lista (Enter salva, Esc cancela).
- Modelos de marcador: aplicar nos selecionados (um Ctrl+Z) ou criar um marcador no playhead (com cor, dois Ctrl+Z).
- Seleções salvas com nome, guardadas por sequência.

## 0.2.0 — MVP (fase 1)

- Filtros por texto, cor, tipo, duração e In/Out; seleção com Ctrl/Shift, tudo, limpar, inverter, antes/depois do marcador ou do playhead.
- Clique num marcador leva o playhead até ele.
- Edição em massa de cor, nome, comentário (substituir/acrescentar) e tipo; excluir com confirmação; prévia de quantos marcadores vão mudar.
- Mover X frames, ±1 frame, ±1 s, ou tudo a partir do playhead. Uma operação = um Ctrl+Z.
- Exportar capítulos do YouTube (copiar ou salvar .txt, com avisos) e CSV (salvar ou copiar).
- Verificação automática da lista (o Premiere não avisa quando um marcador é criado na timeline).
- Título "HELMET MARKER" em imagem, na fonte Geo com degradê, como nas outras extensões.

## 0.1.0 — prova de conceito (fase 0)

- Painel UXP para o Premiere Pro 26.5+, com o visual das outras extensões Helmet e inglês/português.
- Lista os marcadores da sequência ativa: timecode (com drop-frame), nome, comentário, cor, tipo e duração; avisa marcador fora do frame exato.
- Testes da API: mover 1 marcador 10 frames; mudar a cor de 2 marcadores numa única operação; gerar até 5000 marcadores de teste numa única operação.
- Atualiza sozinho quando o Premiere avisa que a sequência ou o projeto mudou, além do botão Atualizar.
- Diagnóstico com o que a API informou (eventos, ticks por frame, formato de tempo, guid).
