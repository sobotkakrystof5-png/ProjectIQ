import { TodaySkeleton } from '@/components/admin/page-skeleton'

// Kostra Dnes, dokud nedoběhne dávka s daty. Platí i pro podstránky, které
// si vlastní loading.tsx nezaložily — proto mají výpisy svoje (AD06).
export default function Loading() {
  return <TodaySkeleton />
}
