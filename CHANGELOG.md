# Novidades

## 1.0.0 — primeira versão estável

- Reúne tudo das versões 0.1 a 0.3 (abaixo), com o código inteiro revisado e testado no Premiere 26.5.
- Instalação pelo pacote `.ccx` (dois cliques; o app Creative Cloud instala).
- Interface mais limpa: textos e botões mais curtos, menos explicações repetidas, mais espaço entre os elementos, grupos separados por linhas e botões com contorno visível; as prévias só aparecem com marcadores selecionados.
- Novo: **Levar ao playhead** (cartão Mover). O primeiro marcador selecionado vai para o playhead e os outros vão junto, com o mesmo espaço entre eles. Só funciona com marcadores seguidos (nenhum outro no meio, nem escondido pelos filtros). Um Ctrl+Z desfaz.

## 0.3.0 — produtividade e importação (fases 2 e 3)

- Copiar marcadores para outra sequência do projeto (mesmo tempo contado do início; com outra taxa de quadros, cai no frame mais próximo).
- Trazer os marcadores do clipe selecionado para a sequência (na posição do clipe) e enviar marcadores da sequência para o clipe.
- Checklist: marcar como feito (✓ no nome), selecionar pendentes ou feitos, progresso geral e por cor. Legenda das cores (o que cada cor significa).
- Importar marcadores de arquivo ou de uma lista colada: lista de tempos (inclusive capítulos do YouTube), CSV (o do Helmet Marker, o "Exportar marcadores" do Premiere e planilhas), legenda SRT, EDL (marcadores LOC do Resolve/Avid, ou um por evento) e JSON. Prévia antes de importar, avisos das linhas ignoradas, opção de pular os que já existem. Um Ctrl+Z desfaz (dois quando o arquivo traz cores).
- Criar um marcador no começo de cada clipe (só vídeo, só áudio ou os dois), numerado.
- Exportar também lista de revisão ("1. timecode — comentário"), texto simples e JSON.
- Painel mais leve: só redesenha o que mudou, as prévias esperam um instante depois do clique, a verificação automática faz uma leitura leve e o fundo usa cores sólidas no lugar de degradês. Cartões recolhíveis (clique no título; o painel lembra quais ficam abertos): cartão fechado não pesa. O diagnóstico só se atualiza aberto e mostra quanto tempo a lista levou e a maior travada do painel.
- Corrigido: engasgada no começo/fim da rolagem. O Premiere faz um pequeno "elástico" ao chegar na ponta, e o painel o multiplicava; agora, logo depois de encostar na ponta, movimentos pequenos não são multiplicados, a rolagem chega até o fim e arrastar a barra de rolagem não é multiplicado. O Diagnóstico mostra os últimos avisos de rolagem.
- Corrigido: campo vazio chega como nulo no Premiere (erro "Cannot read properties of null (reading 'trim')"). Nos campos de texto isso podia virar "null"; nos de número, virar 0 sem aviso (agora dá mensagem); na edição direto na lista, apagar o nome não fazia nada.
- Corrigido (revisão do código): escolher um modelo não preenchia os campos, salvar uma seleção mostrava erro mesmo salvando e "Limpar filtros" dava erro.
- Corrigido: listas que apareciam em branco no Premiere (a unidade da duração e as trilhas do encaixe). Lista sem escolha agora usa a primeira opção.
- Duração: mesma duração para vários marcadores (em segundos, aceitando 2,5 ou 2.5, ou em frames) e tornar pontuais.
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
