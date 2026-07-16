# Pendências

Registro de campos/recursos removidos ou pausados na UI que podem ser retomados.
Os dados permanecem no banco — apenas a exibição/edição foi removida da interface.

## Evento — campos removidos dos detalhes (2026-07-15)

Removidos do formulário de detalhes do evento (`src/modules/crm/pages/EventoDetalhe.tsx`,
componente `EventoDetalhesForm`). As colunas continuam no banco (`crm_events.status`,
`crm_events.local_id`) e são **preservadas** no save (não são zeradas). Avaliar se voltam.

- **Status** (`status`: Planejado / Confirmado / Cancelado / Realizado). Ainda existe
  no diálogo de criação/edição rápida em `EventosCrm.tsx` e no filtro da listagem.
- **Local** (`local_id`, autocomplete de local). O vínculo com o local continua
  existindo e é usado em outras telas (ex.: listagem de eventos, GMV do local).

Para retomar: reinserir os campos no `EventoDetalhesForm` e voltar a gravar a partir
do draft (hoje o save passa `status: draft.status` preservado e `local_id: ev.local_id`).
