# Meraki Artes Digitais — Identidade Visual para Festas com IA

Plataforma web que gera a identidade visual completa de uma festa com IA: convite, lembrete, mascote com o rosto da criança, elementos, fundo, papel digital, logotipo, brasão, lembrancinha e paleta (kit de 12 itens), com marca d'água na prévia e downloads limpos depois do pagamento.

## Documentação completa

Estado do projeto, fluxo de geração, decisões, aprendizados e a **lista de tarefas do que falta** estão em **[AI_HANDOFF.md](AI_HANDOFF.md)**. Leia antes de alterar qualquer coisa.

## Como executar

Pré-requisitos: Node.js e um arquivo `server/.env` (modelo em `server/.env.example`).

```bash
cd server
npm install
npm run dev
```

Acesse **http://localhost:3001/** (o backend também serve o frontend). Depois de alterar o código, use Ctrl+F5 no navegador.

> Não use `npm run dev` da raiz: ele sobe um servidor de arquivos na porta 3000 que serve a pasta inteira, inclusive `server/.env`.

## Testes manuais

Os scripts `server/test-*.js` chamam as APIs de IA e **gastam crédito**. Veja o AI_HANDOFF.md (seção 8).
