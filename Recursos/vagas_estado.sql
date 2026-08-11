-- Tabela da Consulta de Vagas Disponíveis por Unidade (vagas_consulta_logic.js)
-- Mesmo projeto Supabase já usado pelo Editor do Fluxo (fluxo_logic.js) —
-- roda no SQL Editor do projeto UMA VEZ, antes do primeiro uso da ferramenta.
--
-- Mesmo formato de fluxo_estado: uma linha só (id='estado'), com o pacote
-- inteiro de unidades gravado em `data` (jsonb). Não há edição campo a
-- campo — cada envio de planilha pela ferramenta substitui a linha inteira.

create table if not exists public.vagas_estado (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.vagas_estado enable row level security;

-- Sem autenticação própria (mesmo modelo do fluxo_estado hoje): qualquer
-- pessoa com a chave publicável do projeto (embutida no código, protegida só
-- por estas policies) pode ler e gravar. Se quiser restringir quem pode
-- ATUALIZAR os dados de vagas, é aqui que entraria uma regra mais específica.
create policy "vagas_estado select" on public.vagas_estado
  for select to anon using (true);

create policy "vagas_estado insert" on public.vagas_estado
  for insert to anon with check (true);

create policy "vagas_estado update" on public.vagas_estado
  for update to anon using (true) with check (true);
