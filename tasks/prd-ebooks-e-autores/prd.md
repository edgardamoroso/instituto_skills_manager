# Documento de Requisitos do Produto (PRD)

**Feature:** Loja de eBooks digitais + Autoria de cursos
**Produto:** Instituto Skills Manager (skillsmanager.com.br)
**Data:** 2026-09-02
**Status:** rascunho para revisão

---

## Visão Geral

O Instituto Skills Manager hoje vende **cursos** (síncronos e assíncronos) com matrícula,
parcelamento e área do aluno. Esta evolução acrescenta duas capacidades, sem alterar nada
do que já existe:

1. **Loja de eBooks digitais.** Uma vitrine pública onde o instituto publica eBooks. Ao
   cadastrar um eBook, o admin escolhe a **modalidade**:
   - **Venda no site:** o eBook tem **amostra gratuita**, preço e um fluxo de compra. O
     comprador informa seus dados (nome, CPF, data de nascimento, e-mail, telefone) e
     escolhe a forma de pagamento (PIX ou cartão de crédito/débito). A equipe gera um
     **link de pagamento** no Asaas e o envia por e-mail; confirmado o pagamento, o
     comprador recebe o arquivo por um link de download protegido.
   - **Link externo:** o eBook já está publicado em uma loja externa (ex.: Amazon). O card
     leva o visitante direto para essa loja ("Comprar na Amazon"); o site não processa
     pagamento, não coleta dados e não hospeda o arquivo.

   Em ambos os casos não há entrega física nem frete — o produto é 100% digital.

2. **Autoria de cursos.** Cada curso passa a ter um **autor**. O administrador cadastra
   autores, que recebem acesso ao sistema com autoridade para **criar e editar apenas os
   seus próprios cursos e aulas** — sem acesso a alunos, matrículas ou pagamentos. As
   páginas públicas dos cursos passam a exibir o autor.

O valor: abrir uma nova linha de receita (eBooks) com esforço operacional baixo e sem
mudança de infraestrutura; e descentralizar a produção de conteúdo, deixando o admin
livre da edição de cada curso.

## Objetivos

### Loja de eBooks

- Catálogo publicado com pelo menos os eBooks atuais do instituto em até 30 dias do lançamento.
- **≥ 70%** dos pedidos iniciados recebem link de pagamento em **até 1 dia útil**.
- **100%** dos pagamentos confirmados resultam em acesso ao download em **até 5 minutos**
  após a confirmação registrada.
- **Zero** dados de cartão trafegando ou armazenados em servidor próprio (checkout
  hospedado pelo provedor de pagamento).
- Métricas acompanhadas: nº de eBooks publicados, nº de pedidos, taxa de conversão
  (pedidos → pagos), tempo médio pedido → link → pagamento, receita por período,
  nº de downloads por pedido.

### Autoria de cursos

- O admin consegue criar um autor e esse autor publica um curso **sem o admin editar
  conteúdo**.
- **≥ 90%** dos cursos com autor atribuído em até 30 dias.
- **100%** das páginas públicas de curso exibindo o autor.
- Métricas acompanhadas: nº de autores ativos, % de cursos com autor, nº de cursos/aulas
  criados ou editados por autores (sem intervenção do admin).

## Histórias de Usuário

### eBooks

- **US1 — Visitante:** como visitante, quero navegar pelo catálogo de eBooks, abrir a
  amostra e ver o preço, para decidir se compro.
- **US2 — Comprador:** como comprador, quero solicitar a compra informando nome, CPF,
  data de nascimento, e-mail e telefone e escolhendo PIX ou cartão, para receber um link
  de pagamento.
- **US3 — Comprador:** como comprador, quero receber o link de pagamento por e-mail e,
  após pagar, receber o arquivo do eBook por um link de download, para consumir o produto.
- **US4 — Comprador recorrente:** como comprador que já tem conta no site, quero que meus
  eBooks comprados apareçam em "Minha conta", para baixá-los de novo quando precisar.
- **US5 — Administrador:** como admin, quero cadastrar um eBook escolhendo entre
  **vender no site** (preço, arquivo e amostra) ou **apontar para uma loja externa** (URL
  da Amazon, por exemplo), para colocá-lo no catálogo do jeito que fizer mais sentido.
