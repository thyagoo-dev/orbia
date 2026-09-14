# Orbia

Dashboard pessoal inspirado no wireframe **“Organização da Minha Vida”**: agenda semanal, contas e lembretes em uma interface responsiva, com login e sincronização em nuvem.

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- Supabase Auth + Postgres + Storage + Realtime
- date-fns
- rrule (recorrência de compromissos)
- Lucide Icons

## O que já está implementado

- Login/cadastro por e-mail e senha.
- Login com Google (basta habilitar o provider no Supabase).
- Dados separados por usuário via RLS.
- Agenda semanal de 05:00 a 23:00.
- Navegação entre semanas e botão Hoje.
- Criação, edição e exclusão de compromissos.
- Mais de um compromisso no mesmo horário, exibidos lado a lado.
- Recorrência diária, semanal (com seleção de dias) e mensal.
- Contas à vista, parceladas e mensais.
- Geração automática das parcelas/meses.
- Marcar parcela como paga/pendente.
- Totais pagos e pendentes no mês.
- Comprovantes (imagem/PDF, até 10 MB) em bucket privado.
- Lembretes com prazo, horário, prioridade e conclusão.
- Realtime entre abas/dispositivos quando habilitado pelo schema.
- Layout responsivo.

## 1. Instalação

```bash
npm install
```

## 2. Criar o backend no Supabase

1. Crie um projeto em https://supabase.com.
2. Abra **SQL Editor**.
3. Cole e execute todo o conteúdo de `supabase/schema.sql`.
4. Em **Authentication > Providers**, deixe Email habilitado. Se quiser Google, habilite Google e configure as credenciais do OAuth.
5. Em **Authentication > URL Configuration**, adicione `http://localhost:5173` como Site URL/Redirect URL durante o desenvolvimento.

O SQL cria as tabelas, índices, RLS, políticas, bucket privado de comprovantes e configuração de Realtime.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```

Use apenas a chave **anon/public** no frontend. Nunca coloque `service_role` no navegador.

## 4. Rodar

```bash
npm run dev
```

Acesse `http://localhost:5173`.

## 5. Build

```bash
npm run build
npm run preview
```

## Decisões de domínio

### Compromisso x lembrete

São entidades separadas de propósito:

- **Compromisso**: ocupa intervalo de tempo na agenda (início/fim) e pode ser recorrente.
- **Lembrete**: representa uma pendência; pode ter prazo/horário, mas não bloqueia a agenda.

Isso evita misturar tarefas com calendário e facilita reaproveitar cada módulo posteriormente.

### Recorrência

A série recorrente é armazenada em RRULE (RFC 5545). Nesta versão, editar um compromisso recorrente edita a série toda e excluir remove a série toda. Exceções por ocorrência podem ser adicionadas numa evolução futura.

### Contas

- À vista: 1 parcela.
- Parcelada: o valor informado é o total; o app divide em centavos e corrige o restante na última parcela.
- Mensal: o valor informado é mensal; você escolhe quantos meses gerar (12 é uma boa opção prática).

## Observação

O nome **Orbia** é um codinome de produto e está centralizado visualmente no Header/Login; pode ser renomeado depois sem alterar o modelo de dados.
