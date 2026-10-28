# Nyxcord — sala online para amigos

Projeto inicial de chat em tempo real no navegador, com salas por código, lista de participantes e funções experimentais de voz/compartilhamento de tela. A interface atual é escura, roxa e personalizada. Para copiar fielmente o visual do Vyracord, ainda precisamos de capturas de tela do aplicativo original: o arquivo `.lnk` é apenas um atalho, não contém os arquivos completos do programa.

## Publicar online (sem instalar programas no computador)

O jeito mais direto deste projeto é usar GitHub + Render pelo navegador.

### 1. Criar um repositório no GitHub
1. Entre em https://github.com e crie uma conta ou faça login.
2. Clique em **New repository**. Dê um nome, por exemplo `nyxcord-amigos`, e crie o repositório.
3. Envie os arquivos desta pasta para o repositório. O arquivo `package.json` e `server.js` precisam ficar na raiz do repositório (não dentro de uma segunda pasta `nyxcord`).

### 2. Publicar no Render
1. Entre em https://render.com e conecte sua conta do GitHub.
2. No painel do Render, clique em **New +** e escolha **Blueprint** (se aparecer essa opção) ou **Web Service**.
3. Se escolher Blueprint, selecione o repositório e o Render usará o `render.yaml`.
4. Se escolher Web Service manualmente, use: **Build Command** `npm install` e **Start Command** `npm start`. Escolha o plano gratuito para testar.
5. Aguarde o deploy terminar e abra o endereço `https://...onrender.com` que o Render mostrar. Esse será o link para mandar aos amigos.

## Como entrar na mesma sala

1. Abra o site publicado e digite seu nome.
2. Escolha um código de sala simples, por exemplo `galera-da-noite`.
3. Use o botão de convite para copiar o link da sala e mande aos amigos. Todos precisam usar o mesmo código/link.

## Limitações importantes

- É um protótipo para testes com amigos, não um serviço seguro para uso público amplo. Qualquer pessoa com o código da sala pode tentar entrar. Não use para conversas sensíveis.
- Mensagens e participantes ficam em memória; quando o servidor reinicia, o histórico pode ser perdido.
- No plano gratuito do Render, o serviço pode adormecer após um período sem tráfego e demorar para acordar.
- Voz e compartilhamento de tela usam WebRTC e ainda são experimentais. Algumas redes podem exigir configuração adicional de TURN; teste antes de depender dessas funções. O acesso público usa HTTPS, necessário para compartilhamento de tela nos navegadores.
- Para reproduzir o Vyracord de forma mais fiel, envie capturas de tela das telas principais do aplicativo original. O atalho `.lnk` sozinho não permite extrair o design ou o código do app.
