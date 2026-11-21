# Novidades

## 0.1.0 — prova de conceito (fase 0)

- Painel UXP para o Premiere Pro 26.5+, com o visual das outras extensões Helmet e inglês/português.
- Lista os marcadores da sequência ativa: timecode (com drop-frame), nome, comentário, cor, tipo e duração; avisa marcador fora do frame exato.
- Testes da API: mover 1 marcador 10 frames; mudar a cor de 2 marcadores numa única operação; gerar até 5000 marcadores de teste numa única operação.
- Atualiza sozinho quando o Premiere avisa que a sequência ou o projeto mudou, além do botão Atualizar.
- Diagnóstico com o que a API informou (eventos, ticks por frame, formato de tempo, guid).
