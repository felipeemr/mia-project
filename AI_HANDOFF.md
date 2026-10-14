# AI HANDOFF — Meraki Artes Digitais (Plataforma Web de Identidade Visual para Festas com IA)

> **Documento de continuidade do projeto.** Quem for retomar (pessoa ou IA) deve ler este arquivo antes de mexer em qualquer coisa.
> **Última atualização:** 13/10/2026 · **Branch de trabalho:** `feat/kit-completo-gemini` (a `main` do GitHub ainda não tem este trabalho até o PR ser aceito).

---

## 1. Resumo do projeto

Aplicativo web (SPA, mobile-first) que gera a **identidade visual completa de uma festa** com IA: convite, lembrete, mascote com o rosto da criança, elementos, fundo, papel digital, logotipo, brasão, lembrancinha e paleta. A cliente preenche os dados, envia **1 foto** da criança e (opcional) referências de tema, vê o kit com **marca d'água** e, depois de pagar, baixa os arquivos limpos (PNG, PDF e ZIP).

- **Público final:** mães e aniversariantes. Até 1 geração + 1 regeneração grátis, com marca d'água. Pagamento avulso (R$ 47,90 por kit) libera os downloads.
- **Profissional (conviteira):** assinatura mensal (R$ 89,90), limites de 6 gerações/dia e 60/mês.
- **Eventos:** Infantil, 15 Anos (debutante) e Adulto.

---

## 2. Estado atual (13/10/2026)

| Parte | Estado |
|---|---|
| Frontend SPA (HTML/CSS/JS puro, 10 telas) | Implementado |
| Backend Node/Express + Supabase (banco + storage) | Implementado e rodando |
| Convite: arte única da IA com todos os textos em pt-BR, conferida por visão | Implementado |
| Provedor de imagem: **Gemini (principal)** + OpenAI (reserva) | Implementado |
| Kit de **12 itens** gerado a partir do convite | Implementado, **testado item a item; falta teste completo pelo site** |
| Paleta extraída do convite | Implementado |
| Pagamento real (Kiwify / Mercado Pago) | **Não implementado** (checkout é simulado; `NODE_ENV=development` libera downloads) |
| Downloads PNG/PDF/ZIP | Implementado no servidor; tela de downloads ainda aponta para exemplos |
| Testes automatizados | Não existem (só scripts manuais `server/test-*.js`) |

---

## 3. Como a geração funciona (fluxo de `POST /api/generate`)

1. O formulário envia dados, **1 foto** da criança, referências opcionais e **menino/menina**.
2. O servidor tenta salvar o projeto no Supabase (`projects`) e cria uma **pasta única** no storage (`projects/<id ou tmp-...>/`).
3. **Convite** (`services/ai.js`): análise da foto (GPT-4o) e das referências (até 3, GPT-4o) → tema "sanitizado" (só a atmosfera, sem nomes de personagens) → prompt → **Gemini** (`gemini-3-pro-image`, depois `gemini-3.1-flash-image-preview`) com a foto (e as referências como imagem) → **conferência por visão (GPT-4o)**: nome, idade, data, horário, endereço e frase corretos, **acentos**, texto cortado nas bordas e **texto extra**. Reprovou: gera de novo (máx. 2 gerações conferidas, prazo de ~170 s).
4. Se o Gemini estiver sobrecarregado/sem cota/sem chave, cai na **OpenAI** (`chatgpt-image-latest`, edição com foto). Se o filtro de segurança recusar, desce a escada: sem referências → sem foto → tema "original" → genérico.
5. **Identidade** (`services/identity.js`): paleta de 5 cores extraída do convite (agrupamento por matiz) e par de fontes escolhido pela imagem (usado só como reserva visual; a tela de tipografia foi removida).
6. **Itens do kit** (`services/kit.js`), usando o **convite aprovado como referência de estilo**, em paralelo (7 chamadas de IA): mascote, prancha de elementos, fundo limpo, logotipo, brasão, lembrete e agradecimento. Depois, por código: recorte da prancha, papel digital e lembrancinha.
7. Resposta ao navegador com as URLs; o navegador aplica tudo **antes** de mostrar a tela de resultado (nenhuma arte de exemplo pisca).

