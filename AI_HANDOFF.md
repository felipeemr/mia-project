# AI HANDOFF — Meraki Artes Digitais (Plataforma Web de Identidade Visual para Festas com IA)

> **DOCUMENTO DE TRANSIÇÃO TÉCNICA E TRANSFERÊNCIA DE CONTEXTO**  
> **Destinado a:** Nova Inteligência Artificial / Desenvolvedor(a) assumindo a evolução da plataforma.  
> **Data de Atualização:** Setembro de 2026  
> **Versão do Protótipo/Fase:** Fase 2 em Implementação (Backend Node.js + Supabase + Pipeline de IA)


---

## 1. Resumo do projeto

A **Plataforma Meraki Artes Digitais** é um aplicativo web online (Single Page Application - SPA), responsivo e mobile-first, voltado para a criação e geração automática de **Identidades Visuais Completas para Festas** utilizando inteligência artificial.

### Problema que Resolve
Normalmente, a criação de uma papelaria de festa completa (convites, lembretes, monogramas, brasões, papéis digitais e mascotes) exige a contratação de uma designer por semanas ou a compra de kits genéricos pré-prontos. A plataforma Meraki resolve isso permitindo que mães, aniversariantes ou conviteiras profissionais gerem um kit completo de 15 peças delicadas em estilo aquarela em poucos minutos.

### Objetivos do Produto
1. **Público Cliente Final (Mães, Aniversariantes, Família):** Acessar a plataforma, preencher dados básicos e gerar um kit visual com marca d'água para prévia. Caso aprove, realiza o pagamento do kit individual e desbloqueia os downloads limpos em alta resolução (PNG, PDF e ZIP).
2. **Público Profissional (Conviteiras e Designers de Festas):** Assinar um plano mensal (via Kiwify) para ter um painel exclusivo (Portal da Conviteira), com limite diário/mensal de gerações sem marca d'água, permitindo criar e salvar múltiplos projetos para suas clientes.
3. **Escopo de Eventos no Lançamento:**
   - Aniversário Infantil (Mascotes infantis, aquarela delicada, dados de criança).
   - 15 Anos / Debutante (Coroas, monogramas sofisticados, realeza).
   - Aniversário Adulto (Eucalipto, ramos, arranjos secos e florais minimalistas).
   - *(Casamentos fora do escopo inicial)*.

---

## 2. Estado atual

* **Fase 1 (Protótipo Visual Navegável SPA):** `[IMPLEMENTADO]`  
  Interface 100% navegável construída com HTML5, CSS3 puro (Design System customizado com tokens de marca) e JavaScript Vanilla.
* **Exposição dos 15 Itens:** `[IMPLEMENTADO]`  
  A tela de prévia exibe a totalidade dos 15 itens do kit em uma única galeria vertical contínua com rolagem suave (Smooth Scroll) guiada por abas âncoras.
* **Identidade Visual e Mascotes:** `[IMPLEMENTADO]`  
  Identidade da assistente visual **Mia** integrada por toda a interface (Landing page, Loader animado, Modal de desbloqueio). Fontes oficiais (*Playfair Display*, *Poppins*, *Great Vibes*, *Sacramento*) integradas via Google Fonts.
* **Layout dos Convites e Lembretes:** `[IMPLEMENTADO]`  
  Textos dinâmicos formatados em layout retrato no topo em área em branco para evitar qualquer sobreposição com o rodapé desenhado (personagens aquarelados em PNG/JPG). O lembrete de WhatsApp compartilha exatamente o mesmo fundo e estética do convite.
* **Bypass & Ferramentas de Desenvolvedor:** `[IMPLEMENTADO]`  
  Painel flutuante de testes (FAB `🛠️`) para alternância instantânea entre as 10 telas e preenchimento automático de dados mock (Helena 5 anos, Giovanna 15 anos, Carolina 40 anos). Modo de bypass de limites e pagamentos ativo no script para homologação imediata.

### Fase 2 — Estado (Setembro 2026)
* **Camada de API no Frontend (`app.js`):** `[IMPLEMENTADO]`  
  Funções `apiCall`, `apiGenerateKit`, `applyRealAssets`, `apiLogin/Logout` adicionadas no topo do `app.js`. O frontend tenta o backend real (porta 3001) e cai automaticamente em modo mock se offline.