- **US6 — Administrador:** como admin, quero ver a fila de pedidos, registrar o link de
  pagamento gerado no Asaas e marcar o pedido como pago, para liberar a entrega.
- **US7 — Administrador:** como admin, quero reenviar o e-mail de pagamento ou de download
  e cancelar um pedido, para lidar com erros e desistências.
- **US8 — Comprador (borda):** como comprador que digitou o e-mail errado, quero que o
  suporte corrija o e-mail do pedido e reenvie, para receber o produto.

### Autores

- **US9 — Administrador:** como admin, quero cadastrar, editar e desativar autores (nome,
  e-mail, bio, senha inicial ou convite), para dar a eles acesso de autoria.
- **US10 — Administrador:** como admin, quero atribuir um autor a cada curso (inclusive aos
  cursos já existentes), para que a autoria fique registrada.
- **US11 — Autor:** como autor, quero fazer login e ver "Meus cursos", para gerenciar
  somente o que é meu.
- **US12 — Autor:** como autor, quero criar um curso e suas aulas e editá-los depois, para
  produzir conteúdo sem depender do admin.
- **US13 — Autor (borda):** como autor, não devo conseguir ver nem editar cursos de outro
  autor, nem acessar alunos, matrículas ou pagamentos.
- **US14 — Visitante/Aluno:** como visitante, quero ver "Autor: Nome" (e a bio, quando
  houver) na página do curso, para saber quem produziu o conteúdo.

## Principais funcionalidades

### F1 — Catálogo público de eBooks

Vitrine listando os eBooks publicados, na mesma identidade visual do site (cards, fonte
Inter, `styles.css`). Item de menu novo ("eBooks"). Cada eBook tem página de detalhe com
capa, descrição e as ações conforme a modalidade.

- **RF1.** O sistema exibe apenas eBooks com status "publicado"; rascunhos ficam ocultos
  do público.
- **RF2.** A página de detalhe mostra título, descrição, capa e nº de páginas (quando
  informado).
- **RF3.** Para eBooks **de venda no site**, a página mostra o preço em BRL (com centavos,
  padrão dos cursos) e os botões "Ver amostra" e "Comprar".
- **RF3.1.** Para eBooks **de link externo**, a página mostra um botão de saída rotulado
  conforme a loja (ex.: "Comprar na Amazon"; rótulo genérico "Comprar" quando a loja não
  for reconhecida) que abre a URL externa em nova aba. O preço é exibido apenas como
  referência quando o admin o informar, com a nota de que o valor final é o da loja
  externa. Não há botão "Comprar" interno nem formulário.
- **RF3.2.** O catálogo pode misturar as duas modalidades; o card indica visualmente
  quando o eBook é vendido em loja externa.

### F2 — Amostra gratuita (só venda no site)

eBooks de venda no site têm um arquivo de amostra enviado pelo admin (ex.: PDF com
capítulo inicial), acessível sem pagamento e sem login.

- **RF4.** O visitante pode abrir/baixar a amostra a partir da página de detalhe.
- **RF5.** A amostra é servida com as mesmas proteções de download já aplicadas a
  `/uploads` (sem execução no navegador; `Content-Disposition: attachment`).
- **RF5.1.** Para eBooks de link externo não há amostra hospedada no site (a avaliação
  fica a cargo da loja externa); o campo de amostra é opcional nesse caso.

### F3 — Fluxo de compra e coleta de dados (só venda no site)

Formulário de compra acionado pelo botão "Comprar". Não se aplica a eBooks de link externo
(RF3.1) — esses não geram pedido e não passam por F3, F4 nem F5.

- **RF6.** O formulário coleta: nome completo, CPF, data de nascimento, e-mail, telefone e
  forma de pagamento desejada (PIX ou cartão de crédito/débito).
- **RF7.** O CPF é validado (formato e dígitos verificadores) antes do envio; e-mail e
  telefone são validados quanto ao formato.
- **RF8.** Ao enviar, o sistema cria um **pedido** no estado "aguardando link" e mostra ao
  comprador uma confirmação: "Você receberá o link de pagamento no e-mail informado".
- **RF9.** A compra é permitida **sem conta** (comprador convidado). Não há coleta de
  endereço de entrega (produto digital).