### Os 12 itens do kit

| # | Item | Como é feito | IA? |
|---|---|---|---|
| 01 | Convite principal | Gemini (foto + referências), texto pt-BR conferido | Sim |
| 02 | Lembrete (contagem regressiva, 2:3) | Gemini com o convite de referência; "FALTAM X DIAS" (máx. 5), nome, data, horário, endereço | Sim |
| 03 | Mascote oficial | Gemini com foto + convite; mesma personagem do convite, fundo branco | Sim |
| 04 | Prancha de elementos | Gemini, ~12 adesivos do tema | Sim |
| 05 | Elementos principais | Recorte da prancha (4 maiores), PNG transparente | Não |
| 06 | Elementos complementares | Recorte da prancha (o resto), PNG transparente | Não |
| 07 | Fundo personalizado limpo | Gemini, mesmo cenário sem personagem e sem texto | Sim |
| 08 | Arte para lembrancinha (quadrada) | Fundo recortado + logotipo + "Obrigado/Obrigada pela sua presença" (agradecimento gerado) | 1 chamada |
| 09 | Papel digital estampado | Montado por código com os elementos recortados + cor clara da paleta | Não |
| 10 | Logotipo da festa | Gemini: nome + idade com as letras do título do convite, fundo transparente | Sim |
| 11 | Brasão da aniversariante | Gemini: emblema do tema com a inicial | Sim |
| 12 | Paleta de cores | Extraída do convite | Não |

Custo estimado por kit completo: **US$ 0,70 a 1,00** (convite no Pro ~US$ 0,13 por imagem + extras no Flash ~US$ 0,07); tempo: **2,5 a 6 minutos** (varia muito com a sobrecarga do Google). `KIT_EXTRAS=off` no `.env` desliga os extras.

---

## 4. Regras de negócio e decisões de produto

- **Frase do convite:** sorteada pelo sistema entre frases curtas e genéricas por tipo de festa (`services/phrases.js`). O campo livre foi removido (menos erro de escrita e sem slogans de marcas).
- **Menino/menina:** pergunta no formulário (debutante é sempre menina). Define "Obrigado"/"Obrigada". **Não é salvo no banco** (a tabela não tem a coluna).
- **1 foto por criança** (formulário e servidor).
- **Formulário 100% obrigatório e sem nada pré-preenchido** (tipo, nome, idade, menino/menina, data, tema, horário, local e foto; só referências e observações são opcionais). O servidor também valida e responde 400 se faltar algo; ele não preenche valores por conta própria.
- **O cliente só vê o que foi gerado para ele:** nenhuma arte, texto, cor ou nome de exemplo (cada cartão da galeria só aparece se o item existe, a numeração é recalculada e os grupos vazios somem). As miniaturas "Estilos sugeridos" só escolhem o tipo de festa.
- **Downloads reais:** PNG/PDF do convite, PNG do lembrete e ZIP vêm da API (`/api/downloads/:id/...`). Antes eram simulados e entregavam imagens de exemplo.
- **Qualidade das imagens da OpenAI fixa em `medium`** (`POSTER_IMAGE_QUALITY` em `ai.js`).
- **Convite sempre retrato 2:3**; prévia e PDF mantêm a proporção da arte (nada é cortado).
- **Todos os itens precisam combinar com o convite** (mesmo estilo, cores, personagem e letras). Por isso o convite aprovado entra como imagem de referência nas demais chamadas.
- **Personagem único:** só a criança aparece no convite (sem companheiros, sem objetos nas mãos).
- **Tipografia (itens 14 e 15), monograma e ilustrações do tema foram removidos** do kit por decisão do produto.
- **Lembrete:** a contagem usa no máximo 5 dias (momento típico do envio); se a festa for hoje, "É HOJE!".

