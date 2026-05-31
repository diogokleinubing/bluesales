import { useQuery } from '@tanstack/react-query'
import { useDefaultOrg } from '@/lib/org'
import { fetchRules, type RulesBundle } from '../lib/rules-api'

export function useRules() {
  const org = useDefaultOrg()
  const orgId = org.data?.id
  const query = useQuery({
    enabled: !!orgId,
    queryKey: ['rules', orgId],
    queryFn: () => fetchRules(orgId!),
  })
  const empty: RulesBundle = {
    segments: [],
    keywordRules: [],
    venueRules: [],
    venueMap: [],
    overrides: [],
  }
  return { ...query, orgId, rules: query.data ?? empty }
}
