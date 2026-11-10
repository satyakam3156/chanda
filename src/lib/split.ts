import type { Member, SplitType } from '@/types/database'

/** The three columns that describe a split, wherever one is stored. */
export type Split = {
  split_type: SplitType
  bearer_member_id: string | null
  bearer_pct: number | null
}

export const EQUAL_SPLIT: Split = { split_type: 'equal', bearer_member_id: null, bearer_pct: null }

function nameOf(id: string | null, members: Member[]): string {
  return members.find((m) => m.id === id)?.display_name ?? '?'
}

function otherMember(id: string | null, members: Member[]): Member | undefined {
  return members.find((m) => m.id !== id)
}

/** Plain-English summary, e.g. "50/50", "Only Priya", "Rahul 60% · Priya 40%". */
export function describeSplit(s: Split, members: Member[]): string {
  switch (s.split_type) {
    case 'equal':
      return '50/50'
    case 'payer':
      return 'Whoever paid'
    case 'member':
      return `Only ${nameOf(s.bearer_member_id, members)}`
    case 'custom': {
      const pct = Number(s.bearer_pct ?? 0)
      const other = otherMember(s.bearer_member_id, members)
      return `${nameOf(s.bearer_member_id, members)} ${pct}% · ${other?.display_name ?? '?'} ${100 - pct}%`
    }
  }
}

/** Returns an error message, or null when the split is complete. */
export function validateSplit(s: Split): string | null {
  if ((s.split_type === 'member' || s.split_type === 'custom') && !s.bearer_member_id) {
    return 'Choose who bears it.'
  }
  if (s.split_type === 'custom') {
    const pct = Number(s.bearer_pct)
    if (s.bearer_pct === null || Number.isNaN(pct) || pct < 0 || pct > 100) return 'Percentage must be between 0 and 100.'
  }
  return null
}

/** Clears the columns the chosen split type doesn't use, so database checks pass. */
export function normaliseSplit(s: Split): Split {
  return {
    split_type: s.split_type,
    bearer_member_id: s.split_type === 'member' || s.split_type === 'custom' ? s.bearer_member_id : null,
    bearer_pct: s.split_type === 'custom' ? Number(s.bearer_pct) : null,
  }
}
