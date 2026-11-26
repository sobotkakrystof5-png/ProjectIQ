import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Okno: čísla a čas česky")
struct HubFormatTests {
  static func prague(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int) -> Date {
    var c = DateComponents(year: y, month: mo, day: d, hour: h, minute: mi)
    c.timeZone = HubFormat.prague
    return Calendar(identifier: .gregorian).date(from: c)!
  }

  @Test("tisíce s pevnou mezerou")
  func numbers() {
    #expect(HubFormat.number(0) == "0")
    #expect(HubFormat.number(999) == "999")
    #expect(HubFormat.number(1240) == "1\u{00A0}240")
    #expect(HubFormat.number(1_234_567) == "1\u{00A0}234\u{00A0}567")
  }

  @Test("české tvary podle počtu")
  func plurals() {
    #expect(HubFormat.words(1) == "1\u{00A0}slovo")
    #expect(HubFormat.words(3) == "3\u{00A0}slova")
    #expect(HubFormat.words(5) == "5\u{00A0}slov")
    #expect(HubFormat.words(0) == "0\u{00A0}slov")
    #expect(HubFormat.days(1) == "1\u{00A0}den")
    #expect(HubFormat.days(4) == "4\u{00A0}dny")
    #expect(HubFormat.days(12) == "12\u{00A0}dní")
    #expect(HubFormat.dictations(2) == "2\u{00A0}diktáty")
    #expect(HubFormat.todaySentence(0) == "Dnes jste ještě nediktovali.")
    #expect(HubFormat.todaySentence(1240) == "Dnes jste nadiktovali 1\u{00A0}240\u{00A0}slov.")
  }

  @Test("ušetřený čas a rychlost")
  func durations() {
    #expect(HubFormat.duration(minutes: 0) == "méně než minuta")
    #expect(HubFormat.duration(minutes: 0.4) == "méně než minuta")
    #expect(HubFormat.duration(minutes: 45) == "45\u{00A0}min")
    #expect(HubFormat.duration(minutes: 80) == "1\u{00A0}h 20\u{00A0}min")
    #expect(HubFormat.duration(minutes: 180) == "3\u{00A0}h")
    #expect(HubFormat.duration(minutes: .nan) == "méně než minuta")
    #expect(HubFormat.speed(nil) == "—")
    #expect(HubFormat.speed(127.6) == "128")
  }

  @Test("pozdrav a čas diktátu v pražském čase")
  func times() {
    let now = Self.prague(2026, 11, 26, 14, 30)
    #expect(HubFormat.greeting(at: Self.prague(2026, 11, 26, 7, 0)) == "Dobré ráno")
    #expect(HubFormat.greeting(at: now) == "Dobrý den")
    #expect(HubFormat.greeting(at: Self.prague(2026, 11, 26, 22, 0)) == "Dobrý večer")
    #expect(HubFormat.when(Self.prague(2026, 11, 26, 14, 2), now: now) == "14:02")
    #expect(HubFormat.when(Self.prague(2026, 11, 25, 9, 5), now: now) == "včera 9:05")
    #expect(HubFormat.when(Self.prague(2026, 11, 20, 18, 0), now: now) == "20. 11. 18:00")
    #expect(HubFormat.when(Self.prague(2025, 12, 31, 18, 0), now: now) == "31. 12. 2025")
    #expect(HubFormat.updated(Self.prague(2026, 11, 26, 14, 2), now: now) == "Naposledy aktualizováno 14:02")
    // Půlnoc v Praze je pořád pražský den, ne UTC.
    #expect(HubFormat.isoDay(Self.prague(2026, 11, 27, 0, 30)) == "2026-11-27")
  }
}

@Suite("Okno: sloupce a série")
struct HubStatsTests {
  @Test("7 dní končících dneškem, chybějící den je nula")
  func bars() {
    let daily: [StatsResponse.Day] = [.init(day: "2026-11-20", words: 900), .init(day: "2026-11-24", words: 120), .init(day: "2026-11-26", words: 40)]
    let bars = HubStats.lastSevenDays(daily, today: "2026-11-26")
    #expect(bars.map(\.day) == ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"])
    #expect(bars.map(\.words) == [900, 0, 0, 0, 120, 0, 40])
    #expect(bars.last?.isToday == true && bars.first?.isToday == false)
    #expect(bars.last?.label == "Čt")
    #expect(bars.first?.label == "Pá")
  }

  @Test("tečky Po–Ne aktuálního týdne")
  func dots() {
    let daily: [StatsResponse.Day] = [.init(day: "2026-11-23", words: 10), .init(day: "2026-11-25", words: 0), .init(day: "2026-11-26", words: 5)]
    let dots = HubStats.weekDots(daily, today: "2026-11-26")
    #expect(dots.map(\.label) == ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"])
    #expect(dots.map(\.active) == [true, false, false, true, false, false, false])
    #expect(dots.map(\.isFuture) == [false, false, false, false, true, true, true])
    #expect(dots[3].isToday)
    // Neděle patří ještě do týdne, který začal pondělím.
    #expect(HubStats.weekDots([], today: "2026-11-29").first?.day == "2026-11-23")
  }

