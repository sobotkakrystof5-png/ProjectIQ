import Foundation

/// Poslední čísla ze serveru pro okno Domů, když server neodpovídá (VO11).
/// Jen čísla, žádný text diktátu; soubor v Application Support s právy 0600.
public struct StatsCache: Sendable {
  public struct Entry: Codable, Equatable, Sendable {
    public let stats: StatsResponse
    public let fetchedAt: Date

    public init(stats: StatsResponse, fetchedAt: Date) {
      self.stats = stats
      self.fetchedAt = fetchedAt
    }
  }

  public let url: URL

  public init(url: URL = StatsCache.defaultURL) {
    self.url = url
  }

  public static var defaultURL: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("ZakazIQ Voice", isDirectory: true).appendingPathComponent("stats.json")
  }

  public func load() -> Entry? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try? decoder.decode(Entry.self, from: data)
  }

  public func save(_ entry: Entry) {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    guard let data = try? encoder.encode(entry) else { return }
    let fm = FileManager.default
    try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    try? data.write(to: url, options: .atomic)
    try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
  }

  public func clear() {
    try? FileManager.default.removeItem(at: url)
  }
}

/// Co ukáže Domů: čerstvá čísla, nebo poslední uložená s časem.
public enum HomeNumbers: Equatable, Sendable {
  case loading
  case fresh(StatsResponse)
  case cached(StatsResponse, fetchedAt: Date, reason: String)
  case unavailable(String)

  public var stats: StatsResponse? {
    switch self {
    case .fresh(let s), .cached(let s, _, _): return s
    case .loading, .unavailable: return nil
    }
  }

  /// Rozhodnutí po načtení: chyba se starými čísly = staré s větou, bez nich = jen věta.
  public static func resolve(_ result: Result<StatsResponse, VoiceError>, cache: StatsCache.Entry?) -> HomeNumbers {
    switch result {
    case .success(let stats):
      return .fresh(stats)
    case .failure(let error):
      let reason = VoiceMessages.text(for: error)
      if let cache { return .cached(cache.stats, fetchedAt: cache.fetchedAt, reason: reason) }
      return .unavailable(reason)
    }
  }
}

// MARK: - Místní historie

/// Stav diktátu v místní historii. Serverové stavy (`STATUS_LABEL` v adminu) + dva místní:
/// čeká ve frontě (bez sítě) a nepřepsaný (nahrávka po 24 h smazaná).
public enum HistoryRowStatus: String, CaseIterable, Sendable, Codable {
  case ok, raw, snippet, empty, blocked, error, cancelled
  case queued
  case failed

  public var title: String {
    switch self {
    case .ok: return "Učesáno"
    case .raw: return "Jen přepis"
    case .snippet: return "Zkratka"
    case .empty: return "Nic se neřeklo"
    case .blocked: return "Zahozeno pojistkou"
    case .error: return "Přepis selhal"
    case .cancelled: return "Zrušeno"
    case .queued: return "Čeká na připojení"
    case .failed: return "Nepodařilo se přepsat"
    }
  }

  /// Má text, který jde vložit nebo zkopírovat.
  public var hasText: Bool { self == .ok || self == .raw || self == .snippet }

  /// Jde zkusit znovu (fronta nebo chyba přepisu).
  public var canRetry: Bool { self == .queued || self == .error }

  /// Potřebuje pozornost (v seznamu jinou barvou).
  public var isProblem: Bool { self == .error || self == .failed || self == .blocked }
}

/// Jeden řádek historie, jak ho ukazuje okno.
public struct HistoryRow: Equatable, Sendable, Identifiable {
  public let id: UUID
  public let startedAt: Date
  public let appName: String?
  public let status: HistoryRowStatus
  public let words: Int
  public let text: String?
  /// Opraveno po vložení (VO09).
  public let corrected: Bool

  public init(id: UUID, startedAt: Date, appName: String?, status: HistoryRowStatus, words: Int, text: String?, corrected: Bool) {
    self.id = id
    self.startedAt = startedAt
    self.appName = appName
    self.status = status
    self.words = words
    self.text = text
    self.corrected = corrected
  }
}