* **Backend Node.js/Express (`server/`):** `[IMPLEMENTADO - AGUARDA CONFIGURAÇÃO]`  
  Estrutura completa criada com rotas, serviços e middleware. Requer instalação do Node.js e configuração das chaves no `.env`.
* **Banco de Dados Supabase:** `[AGUARDA CONFIGURAÇÃO]`  
  Schema SQL criado em `server/migrations/001_initial_schema.sql`. Requer criação do projeto no Supabase e execução do script.
* **Pipeline de IA (Replicate/OpenAI):** `[IMPLEMENTADO - AGUARDA API KEY]`  
  Serviço `server/services/ai.js` com prompts calibrados para aquarela. Detecta automaticamente `REPLICATE_API_TOKEN` ou `OPENAI_API_KEY`.
* **Renderizador 300 DPI (Sharp):** `[IMPLEMENTADO]`  
  `server/services/renderer.js` gera convite e lembrete em 2480×3508px com textos SVG, respeitando `padding-bottom: 32%`.
* **Downloads ZIP:** `[IMPLEMENTADO]`  
  `server/routes/downloads.js` gera PNG, PDF e kit.zip completo com todos os 15 itens.
* **Integração Real de Pagamento (Fase 3):** `[PENDENTE / PLANEJADO]`  
  Rotas preparadas. Webhook Kiwify/Mercado Pago a implementar na Fase 3.

---

## 3. Histórico e contexto

O projeto foi concebido a partir da marca **Meraki Artes Digitais**. A usuária/proprietária da marca solicitou expressamente:
1. **Foco Mobile-First:** O uso predominante será via dispositivos móveis (smartphones). O fluxo de formulário em 3 etapas, upload de fotos e visualização das artes foram rigorosamente otimizados para telas pequenas.
2. **Estética Exclusiva (Sem "Cara de IA Plástica"):** Artes delicadas, tons aquarelados, traços manuais e papelaria refinada. A assistente **Mia** (uma personagem amigável de cabelos turquesa e blusa rosa) orienta o usuário em toda a jornada.
3. **Reformulação do Convite e Lembrete:** Durante o desenvolvimento, o convite e o lembrete apresentavam textos cobrindo as ilustrações do rodapé. Foi implementada uma estrutura com `flex-start` e `padding-bottom: 32%` para garantir que as informações (nome, idade, data, local e frase) flutuem livremente na parte superior limpa da arte.
4. **Visualização Completa com Marca d'Água:** O cliente exige ver a prévia de **todos os 15 itens** com marca d'água protetora antes de ser direcionado para o checkout.

---

## 4. Objetivos originais

| Requisito Original | Estado Atual | Observações |
|---|---|---|
| Plataforma web responsiva (mobile e desktop) | `[IMPLEMENTADO]` | Sem containers simulados de celular; layout 100% fluído |
| Mascot/Assistente Mia integrada | `[IMPLEMENTADO]` | Presente no Hero, Loader, Modais e Rodapés |
| Suporte a Infantil, 15 Anos e Adulto | `[IMPLEMENTADO]` | Alternância funcional no formulário com preenchimento rápido |
| Gerar 15 itens da papelaria em peças separadas | `[PARCIAL]` | Exibidos isoladamente no protótipo frontend; falta API de corte/IA |
| Preenchimento automático do convite e lembrete | `[IMPLEMENTADO]` | Convite em formato retrato e lembrete RSVP alinhados |
| Marca d'água protetora em prévias | `[IMPLEMENTADO]` | Banner explicativo e padrão repetição CSS sobre as artes |
| Painel da Conviteira (Profissional) com limites | `[IMPLEMENTADO]` | Telas de planos, login, dashboard e estatísticas mockadas |
| Integração com APIs de IA (Midjourney/Flux/SD/OpenAI) | `[PLANEJADO]` | Previsto para a Fase 3 |
| Pagamento PIX e Cartão via Kiwify | `[PLANEJADO]` | Telas mockadas; webhook e checkout real previstos para a Fase 4 |

---

## 5. Funcionalidades concluídas

