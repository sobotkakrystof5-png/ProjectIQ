/** „+420777123456" → „+420 777 123 456" (jen české číslo, jinak beze změny). Bez závislostí, jde i do prohlížeče. */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+420(\d{3})(\d{3})(\d{3})$/)
  return m ? `+420 ${m[1]} ${m[2]} ${m[3]}` : phone
}
