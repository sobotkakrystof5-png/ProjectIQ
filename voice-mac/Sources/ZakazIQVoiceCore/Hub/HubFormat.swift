import Foundation

/// České formátování čísel, času a dnů pro okno ZakazIQ Voice (VO11).
/// Čisté funkce bez systému, ať jdou testovat; čas pražský jako na serveru.
public enum HubFormat {
  public static let prague = TimeZone(identifier: "Europe/Prague")!

  static var calendar: Calendar {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = prague
    cal.firstWeekday = 2
    cal.locale = Locale(identifier: "cs_CZ")
    return cal
  }

  // MARK: Čísla

  /// Tisíce oddělené pevnou mezerou: 1 240, 12 480.
  public static func number(_ value: Int) -> String {
    let digits = String(abs(value))
    var groups: [Substring] = []
    var end = digits.endIndex
    while end > digits.startIndex {
      let start = digits.index(end, offsetBy: -3, limitedBy: digits.startIndex) ?? digits.startIndex
      groups.insert(digits[start..<end], at: 0)
      end = start
    }
    return (value < 0 ? "−" : "") + groups.joined(separator: "\u{00A0}")
  }

  /// Český tvar podle počtu: 1 slovo, 2–4 slova, 0 a 5+ slov.
  public static func plural(_ n: Int, one: String, few: String, many: String) -> String {
    let a = abs(n)
    if a == 1 { return one }
    if (2...4).contains(a) { return few }
    return many
  }

  public static func words(_ n: Int) -> String {
    "\(number(n))\u{00A0}\(plural(n, one: "slovo", few: "slova", many: "slov"))"
  }

  public static func days(_ n: Int) -> String {
    "\(number(n))\u{00A0}\(plural(n, one: "den", few: "dny", many: "dní"))"
  }

  public static func dictations(_ n: Int) -> String {
    "\(number(n))\u{00A0}\(plural(n, one: "diktát", few: "diktáty", many: "diktátů"))"
  }

  /// Hlavní věta Domů.
  public static func todaySentence(_ words: Int) -> String {
    words == 0 ? "Dnes jste ještě nediktovali." : "Dnes jste nadiktovali \(Self.words(words))."
  }

  /// Rychlost: „128 slov za minutu“, bez čísla pomlčka.
  public static func speed(_ wpm: Double?) -> String {
    guard let wpm, wpm.isFinite, wpm > 0 else { return "—" }
    return number(Int(wpm.rounded()))
  }

  /// Ušetřený čas z minut: „méně než minuta“, „45 min“, „1 h 20 min“, „3 h“.
  public static func duration(minutes: Double) -> String {
    guard minutes.isFinite, minutes >= 1 else { return "méně než minuta" }
    let total = Int(minutes.rounded())
    let h = total / 60
    let m = total % 60
    if h == 0 { return "\(m)\u{00A0}min" }
    if m == 0 { return "\(number(h))\u{00A0}h" }
    return "\(number(h))\u{00A0}h \(m)\u{00A0}min"
  }

  // MARK: Čas

  /// Pozdrav podle denní doby (pražský čas).
  public static func greeting(at date: Date) -> String {
    let hour = calendar.component(.hour, from: date)
    switch hour {
    case 4..<10: return "Dobré ráno"
    case 10..<18: return "Dobrý den"
    default: return "Dobrý večer"
    }
  }

  static func hm(_ date: Date) -> String {
    let c = calendar.dateComponents([.hour, .minute], from: date)
    return String(format: "%d:%02d", c.hour ?? 0, c.minute ?? 0)
  }

