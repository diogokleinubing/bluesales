import type { FieldDef } from '@/modules/bi/import/types'

// Campos da importação de organizações (origem Blueticket).
export type OrgField =
  | 'blueticket_code'
  | 'nome'
  | 'blueticket_parent_code'
  | 'razao_social'
  | 'documento'
  | 'telefone'
  | 'relationship_user_code'
  | 'cidade'
  | 'uf'

export const ORG_FIELDS: FieldDef<OrgField>[] = [
  { field: 'blueticket_code', label: 'Código (Blueticket)', required: true, aliases: ['codigo', 'codigo_organizador', 'cod_organizador', 'codigoorganizador', 'id_organizador', 'codigo_org', 'id'] },
  { field: 'nome', label: 'Nome', required: true, aliases: ['nome', 'nome_fantasia', 'fantasia', 'nome_organizador', 'organizador'] },
  { field: 'blueticket_parent_code', label: 'Código principal (sub-org)', required: false, aliases: ['codigo_principal', 'cod_principal', 'codigo_pai', 'codigoprincipal', 'id_principal', 'principal'] },
  { field: 'razao_social', label: 'Razão social', required: false, aliases: ['razao_social', 'razaosocial', 'razao'] },
  { field: 'documento', label: 'Documento (CNPJ/CPF)', required: false, aliases: ['documento', 'cnpj', 'cpf', 'cpf_cnpj', 'doc'] },
  { field: 'telefone', label: 'Telefone', required: false, aliases: ['telefone', 'fone', 'celular', 'contato', 'tel'] },
  { field: 'relationship_user_code', label: 'Cód. usuário relacionamento', required: false, aliases: ['codigo_usuario_relacionamento', 'cod_usuario_relacionamento', 'codigo_relacionamento', 'usuario_relacionamento', 'cod_relacionamento'] },
  { field: 'cidade', label: 'Cidade', required: false, aliases: ['cidade', 'municipio'] },
  { field: 'uf', label: 'Estado (UF)', required: false, aliases: ['uf', 'estado'] },
]