/// Filtr Historie.
public enum HistoryFilter: String, CaseIterable, Sendable, Identifiable {
  case all
  case withText
  case problems
  case queued

  public var id: String { rawValue }

  public var title: String {
    switch self {
    case .all: return "Vše"
    case .withText: return "S textem"
    case .problems: return "Nepovedené"
    case .queued: return "Ve frontě"
    }
  }

  public func matches(_ status: HistoryRowStatus) -> Bool {
    switch self {
    case .all: return true
    case .withText: return status.hasText
    case .problems: return status.isProblem
    case .queued: return status == .queued
    }
  }
}

/// Místní historie diktátů (VO06 ji ukládá, okno jen čte, maže a zkouší znovu).
@MainActor
public protocol DictationHistorySource: AnyObject {
  func recent(limit: Int) -> [HistoryRow]
  func delete(id: UUID)
  func deleteAll()
  /// Diktát ve frontě nebo s chybou poslat znovu. Nic nevkládá (D-V10).
  func retry(id: UUID)
}

public enum HistorySearch {
  /// Hledání bez ohledu na velikost písmen a diakritiku, v textu i v názvu aplikace.
  public static func filter(_ rows: [HistoryRow], query: String, filter: HistoryFilter) -> [HistoryRow] {
    let needle = fold(query.trimmingCharacters(in: .whitespacesAndNewlines))
    return rows.filter { row in
      guard filter.matches(row.status) else { return false }
      guard !needle.isEmpty else { return true }
      return fold(row.text ?? "").contains(needle) || fold(row.appName ?? "").contains(needle)
    }
  }

  static func fold(_ s: String) -> String {
    s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "cs_CZ"))
  }
}

/// Volby okna (ne diktování): poslední záložka a jestli proběhl úvod.
public struct HubPreferences: @unchecked Sendable {
  static let onboardingKey = "hub.onboardingDone"
  static let tabKey = "hub.lastTab"

  private let defaults: UserDefaults

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  public var onboardingDone: Bool {
    get { defaults.bool(forKey: Self.onboardingKey) }
    nonmutating set { defaults.set(newValue, forKey: Self.onboardingKey) }
  }

  public var lastTab: String? {
    get { defaults.string(forKey: Self.tabKey) }
    nonmutating set { defaults.set(newValue, forKey: Self.tabKey) }
  }
}

/// Hlášky okna podle `zakaziq-ux-texty-cs`.
public enum HubMessages {
  public static let emptyHistory = "Zatím žádný diktát. Podržte fn a mluvte."
  public static let emptySearch = "Nic takového v historii není. Zkuste jiné slovo."
  public static let emptyWords = "Ve slovníku zatím nic není. Přidejte jména a pojmy, které přepis píše špatně."
  public static let emptySnippets = "Zatím žádná zkratka. Třeba „můj podpis“ → celý podpis e-mailu."

  /// Chyba při ukládání slova nebo zkratky.
  public static func dictionaryError(_ error: VoiceError) -> String {
    if case .server(let code, _) = error {
      switch code {
      case "DUPLICATE": return "Tohle slovo už ve slovníku je."
      case "NOT_FOUND": return "Slovo už ve slovníku není. Načtěte slovník znovu."
      case "INVALID_BODY": return "Zkontrolujte délku: slovo nejvýš 80 znaků, text zkratky nejvýš 2 000."
      default: break
      }
    }
    return VoiceMessages.text(for: error)
  }

  /// Rozdělí „jak to slyší“ po čárkách, prázdné a stejné vynechá (server bere nejvýš 10).
  public static func splitHeardAs(_ raw: String) -> [String] {
    var seen = Set<String>()
    var result: [String] = []
    for part in raw.split(separator: ",") {
      let item = part.split(whereSeparator: \.isWhitespace).joined(separator: " ")
      guard !item.isEmpty, seen.insert(item.lowercased()).inserted else { continue }
      result.append(item)
    }
    return Array(result.prefix(10))
  }
}