  @Test("věta k sérii")
  func streak() {
    #expect(HubStats.streakSentence(0) == "Série začne prvním diktátem.")
    #expect(HubStats.streakSentence(5) == "5\u{00A0}dní v řadě")
  }
}

@Suite("Okno: server")
struct VoiceAPITests {
  static let key = DeviceKeyTests.sample
  static let base = URL(string: "https://www.zakaziq.cz")!

  @Test("/stats: rozsah v adresě, klíč v hlavičce, čísla jako v adminu")
  func stats() async throws {
    let body = #"{"ok":true,"range":"7d","today":340,"week":2100,"words":2100,"dictations":44,"streak":5,"longestStreak":9,"wpm":131,"timeSaved":38,"daily":[{"day":"2026-11-26","words":340}],"novePole":1}"#
    let transport = FakeTransport(.http(200, body))
    let api = VoiceAPI(base: Self.base, key: Self.key, transport: transport)
    let stats = try await api.stats(range: .week).get()
    #expect(stats.today == 340 && stats.streak == 5 && stats.wpm == 131 && stats.timeSaved == 38)
    #expect(stats.daily == [.init(day: "2026-11-26", words: 340)])
    let request = try #require(transport.lastRequest)
    #expect(request.url?.absoluteString == "https://www.zakaziq.cz/api/public/voice/stats?range=7d")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(Self.key)")
    #expect(request.value(forHTTPHeaderField: "Origin") == nil)
  }