1. **Header Responsivo Global:** Navegação desktop e drawer mobile hambúrguer com transição suave.
2. **Landing Page de Alta Conversão (`#view-home`):**
   - Apresentação da Mia e proposta de valor.
   - Badges detalhando os 15 itens entregues no kit.
   - Timeline passo a passo de como funciona.
   - Vitrine de estilos sugeridos e amostragem de paletas e tipografias.
3. **Formulário Dinâmico em 3 Passos (`#view-generator`):**
   - Passo 1: Escolha do evento (Infantil, 15 Anos, Adulto).
   - Passo 2: Preenchimento de Nome, Idade, Data, Horário, Local, Tema e Frase do Convite.
   - Passo 3: Uploads simulados de 2 fotos da aniversariante, referências visuais e observações.
4. **Tela de Carregamento Mágico (`#view-generating`):**
   - Loader animado com a imagem da Mia.
   - Barra de progresso percentual dinâmica e troca sequencial de status e dicas.
5. **Galeria de Resultados com 15 Itens (`#view-result`):**
   - Exposição vertical contínua dividida por 4 grupos (Destaques, Elementos, Papéis, Marca).
   - Menu de abas superiores com rolagem suave (Smooth Scroll) até as seções.
   - Sobposição de marca d'água CSS (`.watermarked`).
   - Botões para "AMEI, QUERO MEU KIT" e "GERAR OUTRA OPÇÃO".
6. **Fluxo de Checkout e Pagamento Simulado (`#view-checkout`):**
   - Resumo do kit com exibição de valor dinâmico.
   - Abas para PIX (com QR Code SVG e código copia e cola) e Cartão de Crédito.
   - Botão de simulação de aprovação imediata.
7. **Área de Downloads Liberados (`#view-download`):**
   - Animação de celebração com a Mia.
   - Links diretos para download de PNG, PDF e pacote ZIP de alta resolução.
8. **Portal Profissional (`#view-pro-sales`, `#view-pro-login`, `#view-pro-dashboard`):**
   - Página de vendas do Plano Conviteira Pró (R$ 89,90/mês).
   - Login com e-mail/senha.
   - Dashboard exibindo contadores de gerações (Hoje e Mês) e lista de projetos recentes.
9. **Painel de Configuração Administrativa (`#view-admin`):**
   - Ajuste dinâmico de preço do kit (R$ 47,90), limites grátis, limites diários/mensais da conviteira.
   - Checkboxes de Bypass de Pagamento e Gerações Infinitas.
   - Tabela de histórico do banco de dados simulado.
10. **Painel Flutuante do Desenvolvedor (`dev-float-control-panel`):**
    - Botão `🛠️` para transitar entre qualquer uma das 10 telas e aplicar dados de teste instantaneamente.

---

## 6. Funcionalidades em desenvolvimento

* **Geração Modular de Elementos Separados:**  
  `[PARCIAL]` O frontend já exibe o Brasão, Monograma, Mascote e Logo em contêineres individuais e limpos. A próxima IA deverá conectar esses contêineres aos outputs individuais que serão retornados pelos pipelines da API de IA.

---

## 7. Funcionalidades pendentes

1. **Backend & Autenticação Real (Node.js/Python/Supabase/Firebase):**  
   Substituir o `localStorage` e o objeto `appState` por banco de dados real e autenticação JWT ou Supabase Auth.
2. **Pipeline de Geração de Imagem com IA:**  
   Integração com APIs de geração de imagens (ex: Replicate, Flux, Midjourney API, DALL-E 3 ou Stable Diffusion XL) usando prompts calibrados para estilo aquarela e papelaria.
3. **Módulo de Renderização e Sobreposição de Tipografia (Canvas / Sharp / Canvas-Node):**  
   Preenchimento dinâmico do nome, data e local no convite e no lembrete via backend/canvas para geração de PDFs e PNGs finais limpos em 300 DPI para impressão.
4. **Remoção de Fundo (Background Removal):**  
   Integração com APIs como `remove.bg` ou modelos rembg locais para extrair mascotes e elementos em PNG com fundo transparente.
5. **Integração de Pagamento Real (Kiwify / Mercado Pago / Stripe):**  
   Geração de QR Code PIX real via API e recepção de Webhooks para alteração do status do projeto para `paid`.
