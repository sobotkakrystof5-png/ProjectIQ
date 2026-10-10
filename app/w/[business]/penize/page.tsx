import { MoneyPage } from '@/components/ws/money/page'
export const metadata = { title: 'Peníze' }
export default function Page({params,searchParams}:{params:{business:string};searchParams:Record<string,string|string[]|undefined>}) {
 return <MoneyPage slug={params.business} section='penize' searchParams={searchParams}/>
}