  /// Čas diktátu v seznamu: „14:02“, „včera 14:02“, „25. 11. 14:02“, jiný rok „25. 11. 2025“.
  public static func when(_ date: Date, now: Date = Date()) -> String {
    let cal = calendar
    if cal.isDate(date, inSameDayAs: now) { return hm(date) }
    if let yesterday = cal.date(byAdding: .day, value: -1, to: now), cal.isDate(date, inSameDayAs: yesterday) {
      return "včera \(hm(date))"
    }
    let c = cal.dateComponents([.day, .month, .year], from: date)
    if c.year != cal.component(.year, from: now) {
      return "\(c.day ?? 0). \(c.month ?? 0). \(c.year ?? 0)"
    }
    return "\(c.day ?? 0). \(c.month ?? 0). \(hm(date))"
  }

  /// „Naposledy aktualizováno 14:02“ (dnes) nebo „… 25. 11. 14:02“.
  public static func updated(_ date: Date, now: Date = Date()) -> String {
    "Naposledy aktualizováno \(when(date, now: now))"
  }

  // MARK: Dny

  /// Pražský den `YYYY-MM-DD` pro okamžik.
  public static func isoDay(_ date: Date) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  static func date(fromISODay day: String) -> Date? {
    let parts = day.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
  }

  static let weekdayShort = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"]

  /// Krátký název dne (Po, Út…) pro `YYYY-MM-DD`.
  public static func weekdayShortName(_ day: String) -> String {
    guard let date = date(fromISODay: day) else { return "" }
    return weekdayShort[calendar.component(.weekday, from: date) - 1]
  }
}

/// Sloupec v grafu za posledních 7 dní.
public struct DayBar: Equatable, Sendable, Identifiable {
  public let day: String
  public let label: String
  public let words: Int
  public let isToday: Bool
  public var id: String { day }
}

/// Tečka série: den v aktuálním týdnu (Po–Ne), jestli se v něm diktovalo.
public struct StreakDot: Equatable, Sendable, Identifiable {
  public let day: String
  public let label: String
  public let active: Bool
  public let isToday: Bool
  public let isFuture: Bool
  public var id: String { day }
}

public enum HubStats {
  /// Posledních 7 dní končících dneškem, chybějící den = 0 slov.
  public static func lastSevenDays(_ daily: [StatsResponse.Day], today: String) -> [DayBar] {
    let byDay = Dictionary(daily.map { ($0.day, $0.words) }, uniquingKeysWith: { a, _ in a })
    guard let todayDate = HubFormat.date(fromISODay: today) else { return [] }
    return (0..<7).reversed().compactMap { back -> DayBar? in
      guard let d = HubFormat.calendar.date(byAdding: .day, value: -back, to: todayDate) else { return nil }
      let iso = HubFormat.isoDay(d)
      return DayBar(day: iso, label: HubFormat.weekdayShortName(iso), words: byDay[iso] ?? 0, isToday: back == 0)
    }
  }

  /// Tečky Po–Ne aktuálního týdne. Aktivní den = aspoň jedno slovo.
  public static func weekDots(_ daily: [StatsResponse.Day], today: String) -> [StreakDot] {
    let active = Set(daily.filter { $0.words > 0 }.map(\.day))
    guard let todayDate = HubFormat.date(fromISODay: today) else { return [] }
    let cal = HubFormat.calendar
    let weekday = cal.component(.weekday, from: todayDate)
    let sinceMonday = (weekday + 5) % 7
    guard let monday = cal.date(byAdding: .day, value: -sinceMonday, to: todayDate) else { return [] }
    return (0..<7).compactMap { offset -> StreakDot? in
      guard let d = cal.date(byAdding: .day, value: offset, to: monday) else { return nil }
      let iso = HubFormat.isoDay(d)
      return StreakDot(
        day: iso,
        label: HubFormat.weekdayShortName(iso),
        active: active.contains(iso),
        isToday: iso == today,
        isFuture: iso > today
      )
    }
  }

  /// Věta k sérii: „5 dní v řadě“, bez série povzbuzení.
  public static func streakSentence(_ streak: Int) -> String {
    streak <= 0 ? "Série začne prvním diktátem." : "\(HubFormat.days(streak)) v řadě"
  }
}