6. **Empacotamento ZIP Automático:**  
   Geração server-side de arquivo `.zip` contendo os 15 arquivos finais em alta resolução para download do usuário.

---

## 8. Bugs e problemas conhecidos

1. **Dependência de Node/Python no Windows:**
   - **Problema:** Em alguns ambientes Windows sem Node.js instalado globalmente no `PATH`, o comando `npm run dev` pode falhar.
   - **Solução Implementada:** Criado o script `start.ps1`, um servidor web nativo em PowerShell usando `.NET HttpListener` na porta 3000.
2. **Sobreposição de Textos sobre Ilustrações:**
   - **Status:** `[RESOLVIDO NO FRONTEND]`
   - **Causa:** Textos centralizados verticalmente em imagens com desenhos no rodapé.
   - **Solução:** Aplicada classe `.invite-text-overlay` e `.reminder-overlay` com `align-items: flex-start` e `padding-bottom: 32%`. Mantê-la no renderizador final.

---

## 9. Arquitetura

O protótipo atual adota uma arquitetura **Single Page Application (SPA) Monolítica Frontend** leve, sem dependências de frameworks de compilação (zero Webpack, Vite ou Babel), facilitando manutenção e carregamento instantâneo.

```
[ Navegador do Usuário (Mobile / Desktop) ]
       │
       ├── index.html   ──> Estrutura semântica das 10 exibições (Views)
       ├── styles.css   ──> Design System, tokens CSS, breakpoints e animações
       └── app.js       ──> Roteamento SPA, manipulação de estado (appState) e dados Mock
```

### Arquitetura Alvo Recomendada para Produção (Próxima Fase)
```
[ Frontend SPA (React / Next.js ou HTML/JS atual) ]
       │
       ├── API Gateway / Node.js Backend (Express ou Fastify / Next API routes)
       │      ├── Auth Service (Supabase / Firebase Auth)
       │      ├── Payment Webhooks (Kiwify / Mercado Pago)
       │      ├── AI Pipelines (Replicate / Flux / OpenAI)
       │      ├── Image Processing & Canvas (Node Canvas / Sharp / Rembg)
       │      └── ZIP Storage Manager (AWS S3 / Supabase Storage)
       └── Database (PostgreSQL / Supabase)
```

---

## 10. Estrutura de pastas

```
meraki-plataforma/
│
├── AI_HANDOFF.md           # [ESTE DOCUMENTO] Handoff técnico completo para a nova IA
├── README.md               # Guia rápido de introdução e instrução de execução
├── index.html              # Markup de todas as 10 telas e componentes da plataforma
├── styles.css              # Estilos globais, tokens da marca, layout responsivo e utilitários
├── app.js                  # Lógica da aplicação, navegação SPA, estado e gerenciador mock
├── package.json            # Configuração de scripts npm e metadados
├── start.ps1               # Servidor web nativo PowerShell .NET (disponível sem Node/Python)
│
└── assets/                 # Imagens, mascotes, logos e fundos aquarelados
    ├── logo.jpg            # Logotipo oficial Meraki Artes Digitais
    ├── mia.png             # Personagem / Mascot Mia (Fundo transparente)
    ├── girl_1.jpg          # Mascote modelo 1 (Infantil / Aniversariante)
    ├── girl_2.jpg          # Mascote modelo 2 (Debutante)
    ├── infantil_bg.jpg     # Fundo aquarelado tema Jardim Encantado
    ├── debutante_bg.jpg    # Fundo aquarelado tema Princesa Realeza
    ├── adulto_bg.jpg       # Fundo aquarelado tema Eucalipto / Floral
    ├── elementos_sheet.jpg # Prancha com múltiplos elementos artísticos
    ├── ref_ui_1.jpg        # Referência visual de interface do usuário
    └── ref_ui_2.jpg        # Referência visual de interface do usuário
```

---

## 11. Tecnologias e dependências

### Tecnologias Utilizadas no Protótipo Atual
- **Linguagem:** HTML5, CSS3, JavaScript (ES6+ Vanilla).
- **Fontes de Terceiros (Google Fonts CDN):**
  - Titulares / Elegantes: `Playfair Display` (Serif).
  - Corpo de texto / Leitura: `Poppins` (Sans-serif).
  - Acentos Cursivos: `Great Vibes` e `Sacramento` (Cursive).
