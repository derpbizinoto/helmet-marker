# Helmet Marker

[English](README.md) · **Português**

Plugin **UXP** para o Adobe Premiere Pro: um painel para selecionar e editar marcadores em massa, coisa que o Premiere não faz sozinho. Toda operação em massa vira **uma única ação no histórico**, então um Ctrl+Z desfaz tudo.

Mesma identidade visual do [Helmet DL](https://github.com/derpbizinoto/helmet-dl), [Helmet Cutter](https://github.com/derpbizinoto/helmet-cutter) e [Helmet Library](https://github.com/derpbizinoto/helmet-library): tema Clássico (Violet Terminal), Geo no nome e Roboto no resto.

Versão atual: **0.2.0** — MVP (fase 1). O que mudou está no [CHANGELOG.md](CHANGELOG.md).

Gratuito e de código aberto ([licença MIT](LICENSE)).

## O que faz

- Lista os marcadores da sequência ativa (timecode com drop-frame, nome, comentário, cor, tipo, duração). Clique leva o playhead até o marcador.
- Seleção com clique, Ctrl+clique e Shift+clique; selecionar tudo, limpar, inverter; selecionar antes/depois do marcador clicado ou do playhead.
- Filtros por texto, cor, tipo, duração (pontual ou com duração) e In/Out da sequência.
- Edição em massa de cor, nome, comentário (substituir ou acrescentar) e tipo; excluir com confirmação. Antes de aplicar, o painel mostra quantos marcadores vão mudar.
- Mover selecionados X frames, ±1 frame, ±1 segundo, ou tudo a partir do playhead. Toda conta é em frames inteiros.
- Exportar capítulos do YouTube (com avisos das regras do YouTube) e CSV.
- Localizar e substituir em nomes e comentários; numeração automática com prefixo/sufixo ("Cena 01, Cena 02…").
- Duplo clique no nome ou comentário da lista para editar ali mesmo.
- Modelos de marcador (nome, cor, tipo, comentário): aplicar na seleção ou criar um marcador no playhead.
- Seleções salvas com nome, por sequência.
- Tempo: mesma duração para vários, distribuir igualmente, encaixar no corte mais próximo, remover duplicados e mesclar próximos.
- Importar de lista colada, CSV (inclusive o do Premiere), SRT, EDL ou JSON, com prévia; criar um marcador em cada corte.
- Exportar também lista de revisão, texto simples e JSON.
- Copiar marcadores para outra sequência; trazer marcadores do clipe para a sequência e enviar da sequência para o clipe.
- Checklist (marcar como feito, progresso por cor) e legenda das cores.
- Atualiza a lista sozinho: ao trocar de sequência e com uma verificação leve a cada poucos segundos (o Premiere não avisa quando um marcador é criado na timeline).

## Requisitos

- **Premiere Pro 26.5 ou mais novo** (Windows ou macOS).
- Para carregar durante o desenvolvimento: **UXP Developer Tool 2.2 ou mais novo** (gratuito, pelo Creative Cloud).
- Para rodar os testes automáticos: **Node.js** (qualquer versão atual).

## Instalar para usar (pacote .ccx)

1. Feche o Premiere.
2. Dê dois cliques no arquivo `HelmetMarker-<versão>.ccx`. O app Creative Cloud abre e instala o plugin.
3. Abra o Premiere e vá em **Janela › Plug-ins UXP › Helmet Marker** (*Window › UXP Plugins*).

## Carregar durante o desenvolvimento (UXP Developer Tool)

Feito uma vez:

1. No app **Creative Cloud**, vá em **Todos os aplicativos**, procure **UXP Developer Tools** e clique em **Instalar**.
2. Abra o **UXP Developer Tool**. Na primeira vez ele pede para ativar o modo de desenvolvedor: clique em **Enable** (pede permissão de administrador).
3. No Premiere, vá em **Configurações › Plug-ins** (*Settings › Plugins*), marque **Ativar modo de desenvolvedor** (*Enable developer mode*) e reinicie o Premiere.

Toda vez:

1. Abra o Premiere e um projeto.
2. No UXP Developer Tool, clique em **Add Plugin** e escolha o arquivo `plugin\manifest.json` desta pasta (só na primeira vez; depois ele já aparece na lista).
3. Na linha do Helmet Marker, clique em **••• › Load** (ou **Load & Watch**, que recarrega sozinho quando o código muda).
4. O painel abre no Premiere. Se fechar, reabra em **Janela › Plug-ins UXP › Helmet Marker**.
5. Se o `manifest.json` mudar, clique em **Unload** e depois **Load** de novo.
6. **Debug** abre o console do painel (útil para mandar mensagens de erro).

## Carregar sem o UXP Developer Tool (copiando a pasta)

Funcionou no Premiere 26.5.2, mas a Adobe não documenta este caminho.

1. No Premiere, vá em **Configurações › Plug-ins** (*Settings › Plugins*), marque **Ativar modo de desenvolvedor** (*Enable developer mode*) e feche o Premiere.
2. Crie a pasta `%APPDATA%\Adobe\UXP\Plugins\External\com.derpbizinoto.helmetmarker_<versão>` (ex.: `..._0.3.0`).
3. Copie para dentro dela **o conteúdo** da pasta `plugin\` (não a pasta em si).
4. Abra o Premiere: **Janela › Plug-ins UXP › Helmet Marker**.

A cada atualização, copie os arquivos de novo e reinicie o Premiere. Se a versão mudar, o nome da pasta muda junto: crie a nova e apague a antiga.

## Empacotar (.ccx)

Duas formas, o resultado é o mesmo:

- **Script:** na pasta do projeto, rode
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\empacotar.ps1
  ```
  Ele roda os testes, confere a versão e gera `dist\HelmetMarker-<versão>.ccx` e um `.zip` com o .ccx, a licença e os leia-me.
- **UXP Developer Tool:** na linha do plugin, **••• › Package**, e escolha a pasta de destino.

## Testes automáticos

```powershell
node tests\run-tests.js
```

Cobrem a parte que não depende do Premiere (`plugin\core\`): contas de frame e timecode em 23,976, 25, 29,97 (drop e non-drop), 59,94 e 60 fps, identidade dos marcadores, cores, seleção, deslocamento e traduções. Não substituem o teste dentro do Premiere.

## Organização do código

| Pasta | O que tem |
|---|---|
| `plugin/core/` | Lógica pura (frames, timecode, filtros, seleção, planos de alteração, importação e exportação). Nenhuma chamada ao Premiere; testada no Node. |
| `plugin/premiere/` | Camada fina que lê marcadores e aplica as alterações numa única transação. |
| `plugin/ui/` | O painel. |
| `plugin/strings/` | Todos os textos da interface (português e inglês). |

## Idioma

O painel abre em inglês. Troque em **Language / Idioma**, no canto superior direito; a escolha fica salva.