---

## 5. Aprendizados (o que não funcionou e por quê)

1. **Descrever a foto em texto não preserva o rosto.** O que dá semelhança é enviar a **foto real** ao modelo de imagem (edição/geração com imagem de entrada).
2. **Referências com personagens de marca enviadas como imagem:** o modelo copia os personagens e o filtro de segurança recusa de forma imprevisível. Hoje o texto do tema é sanitizado e, se o filtro recusar, a escada remove referências/foto passo a passo. **O que fazer com personagens de marca é decisão de negócio/jurídica em aberto** (ver §8).
3. **Texto na imagem:** só funciona com conferência. Frases curtas, nome soletrado letra a letra e conferência por visão (inclui acentos, texto cortado e texto extra). Conferência só de "presença" aprovava erros.
4. **Bug de cache/CDN (resolvido):** o projeto não era salvo no banco (campo `initialLetter` inexistente na tabela), então todas as gerações usavam o mesmo caminho no storage e a CDN devolvia o convite anterior como referência dos extras. Hoje há pasta única por geração e o convite usado como referência vem da memória.
5. **Recorte da prancha:** k-means e "ligar pixels vizinhos" falham quando a IA desenha linhas de grade ou cola os adesivos. A solução atual são **cortes pelos espaços vazios (XY-cut)** com limiar de "tinta" 160.
6. **Falha de segurança (resolvida):** o servidor entregava a pasta raiz inteira (`server/.env`, código, `.git`). Hoje só serve `index.html`, `app.js`, `styles.css` e `assets/`.
7. **Gemini não tem cota grátis para imagens** (cota 0 no plano gratuito); precisa de crédito pré-pago no AI Studio. Os modelos oscilam com erro 503 ("alta demanda") e, às vezes, a chamada pendura: por isso há limite de tempo por modelo e reserva na OpenAI.
8. **Gemini recusou editar uma imagem já gerada** (erro `PROHIBITED_CONTENT`); gerar do zero com foto + referência funciona.

---

## 6. Arquitetura e estrutura de pastas

```
Mia/
├── index.html, styles.css, app.js     # Frontend SPA (10 telas) — servido pelo backend em http://localhost:3001
├── assets/                            # Imagens de exemplo (modo sem backend) e identidade da marca
├── AI_HANDOFF.md, README.md
├── start.ps1                          # Servidor estático antigo (PowerShell), não é mais necessário
└── server/
    ├── server.js                      # Express: serve só o frontend público + rotas /api
    ├── routes/    auth.js, projects.js, generate.js, downloads.js
    ├── middleware/ auth.js
    ├── migrations/ 001_initial_schema.sql   # Schema do Supabase
    ├── services/
    │   ├── ai.js        # Convite: visão, sanitização, prompts, Gemini/OpenAI, conferência de texto
    │   ├── gemini.js    # Chamada à API do Gemini (tempo limite, próximo modelo, classificação de erro)
    │   ├── kit.js       # Itens do kit a partir do convite + recorte + papel + lembrancinha
    │   ├── identity.js  # Paleta e fontes
    │   ├── phrases.js   # Frases sorteadas
    │   ├── renderer.js  # PNG/PDF em proporção original, marca d'água, miniaturas
    │   ├── storage.js, supabase.js
    └── test-*.js                      # Scripts MANUAIS (cada um chama a API e GASTA crédito)
```

Banco: tabela `projects` no Supabase (type, name, age, date, time, location, phrase, theme, notes, initial_letter, bg_template, status, watermarked, assets_urls, user_id). Storage: bucket `meraki-kits`, pasta `projects/<id>/`.

---

## 7. Variáveis de ambiente (`server/.env`, **não vai para o git**)

O modelo está em `server/.env.example`. Principais:

