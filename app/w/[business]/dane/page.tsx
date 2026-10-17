import { MoneyPage } from '@/components/ws/money/page'
export const metadata = { title: 'Peníze' }
export default async function Page(
 props:{params: Promise<{business:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}
) {
 const searchParams = await props.searchParams
 const params = await props.params
 return <MoneyPage slug={params.business} section='dane' searchParams={searchParams}/>
}
