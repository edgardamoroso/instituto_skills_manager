# Tarefa 9.0: Navegação, acabamento e acessibilidade

## Visão geral

Costura final: link "eBooks" no menu público de todas as páginas, navegação do papel autor,
ajustes de `styles.css` e uma passada de acessibilidade nos formulários novos (compra,
autor, definição de senha). Depende de 4.0, 5.0, 7.0 e 8.0 estarem no lugar.

<skills>
### Conformidade com skills
- `code-standards` / `javascript` — sem regressão de estilo; nada de duplicação desnecessária no header (extrair se virar problema).
- `tests` — mudanças são de marcação/estilo; cobertas por E2E manual e pelos testes de rota já existentes.
</skills>

<requirements>
- RF37, RF38, RF39, RF40, RF41, RF42, RF43.
- Menu público ganha "eBooks" em todas as páginas sem quebrar o layout atual.
- `role='author'` vê "Meus cursos"; não vê itens de admin.
- Formulários: `label` associado, foco visível, erros específicos, navegação por teclado.
</requirements>

## Subtarefas

- [ ] 9.1 Adicionar `<a href="ebooks.html">eBooks</a>` no `.nav-links` de cada `*.html` público (index, cursos-online, cursos-gravados, curso, ebooks, ebook, login, cadastro, etc.), na mesma posição relativa.
- [ ] 9.2 `js/session.js`: consolidar a lógica de nav por papel — `admin` (Painel admin), `author` (Meus cursos), `student` (Minhas matrículas + Meus eBooks), anônimo (Entrar).
- [ ] 9.3 `styles.css`: _badges_ de modalidade de eBook e de status de pedido; tabela de pedidos; formulário de compra; sem quebrar componentes existentes.
- [ ] 9.4 Acessibilidade dos formulários novos: `for`/`id`, `aria-invalid`/`aria-describedby` nas mensagens de erro, `autocomplete` apropriado, ordem de foco, `:focus-visible`.
- [ ] 9.5 Revisar textos/rotulagem conforme o padrão do site (curso "gravado"→"Assíncrono" etc.); nenhuma string quebrada.
- [ ] 9.6 Checklist de verificação manual no PR (todas as telas novas em desktop e mobile).

## Detalhes de implementação

Ver `techspec.md` → **Visão dos componentes → Frontend (modificados)** e **Sequenciamento
→ passo 7**. PRD → **Experiência do usuário / Requisitos de UI/UX e acessibilidade**.

## Critérios de sucesso

- "eBooks" aparece no menu de todas as páginas públicas e leva ao catálogo.
- Cada papel vê exatamente os itens de menu previstos.
- Formulários navegáveis por teclado, com erros anunciados por leitor de tela.
- Nenhuma regressão visual nas páginas existentes.

## Testes da tarefa

### Testes unitários
- [ ] `js/session.js`: dado `user.role`, a função de nav produz o conjunto de links esperado (student/author/admin/anônimo).

### Testes de integração
- [ ] N/A (sem novo endpoint).

### Testes E2E (se aplicável)
- [ ] Manual (checklist no PR): navegação por papel; tabulação e mensagens de erro nos 3 formulários novos; layout mobile das telas novas.

## Arquivos relevantes

- Todos os `*.html` públicos (header), `js/session.js`, `styles.css` (mod.)
- `js/session.test.js` (mod./novo)
