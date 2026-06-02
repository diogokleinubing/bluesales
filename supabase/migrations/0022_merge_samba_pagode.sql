-- ============================================================================
-- Unifica os gêneros "Samba" e "Pagode" em um só: "Samba e Pagode"
-- ----------------------------------------------------------------------------
-- Como Samba e Pagode são tratados como um estilo único, juntar os dois evita
-- que line-ups com ambos virem "Diversos" (passam a ter um único gênero).
-- ============================================================================

-- Novo gênero unificado.
insert into generos (org_id, nome)
select id, 'Samba e Pagode' from orgs
on conflict (org_id, nome) do nothing;

-- Regras passam a apontar para o gênero unificado.
update keyword_rules set genero = 'Samba e Pagode'
  where genero in ('Samba', 'Pagode');
update venue_rules set genero = 'Samba e Pagode'
  where genero in ('Samba', 'Pagode');
update venue_segment_map set genero = 'Samba e Pagode'
  where genero in ('Samba', 'Pagode');

-- Eventos já classificados (cache e manual) migram para o gênero unificado.
update events set genero = 'Samba e Pagode'
  where genero in ('Samba', 'Pagode');
update events set genero_manual = 'Samba e Pagode'
  where genero_manual in ('Samba', 'Pagode');

-- Remove os gêneros antigos do seletor.
delete from generos where nome in ('Samba', 'Pagode');