- **RF10.** Um mesmo e-mail pode ter vários pedidos; cada pedido é de **um** eBook.

### F4 — Gestão de pedidos e link de pagamento (Asaas, manual)

Área no painel admin com a fila de pedidos.

- **RF11.** O admin vê a lista de pedidos com: eBook, dados do comprador, forma de
  pagamento escolhida, estado e datas.
- **RF12.** Estados do pedido: `aguardando link` → `aguardando pagamento` → `pago` →
  `entregue`; além de `cancelado` (a partir de qualquer estado anterior a `entregue`).
- **RF13.** O admin registra no pedido o **link de pagamento** (URL) e o identificador da
  cobrança gerados manualmente no Asaas; ao salvar, o sistema envia o e-mail com o link ao
  comprador e move o pedido para `aguardando pagamento`.
- **RF14.** O admin marca o pedido como `pago`; o sistema então gera o acesso ao download,
  envia o e-mail de entrega e move o pedido para `entregue`.
- **RF15.** O admin pode reenviar o e-mail de pagamento ou o de entrega, editar o e-mail
  do comprador e cancelar o pedido.
- **RF16.** *(Desejável, não bloqueante)* Se um webhook de confirmação do Asaas for
  configurado e o identificador da cobrança bater com o do pedido, o sistema marca `pago`
  automaticamente.

### F5 — Entrega digital protegida

- **RF17.** Após a confirmação do pagamento, o sistema disponibiliza o arquivo do eBook por
  um **link de download tokenizado**, com expiração e limite de downloads.
- **RF18.** O arquivo original do eBook nunca é exposto por URL pública direta.
- **RF19.** Se o e-mail do pedido corresponder a uma conta existente, o eBook também
  aparece em "Minha conta" para novo download enquanto o pedido estiver `entregue`.
- **RF20.** O comprador pode solicitar novo link caso o anterior expire (via suporte no
  MVP; autoatendimento fica fora de escopo).

### F6 — Administração de eBooks (CRUD)

- **RF21.** O admin cria, edita, despublica e remove eBooks.
- **RF22.** Campos comuns: título, descrição, nº de páginas (opcional), imagem de capa,
  status (`rascunho`/`publicado`) e **modalidade** (`venda_no_site` ou `link_externo`).
- **RF22.1.** Modalidade `venda_no_site`: preço (centavos), arquivo principal e arquivo de
  amostra.
- **RF22.2.** Modalidade `link_externo`: URL da loja externa (obrigatória), nome da loja
  (opcional; usado no rótulo do botão) e preço de referência (opcional). Sem upload de
  arquivo.
- **RF23.** Não é possível publicar um eBook `venda_no_site` sem arquivo principal e sem
  preço; nem um `link_externo` sem URL externa válida.
- **RF23.1.** Trocar a modalidade de um eBook que já tem pedidos associados é bloqueado
  (evita inconsistência com pedidos/entregas existentes).
- **RF24.** Toda ação de CRUD de eBook e de pedido é registrada na auditoria existente
  (`audit_log`).

### F7 — Cadastro de autores (admin)

- **RF25.** O admin cria autores informando nome, e-mail e bio (opcional); o autor recebe
  acesso por senha inicial definida pelo admin ou por fluxo de definição de senha por
  e-mail (reaproveitando o mecanismo de tokens de e-mail já existente).
- **RF26.** O admin edita a bio e os dados do autor e pode **desativar** um autor
  (impede login; não apaga os cursos).
- **RF27.** Autores desativados continuam exibidos como autor dos cursos que já assinam,
  salvo remoção explícita pelo admin.

### F8 — Papel "autor" com escopo restrito

- **RF28.** Passa a existir o papel `autor`, além de `admin` e `student`.
- **RF29.** O autor autenticado vê um item de menu "Meus cursos" e a tela de gestão de
  cursos **filtrada aos cursos em que ele é o autor**.
- **RF30.** O autor cria cursos (ficando automaticamente como autor) e edita/exclui
  **apenas** os seus, incluindo as aulas desses cursos.
- **RF31.** O autor **não** acessa: lista de alunos, matrículas, parcelas/pagamentos,
  cadastro de outros autores, cadastro de eBooks e pedidos.
- **RF32.** O backend valida a propriedade do recurso em toda operação de escrita de
  curso/aula feita por um autor; o admin segue podendo tudo.

