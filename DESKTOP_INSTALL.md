# Como Gerar o Instalador Local (Desktop)

Este projeto foi configurado para ser transformado em um aplicativo desktop (.exe, .dmg, .AppImage) utilizando **Electron**.

## Pré-requisitos
- [Node.js](https://nodejs.org/) instalado em seu computador.
- Git (para clonar o repositório, caso necessário).

## Passos para Rodar Localmente (Desenvolvimento)
1. Baixe o código fonte do seu projeto.
2. Abra o terminal na pasta do projeto.
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o modo desktop:
   ```bash
   npm run electron:dev
   ```

## Passos para Gerar o Instalador (.exe)
Para criar o arquivo de instalação final:
1. No terminal, execute:
   ```bash
   npm run electron:build
   ```
2. O instalador será gerado dentro da pasta `dist-electron/`.

## Observações
- O banco de dados e as sessões do WhatsApp serão salvos localmente na pasta do aplicativo.
- Certifique-se de que a porta `3000` não esteja sendo usada por outro programa antes de iniciar.
