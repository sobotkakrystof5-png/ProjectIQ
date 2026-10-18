export type AppointmentSegment = {
  id: string
  group_id: string | null
  kind: string
  start: Date
  end: Date
  title: string | null
  customer_id: string | null
  customer_name: string | null
  staff_id: string | null
  staff_name: string | null
  service_name: string | null
  session_id?: string | null
  session_capacity?: number | null
  session_reserved?: number | null
}

export type GroupedAppointment = AppointmentSegment & { service_names: string[] }

/** Turns adjacent service rows into one calendar item while retaining the first row's id. */
export function groupAppointmentSegments(rows: readonly AppointmentSegment[]): GroupedAppointment[] {
  const groups = new Map<string, AppointmentSegment[]>()
  for (const row of rows) {
    const key = row.group_id ?? row.id
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => {
    group.sort((a, b) => a.start.getTime() - b.start.getTime())
    const first = group[0]
    const names = [...new Set(group.map((item) => item.service_name).filter((name): name is string => Boolean(name)))]
    return {
      ...first,
      start: first.start,
      end: group.reduce((latest, item) => item.end > latest ? item.end : latest, first.end),
      service_name: names.join(' + ') || null,
      service_names: names,
    }
  }).sort((a, b) => a.start.getTime() - b.start.getTime())
}
