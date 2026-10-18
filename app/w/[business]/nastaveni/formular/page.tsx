import { redirect } from 'next/navigation'

export default async function LegacySettingsPage(props: { params: Promise<{ business: string }> }) {
  const { business } = await props.params
  redirect(`/w/${business}/nastaveni/objednavky#formular`)
}