- **Servidor Local de Teste:**
  - Node `http-server` (porta 3000).
  - Script nativo PowerShell `.NET HttpListener` (`start.ps1`).

---

## 12. Banco de dados

No momento, o banco de dados é **simulado em memória e persistido no `localStorage`** do navegador sob a chave `meraki_state_collage_v3`.

### Esquema de Dados Mock Atual (`appState`)

#### Tabela `projects` (Simulada)
- `id` (integer/timestamp): Identificador único do projeto.
- `type` (string): `'infantil'`, `'debutante'`, ou `'adulto'`.
- `name` (string): Nome da aniversariante / criança.
- `age` (string): Idade formatada (ex: `"5 anos"`).
- `date` (string): Data formatada (`"DD/MM/AAAA"`).
- `time` (string): Horário (`"15:30"`).
- `location` (string): Endereço e local do evento.
- `phrase` (string): Frase personalizada do convite.
- `theme` (string): Nome do tema (ex: `"Jardim Encantado"`).
- `notes` (string): Observações de estilo e cores.
- `watermarked` (boolean): Se `true`, exibe marca d'água no frontend.
- `bgTemplate` (string): Caminho do fundo gerado/modelo.
- `initialLetter` (string): Primeira letra para o brasão/monograma.

---

## 13. APIs e integrações

### Integradas no Protótipo Visual
- Google Fonts API (Webfonts).

### Integrações Planejadas para as Próximas Fases
1. **API de Geração de Imagens (IA):**
   - Servidores Replicate / Flux.1 / Midjourney (via proxy API) para gerar a arte de fundo, ilustrações e mascotes.
2. **API de Remoção de Fundo:**
   - `remove.bg` API para isolar elementos avulsos e mascote com fundo transparente.
3. **Gateway de Pagamento / Webhooks (Kiwify / Mercado Pago):**
   - Criação de cobrança PIX/Cartão e recebimento de notificações HTTP POST.

---

## 14. Variáveis de ambiente

Nas próximas fases com backend Node.js / Python, as seguintes variáveis serão necessárias:

```env
# Servidor Backend
PORT=3000
NODE_ENV=development

# Banco de Dados
DATABASE_URL=<DATABASE_URL>

# Gateway de Pagamento (Kiwify / Mercado Pago)
PAYMENT_API_KEY=<PAYMENT_API_KEY>
PAYMENT_WEBHOOK_SECRET=<PAYMENT_WEBHOOK_SECRET>

# Integrações de IA (Geração de Imagens)
REPLICATE_API_TOKEN=<REPLICATE_API_TOKEN>
OPENAI_API_KEY=<OPENAI_API_KEY>

# Armazenamento de Arquivos
S3_BUCKET_NAME=<S3_BUCKET_NAME>
S3_ACCESS_KEY=<S3_ACCESS_KEY>
S3_SECRET_KEY=<S3_SECRET_KEY>
```

---

## 15. Regras de negócio

1. **Lista Oficial dos 15 Itens do Kit:**
   - 01. Convite Principal Retrato (Alta resolução).
   - 02. Lembrete da Festa (Card de contagem regressiva RSVP para WhatsApp).
   - 03. Mascote Oficial da Aniversariante (Ilustração estilo bonequinha aquarelada).
   - 04. Prancha Geral de Elementos Separados (Grelha para recortar).
   - 05. Elementos Principais (Arquivo isolado).
   - 06. Elementos Complementares (Borboletas, florais, laços isolados).
   - 07. Ilustrações do Tema (Guirlandas e fitas decorativas).
   - 08. Fundo Personalizado Limpo (Sem nenhum texto).
   - 09. Papel Digital Estampado (Textura repetitiva para embalagens).
   - 10. Logotipo da Festa (Texto vetorizado com o nome do tema).
   - 11. Brasão com Inicial (Moldura oficial).
   - 12. Monograma Elegante (Iniciais para selos/envelopes).
   - 13. Paleta de Cores Oficial (Hexadecimais).
   - 14. Tipografia Principal (Serifada recomendada).
   - 15. Tipografia Complementar (Sans-serif recomendada).