### F9 — Autor no curso e exibição pública

- **RF33.** O curso passa a ter um campo **autor** (referência a um autor cadastrado),
  opcional para os cursos já existentes.
- **RF34.** O admin atribui/troca o autor de qualquer curso.
- **RF35.** As páginas públicas e a área do aluno exibem "Autor: Nome"; havendo bio, um
  link/《seção》 mostra a bio do autor.
- **RF36.** Cursos sem autor atribuído exibem "Autor não informado" (ou omitem o rótulo) —
  sem quebrar a página.

## Experiência do usuário

### Personas e necessidades

- **Visitante/comprador de eBook:** quer avaliar (amostra + preço) e comprar rápido, sem
  criar conta. Sensível a fricção e a confiança (dados de CPF).
- **Administrador:** quer publicar produtos e tocar a fila de pedidos com poucos cliques;
  quer delegar a produção de cursos.
- **Autor:** quer um espaço só seu para montar cursos, sem ver (nem poder quebrar) o resto
  do sistema.
- **Aluno atual:** não deve perceber nenhuma regressão; ganha a informação de autoria.

### Fluxos principais

1. **Comprar eBook (venda no site):** catálogo → detalhe → "Ver amostra" (opcional) →
   "Comprar" → formulário (nome, CPF, nascimento, e-mail, telefone, PIX/cartão) →
   confirmação na tela → e-mail com link de pagamento → comprador paga no Asaas → admin
   confirma → e-mail com link de download → download.
1a. **Comprar eBook (link externo):** catálogo → detalhe → "Comprar na Amazon" → abre a
   loja externa em nova aba; a compra acontece fora do site.
2. **Publicar eBook (admin):** painel → eBooks → novo → escolhe a modalidade → preenche os
   campos (venda no site: capa, arquivo, amostra, preço | link externo: capa, URL da loja,
   nome da loja) → salva como rascunho → publica.
3. **Tocar pedido (admin):** painel → Pedidos → abre pedido "aguardando link" → cola URL e
   id da cobrança do Asaas → salva (dispara e-mail) → ao ver pago no Asaas, marca "pago"
   (dispara entrega).
4. **Cadastrar autor (admin):** painel → Autores → novo → nome, e-mail, bio → define senha
   inicial ou envia convite.
5. **Autor cria curso:** login → "Meus cursos" → novo curso → adiciona aulas → publica.
6. **Atribuir autor a curso existente (admin):** painel → Cursos → editar → seleciona autor.

### Requisitos de UI/UX e acessibilidade

- **RF37.** As telas novas usam a identidade visual atual (`styles.css`, componentes de
  card, fonte Inter self-hosted) e são responsivas.
- **RF38.** Formulário de compra com `label` associado a cada campo, máscara e mensagens de
  erro específicas (CPF inválido, e-mail inválido, campo obrigatório), navegação por
  teclado e foco visível — mantendo o padrão de acessibilidade já adotado.
- **RF39.** A tela de confirmação de compra deixa claro o próximo passo e o e-mail para o
  qual o link será enviado.
- **RF40.** O painel admin ganha as abas "eBooks", "Pedidos" e "Autores" sem reorganizar
  as abas existentes.
- **RF41.** A área do autor reaproveita a tela de gestão de cursos existente, apenas
  filtrada e com rótulo "Meus cursos".
- **RF42.** Rótulos de terminologia seguem o padrão do site (ex.: curso "gravado" →
  "Assíncrono", "online" → "Síncrono").
- **RF43.** Todos os e-mails transacionais novos (link de pagamento, entrega) usam o
  mecanismo de e-mail já existente (`mailer`) e o mesmo remetente configurado.

## Restrições técnicas de alto nível

- **Manter a stack e a infraestrutura atuais:** Node + Express + SQLite (`node:sqlite`),
  frontend de módulos ES, uma única VM atrás do Caddy. Nada de novo serviço de banco ou de
  fila.
- **Integração externa — Asaas:** no MVP a geração do link é **manual** (feita no painel do
  Asaas pela equipe); o sistema apenas armazena a URL e o identificador da cobrança e
  dispara e-mails. Um webhook de confirmação de pagamento é **desejável**, não obrigatório.
