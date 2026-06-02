-- ============================================================================
-- Regras de artista: segmento "Shows" + "Segmento só sem ano"
-- ----------------------------------------------------------------------------
-- Marca as regras de ARTISTA (têm gênero) como Shows e ignorar_com_ano=true,
-- para que em festivais (nome com ano) o segmento não vire Shows.
-- Preserva:
--   - palavras-gênero genéricas (rock/samba/reggae/pagode) -> seguem só gênero;
--   - regras já com segmento diferente de Shows (ex.: blocos de Carnaval).
-- ============================================================================

update keyword_rules
set segmento = 'Shows', ignorar_com_ano = true
where genero is not null
  and keyword not in ('rock', 'samba', 'reggae', 'pagode')
  and (segmento is null or segmento = 'Shows');