```env
PORT=3001
NODE_ENV=development            # development libera os downloads (bypass de pagamento)
SUPABASE_URL=...  SUPABASE_ANON_KEY=...  SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...              # provedor principal (aistudio.google.com/apikey; precisa de crédito pré-pago)
OPENAI_API_KEY=...              # visão, conferência de texto e reserva de imagem
# Opcionais
IMAGE_PROVIDER=gemini|openai    # padrão: gemini se GEMINI_API_KEY existir
GEMINI_POSTER_MODELS=gemini-3-pro-image,gemini-3.1-flash-image-preview
GEMINI_KIT_MASCOT_MODELS=...    GEMINI_KIT_ITEM_MODELS=...
OPENAI_POSTER_MODEL / OPENAI_EDIT_MODEL / OPENAI_IMAGE_MODEL
KIT_EXTRAS=off                  # desliga os itens extras (economiza ~US$ 0,50 por geração)
```

---

## 8. Como executar e testar

```bash
cd server && npm install
cd server && npm run dev        # backend + frontend em http://localhost:3001
```

Abra `http://localhost:3001/` e dê **Ctrl+F5** ao mudar o código (a SPA não recarrega sozinha). No PowerShell antigo use comandos separados (sem `&&`).
Atenção: `npm run dev` na raiz também sobe um `http-server` na porta **3000** que serve a pasta inteira (inclusive `server/.env`); use só a porta 3001.

Scripts manuais (gastam crédito): `node test-gemini.js --list`, `test-pipeline.js`, `test-kit.js`, `test-mascot.js`, `test-kit2.js` (logo/brasão/lembrete), `test-favor.js`. As saídas vão para `server/test-output-*` (ignoradas pelo git).

### Para retomar depois de formatar o computador
1. Instalar Git e Node.js. 2. `git clone https://github.com/felipeemr/mia-project.git` e `git checkout feat/kit-completo-gemini`.
3. `cd server && npm install`. 4. Recriar `server/.env` (chaves: Supabase no painel do projeto; Gemini no AI Studio; **OpenAI precisa de uma chave nova**, pois não é possível rever a antiga).

---

## 9. Lista de tarefas (o que falta)

### Alta prioridade
- [ ] **Rodar uma geração completa pelo site** e validar ponta a ponta o que mudou por último: lembrete 2:3, lembrancinha (Obrigado/Obrigada), papel digital, ZIP, pergunta menino/menina, nenhuma imagem de exemplo piscando. Ainda não foi validado inteiro.
- [ ] **Abrir o PR** `feat/kit-completo-gemini` → `main` e fazer o merge (o `gh` não está instalado; link: `https://github.com/felipeemr/mia-project/pull/new/feat/kit-completo-gemini`).
- [ ] **Segurança das chaves:** revogar o token antigo do Replicate; se o servidor já ficou acessível fora do computador, trocar as chaves da OpenAI, Gemini e Supabase (houve vazamento do `.env` pela rota estática, já corrigido).
- [ ] **Pagamento real** (Kiwify / Mercado Pago): cobrança PIX/cartão e webhook que muda o projeto para `paid`; remover o bypass de `NODE_ENV=development` nos downloads.
- [ ] **Reduzir a espera** (hoje 2,5 a 6 min): mostrar o convite assim que ficar pronto e carregar o resto do kit em segundo plano (status/polling).
- [ ] **Controle de custo:** ~US$ 0,70 a 1,00 por kit. Avaliar gerar itens caros só após o pagamento, definir limites por usuário e criar alertas de saldo (OpenAI e Gemini). Conferir o preço do kit (R$ 47,90) contra o custo real e a taxa de conversão.