- **Sem integração com Correios ou transportadora** e sem qualquer cálculo de frete.
- **Dados de pagamento:** nenhum dado de cartão é coletado, trafega ou é armazenado no
  servidor próprio; o pagamento acontece inteiramente no ambiente do Asaas.
- **Privacidade / LGPD:** CPF e data de nascimento são dados pessoais coletados com a
  finalidade única de cobrança e eventual emissão fiscal (base legal: execução de
  contrato). Devem ficar acessíveis somente a administradores, nunca aparecer em logs, URLs
  ou respostas públicas, e ser removíveis mediante solicitação do titular. Reter apenas
  pelo período necessário.
- **Proteção dos arquivos de eBook:** servidos apenas por link tokenizado com expiração e
  limite, seguindo o endurecimento já aplicado à rota `/uploads` (sem execução no
  navegador, `nosniff`, `attachment`).
- **Autorização:** o controle de escopo do autor é feito **no backend**, por verificação de
  propriedade do recurso, reaproveitando a sessão por cookie já existente. O frontend
  apenas esconde o que o autor não pode ver.
- **Escala:** carga baixa (ordem de dezenas de pedidos por mês); sem metas especiais de
  latência além de manter a responsividade atual do site.
- **Pré-requisito operacional:** o envio de e-mail (SMTP) precisa estar configurado em
  produção — hoje é uma pendência conhecida do deploy.
- **Compatibilidade:** as tabelas e páginas existentes (cursos, aulas, matrículas,
  pagamentos, área do aluno, painel admin) continuam funcionando sem alteração de
  comportamento; mudanças de schema são aditivas e retrocompatíveis.

## Fora do escopo

- **Entrega física:** impressão, envio de livro impresso, frete, cálculo de CEP,
  integração com Correios/Melhor Envio, rastreio, logística reversa.
- **Endereço de entrega/cobrança** no fluxo de compra do eBook (produto é digital).
- **Checkout no próprio site:** captura de cartão, tokenização, parcelamento gerido pelo
  site, checkout transparente. Todo pagamento é feito no link hospedado pelo Asaas.
- **Automação total do pagamento:** criação da cobrança no Asaas via API e confirmação
  obrigatória por webhook (o webhook fica como melhoria futura opcional).
- **Emissão de nota fiscal** e integração com prefeitura/SEFAZ.
- **Cupons, descontos, promoções, bundles, "compre 2 leve 3", assinatura de eBooks.**
- **Biblioteca de leitura online / leitor embutido / DRM / marca d'água** no arquivo.
- **Autoatendimento para reemissão de link de download expirado** (fica com o suporte).
- **Múltiplos autores por curso, coautoria, divisão de receita (split) com autores.**
- **Autocadastro de autor** (somente o admin cria) e **autor gerenciando** preço,
  publicação comercial, alunos, matrículas ou pagamentos.
- **eBooks escritos/enviados por autores** — no MVP o cadastro de eBooks é só do admin.
- **Analytics de cliques no link externo, gestão de links de afiliado, comparação de preço
  com a loja externa** — o link externo é apenas uma URL cadastrada.
- **App mobile e internacionalização.**

---

## Premissas registradas (a confirmar na TechSpec)

- eBook de **venda no site** entregue como **arquivo único** (PDF ou EPUB), até ~50 MB.
- eBook de **link externo**: o site guarda só a URL, o nome da loja e um preço de
  referência opcional; o rótulo do botão é "Comprar na Amazon" quando a URL for da Amazon,
  senão "Comprar em {loja}" ou apenas "Comprar". O link abre em nova aba com
  `rel="noopener"`.
- **Amostra** é um arquivo separado enviado pelo admin — não há geração automática de
  "primeiras N páginas".
- Confirmação de pagamento no MVP é **manual** (admin marca ao ver no painel do Asaas).
- "Autor" é um **usuário** com papel `autor`; um curso tem **no máximo um** autor; cursos
  existentes ficam sem autor até o admin atribuir.
- Compra sem conta; entrega por link tokenizado por e-mail; se o e-mail já tiver conta, o
  eBook também aparece em "Minha conta".
- Se, na prática, o Asaas exigir endereço para cobranças de cartão, reavaliar a coleta de
  um endereço de cobrança mínimo (CEP + número) — hoje assumido como desnecessário.
