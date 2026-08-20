-- Tabela do Gerador da Tabela de Resultado Final (resultado_final_logic.js)
-- Mesmo projeto Supabase já usado pelo Fluxo e pela Consulta de Vagas —
-- rodar no SQL Editor do projeto antes do primeiro uso da ferramenta.
--
-- PODE SER RODADO QUANTAS VEZES PRECISAR. O Postgres não tem
-- "create policy if not exists", então cada policy é apagada e recriada logo
-- em seguida (drop ... if exists). Sem isso, rodar o arquivo uma segunda vez
-- — por exemplo, para acrescentar a policy de DELETE — pararia no primeiro
-- "policy already exists" e as demais instruções nem chegariam a rodar.
-- A tabela em si nunca é apagada: os dados gravados permanecem.
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
drop policy if exists "resultado_final select" on public.resultado_final_unidades;
create policy "resultado_final select" on public.resultado_final_unidades
  for select to anon using (true);

drop policy if exists "resultado_final insert" on public.resultado_final_unidades;
create policy "resultado_final insert" on public.resultado_final_unidades
  for insert to anon with check (true);

drop policy if exists "resultado_final update" on public.resultado_final_unidades;
create policy "resultado_final update" on public.resultado_final_unidades
  for update to anon using (true) with check (true);

-- Exclusão é usada pelo botão "Excluir" da área administrativa da ferramenta.
-- Sem esta policy o DELETE não falha com erro claro: a API simplesmente não
-- apaga nada e responde como se tivesse dado certo (por isso a ferramenta
-- confere quantas linhas voltaram, em vez de confiar no status da resposta).
drop policy if exists "resultado_final delete" on public.resultado_final_unidades;
create policy "resultado_final delete" on public.resultado_final_unidades
  for delete to anon using (true);

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
