# Orbia

Orbia é um dashboard pessoal de organização que centraliza **agenda, finanças e lembretes** em uma única interface.

O projeto foi desenvolvido com foco em uso diário, sincronização entre dispositivos, privacidade dos dados e uma arquitetura modular que permita a evolução independente de cada domínio.

> Status: **Beta pessoal — em desenvolvimento ativo**

## Visão geral

O Orbia reúne três áreas principais:

- **Agenda** — compromissos, horários e recorrências.
- **Financeiro** — contas, parcelas, pagamentos e recorrências mensais.
- **Lembretes** — pendências com prazo, horário e prioridade.

Todos os dados são vinculados ao usuário autenticado e sincronizados através do Supabase.

## Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- date-fns
- rrule
- Lucide Icons

### Backend

- Supabase Auth
- PostgreSQL
- Row Level Security (RLS)
- Supabase Storage
- Supabase Realtime

## Funcionalidades

### Autenticação

- Cadastro com e-mail e senha.
- Login com e-mail e senha.
- Sessão persistente.
- Frontend preparado para autenticação com Google.
- Isolamento dos dados por usuário através de RLS.

### Agenda

- Visualização semanal.
- Horários de 05:00 às 23:00.
- Navegação entre semanas.
- Atalho para retornar à semana atual.
- Criação, edição e exclusão de compromissos.
- Horário inicial e final.
- Múltiplos compromissos simultâneos exibidos lado a lado.
- Recorrência:
  - diária;
  - semanal;
  - semanal com seleção de dias;
  - mensal.
- Séries recorrentes armazenadas em RRULE.

### Financeiro

- Contas à vista.
- Compras parceladas.
- Contas mensais recorrentes.
- Geração automática de parcelas.
- Recorrências mensais sem necessidade de gerar manualmente vários meses.
- Categorias financeiras.
- Formas de pagamento, incluindo:
  - Pix;
  - Pix Automático;
  - débito automático;
  - cartão de crédito;
  - cartão de débito;
  - boleto;
  - carnê;
  - transferência bancária;
  - dinheiro;
  - carteira digital;
  - cheque;
  - outros.
- Registro da data real do pagamento.
- Registro do valor efetivamente pago.
- Identificação de pagamentos antecipados.
- Identificação de pagamentos após o vencimento.
- Histórico de pagamentos por mês.
- Separação entre:
  - vencimentos do período;
  - pagamentos realizados;
  - contas pendentes;
  - próximas cobranças.
- Progresso de parcelamentos.
- Reconciliação de datas de pagamentos antigos.
- Comprovantes em imagem ou PDF.
- Armazenamento privado dos comprovantes no Supabase Storage.

### Lembretes

- Criação, edição e exclusão.
- Data de vencimento.
- Horário opcional.
- Prioridade.
- Marcação como concluído.
- Sincronização entre dispositivos.

## Arquitetura

O frontend é organizado por domínio:

```text
src/
├── components/
├── contexts/
├── features/
│   ├── agenda/
│   ├── bills/
│   └── reminders/
├── lib/
├── pages/
├── types/
├── App.tsx
├── index.css
└── main.tsx
```

Cada módulo possui seus próprios componentes e regras de interface, reduzindo o acoplamento entre Agenda, Financeiro e Lembretes.

O backend utiliza PostgreSQL através do Supabase:

```text
Supabase
├── Auth
├── PostgreSQL
│   ├── events
│   ├── reminders
│   ├── bills
│   ├── bill_installments
│   └── attachments
├── Row Level Security
├── Storage
│   └── receipts
└── Realtime
```

## Segurança

O Orbia utiliza **Row Level Security (RLS)** para garantir que cada usuário tenha acesso somente aos próprios dados.

As tabelas possuem políticas baseadas no usuário autenticado:

```sql
auth.uid() = user_id
```

O bucket utilizado para comprovantes é privado.

Nenhuma chave administrativa do Supabase deve ser utilizada no frontend.

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/thyagoo-dev/orbia.git
cd orbia
```

### 2. Instalar dependências

```bash
npm install
```

## Configuração do Supabase

Crie um projeto em:

https://supabase.com

Depois abra:

**SQL Editor → New query**

e execute:

```text
supabase/schema.sql
```

O schema cria:

- tabelas;
- relacionamentos;
- índices;
- triggers;
- políticas de RLS;
- permissões da API;
- bucket privado para comprovantes;
- políticas do Storage;
- configuração do Realtime.

### Authentication

Mantenha o provider de e-mail habilitado.

Para desenvolvimento local, configure:

```text
Site URL
http://localhost:5173
```

e adicione:

```text
Redirect URL
http://localhost:5173/**
```

### Google OAuth

O frontend já possui suporte ao fluxo de autenticação com Google.

Para utilizá-lo, é necessário configurar o provider Google no Supabase e fornecer as credenciais OAuth correspondentes.

## Variáveis de ambiente

Crie:

```text
.env.local
```

a partir do `.env.example`.

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> Nunca utilize `sb_secret_...`, `service_role` ou qualquer chave privilegiada em variáveis `VITE_*`.

Arquivos `.env` locais estão ignorados pelo Git.

## Desenvolvimento

```bash
npm run dev
```

A aplicação estará disponível, por padrão, em:

```text
http://localhost:5173
```

## Build de produção

```bash
npm run build
```

Para visualizar o build:

```bash
npm run preview
```

## Decisões de domínio

### Compromisso e lembrete são entidades diferentes

Um **compromisso** ocupa um intervalo real da agenda:

```text
13:00 → 17:00
```

Um **lembrete** representa algo que precisa ser realizado, mas não necessariamente ocupa um horário do calendário.

Essa separação evita misturar tarefas com eventos.

### Recorrência de compromissos

Compromissos recorrentes são representados através de RRULE, seguindo o padrão RFC 5545.

Atualmente, alterações em compromissos recorrentes são aplicadas à série.

O suporte a exceções por ocorrência poderá ser adicionado futuramente.

### Parcelas e pagamentos são entidades diferentes

O Financeiro diferencia a cobrança do pagamento realizado.

Exemplo:

```text
Conta
Tênis Adidas

Parcela
4/5
Vencimento: 10/10/2026

Pagamento
R$ 100,00
Pago em: 13/09/2026
Forma: Carnê
```

Isso permite representar corretamente pagamentos antecipados ou realizados após o vencimento.

### Contas mensais

Contas mensais são tratadas como recorrências.

O sistema mantém uma janela de cobranças futuras e cria novas ocorrências conforme os meses avançam, evitando a geração desnecessária de anos de registros antecipadamente.

## Roadmap

Algumas evoluções planejadas:

- edição individual de ocorrências recorrentes;
- filtros avançados na Agenda;
- recorrência de lembretes;
- notificações;
- relatórios financeiros;
- gráficos por categoria e período;
- previsão de despesas;
- módulo de valores a receber;
- melhorias de performance e code splitting;
- experiência mobile/PWA.

## Origem do projeto

O Orbia nasceu como uma evolução de um wireframe pessoal chamado **“Organização da Minha Vida”**, criado para reunir rotina, compromissos, despesas e lembretes em um único ambiente.

O projeto evoluiu desse protótipo para uma aplicação web com autenticação, banco de dados, sincronização e regras próprias de domínio.

## Licença

Este projeto ainda não possui uma licença de código aberto definida.
