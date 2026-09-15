-- A tabela ai_picks anterior (migration 003, ja aplicada em producao) era de
-- uma implementacao anterior do recurso "IA escolhe pra voce": um log por
-- escolha (plan/genre/engine/pick_name), usado so para contar o cooldown do
-- plano gratuito. O recurso foi reescrito - agora guarda o item completo
-- escolhido por conta, sobrescrito a cada nova escolha - e o shape novo nao
-- e uma alteracao incremental do antigo (chave primaria diferente, sem
-- plan/genre/engine), entao dropar e recriar em vez de fazer alter table.
drop index if exists ai_picks_user_created_idx;
drop table if exists ai_picks;

-- Uma recomendacao de IA por conta, sobrescrita a cada nova escolha. O
-- cooldown (NEXT_PUBLIC_AI_PICK_COOLDOWN_DAYS) e calculado a partir de
-- picked_at pela aplicacao, nao aqui - guardar o item inteiro (nao so o id)
-- deixa o GET pronto para exibir sem depender do catalogo estar carregado.
create table ai_picks (
  user_id uuid primary key references users (id) on delete cascade,
  playlist_id text,
  kind text not null,
  item jsonb not null,
  reason text,
  picked_at timestamptz not null default now()
);