2. **Diferenciação de Públicos:**
   - **Cliente Final:** Permissão de até 2 gerações prévia com marca d'água grátis. Pagamento avulso por kit desbloqueia os downloads limpos.
   - **Profissional (Conviteira):** Assinatura mensal. Acesso ao Portal da Conviteira com limite de 6 gerações/dia e 60 gerações/mês sem marca d'água.

3. **Formato do Convite e Lembrete:**
   - O convite deve ser estritamente em **Formato Retrato** (Vertical, ideal para visualização em telas de celular e envio via WhatsApp).
   - O lembrete deve conter o texto padrão: `"LEMBRETE - Faltam apenas X dias para a minha festa e você não pode perder."`

---

## 16. Decisões técnicas

1. **CSS Puro vs Tailwind/Bootstrap:** Optou-se por CSS nativo modular e flexível com variáveis `:root` para garantir total controle sobre o delicado e refinado Design System da marca Meraki sem sobrescritas de frameworks.
2. **Abas como Smooth Scroll Anchors:** Em vez de esconder itens em abas separadas na tela de resultados, o protótipo mantém **todos os 15 itens visíveis simultaneamente** em rolagem contínua. As abas do topo servem como atalhos de rolagem suave.
3. **Inclusão do Servidor Nativo PowerShell (`start.ps1`):** Adicionado para permitir rodar o protótipo em qualquer máquina Windows imediatamente, sem pré-requisitos de instalação de ambiente Node ou Python.

---

## 17. Abordagens que não funcionaram

1. **Textos Centralizados sobre o Fundo do Convite:**
   - *Tentativa:* Centralizar verticalmente os campos de texto no meio do convite.
   - *Resultado Ruim:* Os dados (nome, local, data) ficavam sobrepostos aos personagens e desenhos de aquarela desenhados na base da arte.
   - *Solução Adotada:* Usar `display: flex; align-items: flex-start` com um `padding-bottom: 32%` na div overlay, forçando o bloco textual a ocupar apenas o terço superior limpo da imagem.
2. **Esconder Itens em Abas Ocultas:**
   - *Tentativa:* Ocultar os papéis digitais e monogramas sob abas separadas na tela de resultado.
   - *Resultado Ruim:* A usuária solicitou ver **todos os itens prontos de uma só vez** com marca d'água ao rolar a página.
   - *Solução Adotada:* Galeria vertical contínua com abas atuando apenas como links de navegação por âncora.

---

## 18. Como executar o projeto

### Opção A: Via PowerShell (Windows Nativo - Recomendado)
1. Abra o Terminal / PowerShell na pasta do projeto:
   ```powershell
   cd C:\Users\danie\.gemini\antigravity\scratch\meraki-plataforma
   ```
2. Execute o script de inicialização:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start.ps1
   ```
3. O navegador será aberto automaticamente na URL: `http://localhost:3000/`

### Opção B: Via Node.js (Se instalado no sistema)
1. Acesse o diretório do projeto:
   ```bash
   cd meraki-plataforma
   ```
2. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:3000/` no navegador.

---

## 19. Como testar

1. **Testando a Landing Page:**
   - Redimensione o navegador para largura mobile (375px) e desktop (1200px+).
   - Verifique o menu hambúrguer no mobile.
2. **Testando a Geração Completa:**
   - Clique em **"CRIAR MINHA FESTA"**.
   - No Passo 1, altere entre Infantil, 15 Anos e Adulto.
   - Clique no painel flutuante de testes `🛠️` no canto inferior direito e clique em **"🐰 Helena (Infantil)"** para preenchimento rápido.
   - Clique em **"CRIAR MINHA IDENTIDADE ✨"**.
3. **Testando a Prévia e Rolagem dos 15 Itens:**
   - Observe a animação do loader com a Mia.
   - Na tela de resultados, clique nas abas superiores (1. Destaques, 2. Elementos, 3. Papéis, 4. Marca) e confirme se a página rola suavemente para cada grupo.
   - Confirme a marca d'água sob todas as peças.
4. **Testando Checkout e Desbloqueio:**
   - Clique em **"AMEI, QUERO MEU KIT COMPLETO"**.
   - Clique em **"🟢 APROVAR PAGAMENTO PIX"**.
   - Verifique se o kit é liberado limpo e se os botões de download de PNG, PDF e ZIP funcionam.

---

## 20. Próximas tarefas

### Alta prioridade
- [ ] Definir o stack de backend (Node.js/Express, Next.js API Routes ou Python/FastAPI).
- [ ] Escolher e cadastrar API de geração de imagem por IA (Replicate/Flux ou Midjourney API).
- [ ] Implementar motor server-side de Canvas/Sharp para renderização limpa do convite e lembrete em alta resolução (300 DPI) com as fontes vetorizadas.

### Média prioridade
- [ ] Conectar banco de dados PostgreSQL / Supabase para armazenamento de usuários e projetos.
- [ ] Integrar checkout da Kiwify ou Mercado Pago para cobrança de kits e assinaturas.
- [ ] Implementar remoção automática de fundo em imagens (Background Removal API).

### Baixa prioridade
- [ ] Adicionar suporte a novos tipos de eventos futuros (Casamentos, Batizados).
- [ ] Desenvolver editor visual avançado tipo "Canva simples" para ajuste fino dos textos pelo cliente após a geração.

---

## 21. Checklist para continuar o desenvolvimento

- [ ] Verificar se os arquivos `index.html`, `styles.css`, `app.js` e a pasta `assets/` estão intactos.
- [ ] Testar a execução do servidor local na porta 3000.
- [ ] Estudar a estrutura do objeto `appState` em `app.js`.
- [ ] Garantir que o layout do convite permaneça no formato retrato.
- [ ] Preservar as regras do Design System da marca Meraki (cores `#69D7D1`, `#F7A8C8` e personagem Mia).

---

## 22. Instruções para a próxima IA

1. **Não Reescreva o Frontend Existente sem Necessidade:** A Fase 1 (Protótipo Visual e Design System) já foi totalmente aprovada e atende a todos os requisitos estéticos e de usabilidade da usuária.
2. **Preserve a Estrutura de Layout do Convite:** Mantenha os textos centralizados e afastados do rodapé (`align-items: flex-start`, `padding-bottom: 32%`) para não encobrir as ilustrações.
3. **Respeite o Formato Retrato:** Convites e lembretes devem ser sempre mantidos em proporção retrato para telas de smartphones.
4. **Mantenha os 15 Itens Visíveis na Prévia:** Não esconda peças sob abas fechadas; o cliente precisa rolar a tela e ver todo o universo de itens gerados.
5. **Atualize Este Documento (`AI_HANDOFF.md`):** Sempre que implementar o backend, banco de dados ou integrações de IA, atualize este arquivo registrando as novas decisões técnicas.

---

## 23. Contexto adicional do histórico da conversa

Nesta seção está consolidado todo o histórico de decisões, interações, correções e preferências expressas pela usuária:

* **Marca & Assistente:** `[IMPLEMENTADO]` A assistente **Mia** deve figurar ativamente na interface para passar um tom acolhedor e humanizado.
* **Tipografia Personalizada:** `[IMPLEMENTADO]` A usuária rejeitou fontes genéricas e solicitou fontes elegantes e refinadas para festas. Foram aplicadas *Playfair Display*, *Poppins*, *Great Vibes* e *Sacramento*.
* **Organização Modular dos 15 Itens:** `[IMPLEMENTADO]` Todos os 15 itens listados no kit oficial estão mapeados e renderizados no protótipo.
* **Formato de Envio Virtual:** `[IMPLEMENTADO]` O convite e o lembrete foram desenhados especificamente em formato retrato para envio por WhatsApp ou redes sociais.
* **Limite de Gerações:** `[IMPLEMENTADO]` O sistema possui controle de limite para o público final (1 geração + 1 regeneração grátis por padrão) e controle para o profissional (6/dia e 60/mês). No protótipo atual, os limites foram elevados no `DOMContentLoaded` para facilitar os testes da usuária.
* **Soluções que Falharam e Foram Corrigidas:** `[IMPLEMENTADO]` Textos cobrindo personagens no rodapé do convite e lembrete em formato retangular simples sem arte compartilhada foram substituídos pelo design atual com fundo unificado e espaçamento ajustado.

---
*Fim do documento AI_HANDOFF.md*
