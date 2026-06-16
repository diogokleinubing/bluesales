-- Classificação automática de eventos via atrações (artists).
-- Cada atração pode definir um Segmento Padrão e participar (ou não) da
-- classificação automática. O gênero reaproveita o genero_id já existente.
alter table artists add column if not exists segmento text;
alter table artists add column if not exists classificar boolean not null default true;
