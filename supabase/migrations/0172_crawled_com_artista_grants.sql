-- Concede execute das novas assinaturas (com p_com_artista) aos autenticados.
grant execute on function crawled_organizers(text, numeric, text, text, text, boolean) to authenticated;
grant execute on function crawled_locals(text, numeric, text, text, text, boolean) to authenticated;
