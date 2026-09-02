# Resumo das tarefas de implementação — Loja de eBooks digitais + Autoria de cursos

PRD: [`prd.md`](./prd.md) · TechSpec: [`techspec.md`](./techspec.md)

Ordem = ordem de construção. Cada tarefa é uma entrega independente com testes próprios
(unitários + integração), seguindo a skill `tests` (meta ≥ 80% de cobertura; a tarefa 10.0
fecha os 80% globais incluindo o código legado).

## Tarefas

- [ ] 1.0 Fundação de testes e refactor de bootstrap
- [ ] 2.0 Schema, migrações e utilitários de dados
- [ ] 3.0 Autores — backend (cadastro, convite de senha, papel `author`)
- [ ] 4.0 Autores — frontend (painel admin + definição de senha)
- [ ] 5.0 Autor nos cursos (ownership, `/mine`, exibição pública)
- [ ] 6.0 eBooks — catálogo, CRUD e download protegido (backend)
- [ ] 7.0 eBooks — catálogo e administração (frontend)
- [ ] 8.0 eBooks — pedidos, pagamento manual e entrega
- [ ] 9.0 Navegação, acabamento e acessibilidade
- [ ] 10.0 Backfill de testes do backend legado até ≥ 80% global

## Grafo de dependências

```
1.0 ──┬─ 2.0 ──┬─ 3.0 ──┬─ 4.0 ─────────────┐
      │        │        └─ 5.0 ─────────────┤
      │        ├─ 6.0 ──┬─ 7.0 ─────────────┼─ 9.0
      │        │        └─ 8.0 ─────────────┘
      └─ 10.0 (paralela; fecha a cobertura global)
```