### Média prioridade
- [ ] **Lembrancinha:** deixar o estilo do agradecimento igual ao do logotipo, aproximar os dois textos (sobra espaço no meio) e tratar a baixa resolução do fundo (vem de 848×1264).
- [ ] **Logotipo idêntico ao título do convite:** hoje é "da mesma família"; se for preciso idêntico, recortar o título direto da imagem do convite (com o fundo da cena).
- [ ] Decidir se junta **05 e 06 em um único item "Elementos avulsos"** (a divisão principais/complementares é artificial).
- [x] ~~Tela de downloads ligada aos arquivos reais~~ (feito; falta **testar o ZIP completo** pelo site com projeto salvo).
- [ ] **Painel de testes e tela Admin:** o botão 🛠️ agora só aparece com `?dev=1` na URL, mas a tela **Admin** e a navegação `navTo` continuam acessíveis por esse painel; proteger o Admin de verdade (login) antes de publicar.
- [ ] **Limites e pagamento forçados no código:** em `DOMContentLoaded` (`app.js`) `bypassPayment` e `infiniteLimit` são ligados para todos ("DEVELOPER PRESETS"), e o botão "aprovar pagamento" do checkout só simula. Remover quando o pagamento real existir.
- [ ] **Painel Pro:** os projetos mostrados agora são só os gerados pelo próprio usuário (guardados no navegador, `localStorage`); falta guardar/ler do banco.
- [ ] E-mail de suporte escrito fixo no `LEIA-ME` do ZIP (`suporte@merakiartesdigitais.com.br`): confirmar se existe ou trocar.
- [ ] Página inicial ainda usa imagens de exemplo (`assets/*.jpg`) como vitrine de marketing; decidir se ficam ou se trocam por exemplos reais do produto.
- [ ] Decidir se **referências e observações** também passam a ser obrigatórias no formulário.
- [ ] **Mascote na tela:** aparece pequeno numa moldura circular; melhorar o enquadramento.
- [ ] Testar a fundo **15 anos (debutante) e adulto** (prompts, frases, estilos); só o infantil foi testado a fundo.
- [ ] Ajustar `npm run dev` para subir só o backend (porta 3001) e não expor a pasta pela porta 3000.
- [ ] **Disponibilidade do Gemini:** monitorar os 503/timeouts; avaliar usar o Flash como principal e o Pro como reserva (`GEMINI_POSTER_MODELS`).
- [ ] Adicionar a coluna `gender` (e quaisquer outras) ao schema do banco, se for útil guardar.
- [ ] Limpar o código de fontes (`identity.js`) se a tipografia não voltar ao kit.
- [ ] Portal da Conviteira: validar limites e fluxo com o novo pipeline.
- [ ] **Testes automatizados** (hoje só scripts manuais que gastam crédito).

### Baixa prioridade
- [ ] Novos tipos de evento (casamento, batizado).
- [ ] Editor visual simples para ajustes de texto pela cliente.
- [ ] Remover o servidor PowerShell antigo (`start.ps1`) e os documentos desatualizados do README.

### Decisões de negócio em aberto (precisam de você)
- **Personagens e marcas registradas:** o Gemini aceitou gerar trajes como o do Homem-Aranha. Vender isso tem risco de direitos autorais. Decidir a política (aviso ao cliente, termos de uso, só temas livres, licenciamento).
- **Dados de crianças (LGPD):** as fotos de menores são enviadas à OpenAI e ao Google. Definir política de privacidade, consentimento dos responsáveis e retenção das imagens.

---

## 10. Instruções para a próxima pessoa ou IA

1. **Leia o §5 antes de mudar prompts ou o recorte:** vários caminhos já foram tentados e falharam.
2. **Mantenha o convite como referência dos demais itens**; é o que garante a coerência do kit.
3. **Cada teste real gasta dinheiro.** Use `KIT_EXTRAS=off` quando só for ajustar a tela.
4. **Nunca sirva a pasta raiz como estática** e nunca versione o `.env` ou as pastas `server/test-output-*` (têm fotos de crianças).
5. Mantenha este documento atualizado a cada decisão relevante.

---
*Fim do documento AI_HANDOFF.md*
