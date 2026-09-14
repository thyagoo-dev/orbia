# Orbia — próximos blocos recomendados

Este documento separa evoluções de produto de melhorias estruturais para evitar colocar tudo em um único dashboard e aumentar o acoplamento.

## Próximo bloco recomendado — Agenda e Lembretes V2

- Categorias de compromissos com cor padrão (Faculdade, Trabalho, Pessoal, Saúde etc.).
- Eventos de dia inteiro.
- Edição de recorrência com escolha entre **esta ocorrência**, **esta e as próximas** e **toda a série**.
- Recorrência de lembretes.
- Adiar/soneca de lembretes.
- Visões `Hoje`, `Atrasados`, `Próximos` e `Concluídos`.
- Notificações do navegador com opt-in e tratamento correto de permissão.
- Clique/duplo clique na grade para criar compromisso no horário selecionado.
- Mais adiante: drag-and-drop e resize de eventos, depois de estabilizar as regras de recorrência.

## Financeiro V3

- Evoluir a Central Financeira para rota própria (`/financeiro`) quando o volume de recursos justificar.
- Orçamentos mensais por categoria.
- Módulo **A receber** separado de despesas.
- Dashboard de fluxo de caixa e comparação entre meses.
- Relatórios e gráficos por categoria, forma de pagamento e período.
- Busca/filtros avançados e exportação CSV/PDF.
- Melhor tratamento de pagamentos parciais somente quando houver um caso real de uso.

## Produto e preferências

- Página `Configurações` para tema, primeiro dia da semana, horários visíveis da agenda, moeda e fuso horário.
- Persistência opcional das preferências no Supabase para sincronizar entre dispositivos.
- Busca global / command palette para encontrar compromissos, lembretes e contas rapidamente.
- PWA instalável e cache de shell; dados sensíveis continuam vindo do Supabase autenticado.

## Engenharia

- Quebrar o bundle principal com lazy loading de modais/workspaces grandes.
- Adicionar testes unitários para recorrência, parcelas e datas.
- Testes de integração para RLS e ownership de Storage.
- Error boundary e logging de erros de produção sem registrar dados sensíveis.
- CI com `npm run build` e testes antes do deploy do GitHub Pages.

### Diretriz de arquitetura

Manter **Agenda**, **Financeiro** e **Lembretes** como domínios independentes. Recursos compartilhados (tema, anexos/links, autenticação, busca, preferências) ficam em módulos transversais. Isso mantém o Orbia reaproveitável futuramente sem transformar `Dashboard.tsx` em um componente monolítico.