  @Test("/stats bez rychlosti (null) a uložení do cache tam a zpět")
  func statsRoundTrip() throws {
    let data = Data(#"{"ok":true,"range":"30d","today":0,"week":0,"words":0,"dictations":0,"streak":0,"longestStreak":0,"wpm":null,"timeSaved":0,"daily":[]}"#.utf8)
    let stats = try VoiceClient.parse(StatsResponse.self, data: data, status: 200).get()
    #expect(stats.wpm == nil && stats.range == .month)

    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("zakaziq-voice-test-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let cache = StatsCache(url: dir.appendingPathComponent("stats.json"))
    #expect(cache.load() == nil)
    let when = Date(timeIntervalSince1970: 1_800_000_000)
    cache.save(.init(stats: stats, fetchedAt: when))
    #expect(cache.load() == .init(stats: stats, fetchedAt: when))
    let perms = try FileManager.default.attributesOfItem(atPath: cache.url.path)[.posixPermissions] as? Int
    #expect(perms == 0o600)
  }

  @Test("bez sítě Domů ukáže poslední čísla s důvodem, bez nich jen větu")
  func offline() {
    let stats = StatsResponse(range: .week, today: 10, week: 10, words: 10, dictations: 1, streak: 1, longestStreak: 1, wpm: nil, timeSaved: 0, daily: [])
    let when = Date(timeIntervalSince1970: 1_800_000_000)
    let cached = HomeNumbers.resolve(.failure(.offline), cache: .init(stats: stats, fetchedAt: when))
    #expect(cached == .cached(stats, fetchedAt: when, reason: VoiceMessages.text(for: .offline)))
    #expect(cached.stats == stats)
    #expect(HomeNumbers.resolve(.failure(.offline), cache: nil) == .unavailable(VoiceMessages.text(for: .offline)))
    #expect(HomeNumbers.resolve(.success(stats), cache: nil) == .fresh(stats))
  }

  @Test("slovník: načtení, naučená slova, uložení a smazání")
  func dictionary() async throws {
    let body = #"{"ok":true,"terms":[{"id":"a","term":"ZakazIQ","heardAs":["zákaz iq"],"source":"learned","uses":12},{"id":"b","term":"Prvotka"}],"snippets":[{"id":"c","trigger":"můj podpis","expansion":"Kryštof Sobotka","uses":3}]}"#
    let api = VoiceAPI(base: Self.base, key: Self.key, transport: FakeTransport(.http(200, body)))
    let dict = try await api.dictionary().get()
    #expect(dict.terms.map(\.isLearned) == [true, false])
    #expect(dict.terms[1].heardAs.isEmpty && dict.terms[1].source == "manual")
    #expect(dict.snippets.first?.trigger == "můj podpis")

    let saving = FakeTransport(.http(200, #"{"ok":true}"#))
    let saveAPI = VoiceAPI(base: Self.base, key: Self.key, transport: saving)
    _ = try await saveAPI.save(.snippet(id: nil, trigger: "podpis", expansion: "Kryštof")).get()
    let sent = try #require(saving.lastRequest)
    #expect(sent.httpMethod == "POST")
    #expect(sent.value(forHTTPHeaderField: "Content-Type") == "application/json")
    let json = try #require(try JSONSerialization.jsonObject(with: sent.httpBody ?? Data()) as? [String: Any])
    #expect(json["kind"] as? String == "snippet" && json["term"] as? String == "podpis" && json["expansion"] as? String == "Kryštof")

    let deleting = FakeTransport(.http(200, #"{"ok":true}"#))
    _ = try await VoiceAPI(base: Self.base, key: Self.key, transport: deleting).deleteWord(id: "a b").get()
    #expect(deleting.lastRequest?.httpMethod == "DELETE")
    #expect(deleting.lastRequest?.url?.absoluteString == "https://www.zakaziq.cz/api/public/voice/terms?id=a%20b")
  }

  @Test("slovník: stejné slovo podruhé dá srozumitelnou hlášku")
  func duplicate() async {
    let api = VoiceAPI(base: Self.base, key: Self.key, transport: FakeTransport(.http(409, #"{"ok":false,"code":"DUPLICATE"}"#)))
    let result = await api.save(.word(id: nil, term: "ZakazIQ", heardAs: []))
    guard case .failure(let error) = result else { Issue.record("čekala se chyba"); return }
    #expect(HubMessages.dictionaryError(error) == "Tohle slovo už ve slovníku je.")
    #expect(HubMessages.splitHeardAs(" zákaz iq ,  zakaz  ik, ZÁKAZ IQ,, ") == ["zákaz iq", "zakaz ik"])
  }

  @Test("nastavení: neznámý styl se přeskočí, změna posílá jen to, co se mění")
  func settings() async throws {
    let body = #"{"ok":true,"settings":{"styles":{"email":"formal","work_msg":"wild","novaKategorie":"exact"},"storeText":false,"autoLearnTerms":true,"cleanupEnabled":true}}"#
    let transport = FakeTransport(.http(200, body))
    let api = VoiceAPI(base: Self.base, key: Self.key, transport: transport)
    let settings = try await api.update(SettingsPatch(styles: [.email: .formal], storeText: false)).get()
    #expect(settings.styles == [.email: .formal])
    #expect(settings.style(for: .workMsg) == .neutral)
    #expect(settings.style(for: .aiPrompt) == .exact)
    #expect(!settings.storeText)
    let sent = try #require(transport.lastRequest)
    #expect(sent.httpMethod == "PATCH")
    let json = try #require(try JSONSerialization.jsonObject(with: sent.httpBody ?? Data()) as? [String: Any])
    #expect(Set(json.keys) == ["styles", "storeText"])
    #expect((json["styles"] as? [String: String]) == ["email": "formal"])
    #expect(SettingsPatch().isEmpty)
  }
}

@Suite("Okno: historie")
struct HistorySearchTests {
  static func row(_ text: String?, app: String? = "Mail", status: HistoryRowStatus = .ok) -> HistoryRow {
    HistoryRow(id: UUID(), startedAt: Date(), appName: app, status: status, words: 3, text: text, corrected: false)
  }

  @Test("hledá bez diakritiky a velkých písmen, v textu i aplikaci")
  func search() {
    let rows = [Self.row("Nabídka pro Nováka"), Self.row("Ahoj", app: "Slack"), Self.row(nil, status: .queued)]
    #expect(HistorySearch.filter(rows, query: "nabidka", filter: .all).count == 1)
    #expect(HistorySearch.filter(rows, query: "SLACK", filter: .all).count == 1)
    #expect(HistorySearch.filter(rows, query: "  ", filter: .all).count == 3)
    #expect(HistorySearch.filter(rows, query: "", filter: .queued).count == 1)
    #expect(HistorySearch.filter(rows, query: "", filter: .withText).count == 2)
  }

  @Test("co jde zkopírovat a zkusit znovu")
  func statuses() {
    #expect(HistoryRowStatus.ok.hasText && HistoryRowStatus.raw.hasText && !HistoryRowStatus.blocked.hasText)
    #expect(HistoryRowStatus.queued.canRetry && HistoryRowStatus.error.canRetry && !HistoryRowStatus.failed.canRetry)
    #expect(HistoryFilter.problems.matches(.failed) && !HistoryFilter.problems.matches(.ok))
  }

  @Test("volby okna: úvod a poslední záložka")
  func preferences() throws {
    let suite = "cz.zakaziq.voice.tests.hub.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let prefs = HubPreferences(defaults: defaults)
    #expect(!prefs.onboardingDone && prefs.lastTab == nil)
    prefs.onboardingDone = true
    prefs.lastTab = "history"
    #expect(prefs.onboardingDone && prefs.lastTab == "history")
  }
}
