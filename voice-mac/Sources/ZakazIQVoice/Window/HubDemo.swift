#if DEBUG
import Foundation
import ZakazIQVoiceCore

/// Jen ladicí sestavení: `ZAKAZIQ_VOICE_DEMO=1` naplní okno vymyšlenými ukázkovými daty
/// (kontrola vzhledu bez serveru a bez diktátů). Do vydání se nedostane.
enum HubDemo {
  static var isOn: Bool { ProcessInfo.processInfo.environment["ZAKAZIQ_VOICE_DEMO"] == "1" }

  static func stats(today: String) -> StatsResponse {
    let words = [820, 0, 1430, 960, 2210, 380, 1240]
    let now = Date()
    let daily = words.enumerated().map { i, w -> StatsResponse.Day in
      .init(day: HubFormat.isoDay(now.addingTimeInterval(Double(i - 6) * 86_400)), words: w)
    }
    return StatsResponse(
      range: .week, today: 1240, week: words.reduce(0, +), words: words.reduce(0, +), dictations: 212,
      streak: 4, longestStreak: 11, wpm: 134, timeSaved: 142, daily: daily
    )
  }

  @MainActor
  final class History: DictationHistorySource {
    var rows: [HistoryRow]

    init() {
      let now = Date()
      func ago(_ minutes: Double) -> Date { now.addingTimeInterval(-minutes * 60) }
      rows = [
        .init(id: UUID(), startedAt: ago(4), appName: "Ukázka Mail", status: .ok, words: 38, text: "Dobrý den, posílám nabídku na nový web. Termín dokončení je do konce února, cena zůstává, jak jsme se domluvili.", corrected: false),
        .init(id: UUID(), startedAt: ago(26), appName: "Ukázka Slack", status: .ok, words: 12, text: "Nasazení proběhlo, v adminu je nová záložka Voice.", corrected: true),
        .init(id: UUID(), startedAt: ago(41), appName: "Ukázka Claude", status: .raw, words: 24, text: "Projdi soubor lib admin voice pipeline a najdi, proč se G7 spouští u krátkých diktátů.", corrected: false),
        .init(id: UUID(), startedAt: ago(70), appName: "Ukázka Zprávy", status: .queued, words: 0, text: nil, corrected: false),
        .init(id: UUID(), startedAt: ago(95), appName: "Ukázka Notes", status: .blocked, words: 0, text: nil, corrected: false),
        .init(id: UUID(), startedAt: ago(60 * 26), appName: "Ukázka Mail", status: .snippet, words: 6, text: "Kryštof Sobotka, VIZEON", corrected: false),
        .init(id: UUID(), startedAt: ago(60 * 50), appName: "Ukázka Safari", status: .error, words: 0, text: nil, corrected: false),
      ]
    }

    func recent(limit: Int) -> [HistoryRow] { Array(rows.prefix(limit)) }
    func delete(id: UUID) { rows.removeAll { $0.id == id } }
    func deleteAll() { rows.removeAll() }
    func retry(id: UUID) {}
  }

  static let dictionary = DictionaryResponse(
    terms: [
      DictionaryWord(id: "1", term: "ZakazIQ", heardAs: ["zákaz iq", "zakaz ik"], source: "manual", uses: 48),
      DictionaryWord(id: "2", term: "Prvotka", heardAs: ["prvotku"], source: "learned", uses: 7),
      DictionaryWord(id: "3", term: "VIZEON", heardAs: [], source: "manual", uses: 0),
    ],
    snippets: [DictionarySnippet(id: "4", trigger: "můj podpis", expansion: "Kryštof Sobotka\nVIZEON · vizeon.cz", uses: 3)]
  )

  static let settings = RemoteSettings(styles: [.email: .formal, .aiPrompt: .exact], storeText: true, autoLearnTerms: true, cleanupEnabled: true)
}

extension HubModel {
  func applyDemo() {
    if historySourceForDemo == nil {
      let demo = HubDemo.History()
      historySourceForDemo = demo
      attachHistory(demo)
    }
    reloadHistory()
    applyDemoData(
      numbers: .fresh(HubDemo.stats(today: HubFormat.isoDay(Date()))),
      dictionary: HubDemo.dictionary,
      remote: HubDemo.settings
    )
  }
}
#endif
