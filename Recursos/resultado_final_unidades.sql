-- Tabela do Gerador da Tabela de Resultado Final (resultado_final_logic.js)
-- Mesmo projeto Supabase já usado pelo Fluxo e pela Consulta de Vagas —
-- rodar no SQL Editor do projeto UMA VEZ, antes do primeiro uso da ferramenta.
--
-- Diferente de fluxo_estado/vagas_estado (linha única), aqui cada
-- preenchimento é UMA linha:
--   id         = SÓ os dígitos do processo SEI
--                (ex.: "00529893320258166000") — salvar de novo com o mesmo
--                SEI cai no mesmo id e SUBSTITUI o registro (é o mecanismo
--                de correção). O nome da unidade NÃO entra na chave: é
--                digitado à mão e qualquer variação criaria um registro
--                paralelo em vez de atualizar o existente.
--   data       = pacote completo do preenchimento (unidade, sei, linhas...)
--   updated_at = última gravação

create table if not exists public.resultado_final_unidades (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.resultado_final_unidades enable row level security;

-- Sem autenticação própria (mesmo modelo das demais ferramentas): qualquer
-- pessoa com a chave publicável pode ler e gravar. Para restringir quem pode
-- gravar no futuro (ex.: exigir login das unidades), é nestas policies que a
-- regra entraria — o código da ferramenta não precisa mudar.
create policy "resultado_final select" on public.resultado_final_unidades
  for select to anon using (true);

create policy "resultado_final insert" on public.resultado_final_unidades
  for insert to anon with check (true);

create policy "resultado_final update" on public.resultado_final_unidades
  for update to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- BACKUP — três camadas, da mais simples à mais completa:
--
-- 1) Pela própria ferramenta (recomendado, sem acesso ao painel):
--    botão "Baixar backup completo (.json)" no Passo 3 baixa todos os
--    registros; "Restaurar backup" regrava esse arquivo por upsert.
--    Guardar uma cópia datada periodicamente (ex.: semanal).
--
-- 2) Pelo SQL Editor do Supabase (exportação manual):
--       select id, data, updated_at from public.resultado_final_unidades;
--    e usar "Download CSV" no resultado.
--
-- 3) Pelo próprio Supabase: o plano do projeto inclui backups automáticos
--    diários (Database > Backups no painel) — vale conferir a retenção do
--    plano atual. Nada disso substitui a cópia local do item 1, que é a
--    única sob controle direto da equipe.
-- ---------------------------------------------------------------------------
