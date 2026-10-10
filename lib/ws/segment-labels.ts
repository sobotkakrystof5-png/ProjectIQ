// Názvy skupin zákazníků (R-025). Bez závislostí — čte je server i prohlížeč.

export type SegmentKey = 'new' | 'regular' | 'one_time' | 'dormant' | 'ended'

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  new: 'Noví',
  regular: 'Stálí',
  one_time: 'Jednorázoví',
  dormant: 'Spící',
  ended: 'Ukončení',
}
