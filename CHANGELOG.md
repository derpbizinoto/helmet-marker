# Novidades

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
