import Foundation

/// Rozsah čísel pro okno Domů (`GET /stats?range=…`, `lib/admin/voice/queries.ts`).
public enum StatsRange: String, CaseIterable, Sendable, Codable {
  case week = "7d"
  case month = "30d"
  case all
}

/// Odpověď `GET /api/public/voice/stats` — tatáž čísla jako admin `/dashboard/voice` (VO10).
public struct StatsResponse: Codable, Equatable, Sendable {
  public struct Day: Codable, Equatable, Sendable {
    /// Pražský den `YYYY-MM-DD`.
    public let day: String
    public let words: Int

    public init(day: String, words: Int) {
      self.day = day
      self.words = words
    }
  }

  public let range: StatsRange
  public let today: Int
  public let week: Int
  public let words: Int
  public let dictations: Int
  public let streak: Int
  public let longestStreak: Int
  /// Slova za minutu řeči; `nil` = ještě žádný diktát s řečí aspoň 2 s.
  public let wpm: Double?
  /// Ušetřený čas za období v minutách.
  public let timeSaved: Double
  public let daily: [Day]

  public init(
    range: StatsRange, today: Int, week: Int, words: Int, dictations: Int, streak: Int,
    longestStreak: Int, wpm: Double?, timeSaved: Double, daily: [Day]
  ) {
    self.range = range
    self.today = today
    self.week = week
    self.words = words
    self.dictations = dictations
    self.streak = streak
    self.longestStreak = longestStreak
    self.wpm = wpm
    self.timeSaved = timeSaved
    self.daily = daily
  }

  enum CodingKeys: String, CodingKey {
    case ok, range, today, week, words, dictations, streak, longestStreak, wpm, timeSaved, daily
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    if let ok = try c.decodeIfPresent(Bool.self, forKey: .ok), !ok {
      throw DecodingError.dataCorruptedError(forKey: .ok, in: c, debugDescription: "ok není true")
    }
    range = (try? c.decode(StatsRange.self, forKey: .range)) ?? .week
    today = try c.decodeIfPresent(Int.self, forKey: .today) ?? 0
    week = try c.decodeIfPresent(Int.self, forKey: .week) ?? 0
    words = try c.decodeIfPresent(Int.self, forKey: .words) ?? 0
    dictations = try c.decodeIfPresent(Int.self, forKey: .dictations) ?? 0
    streak = try c.decodeIfPresent(Int.self, forKey: .streak) ?? 0
    longestStreak = try c.decodeIfPresent(Int.self, forKey: .longestStreak) ?? 0
    wpm = try c.decodeIfPresent(Double.self, forKey: .wpm)
    timeSaved = try c.decodeIfPresent(Double.self, forKey: .timeSaved) ?? 0
    daily = try c.decodeIfPresent([Day].self, forKey: .daily) ?? []
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(true, forKey: .ok)
    try c.encode(range, forKey: .range)
    try c.encode(today, forKey: .today)
    try c.encode(week, forKey: .week)
    try c.encode(words, forKey: .words)
    try c.encode(dictations, forKey: .dictations)
    try c.encode(streak, forKey: .streak)
    try c.encode(longestStreak, forKey: .longestStreak)
    try c.encodeIfPresent(wpm, forKey: .wpm)
    try c.encode(timeSaved, forKey: .timeSaved)
    try c.encode(daily, forKey: .daily)
  }
}

/// Slovo ve slovníku nebo zkratka (`GET /terms`).
public struct DictionaryWord: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let term: String
  public let heardAs: [String]
  /// `manual` = zapsané ručně, `learned` = naučené samo z oprav.
  public let source: String
  public let uses: Int

  public var isLearned: Bool { source == "learned" }

  public init(id: String, term: String, heardAs: [String], source: String, uses: Int) {
    self.id = id
    self.term = term
    self.heardAs = heardAs
    self.source = source
    self.uses = uses
  }

  enum CodingKeys: String, CodingKey { case id, term, heardAs, source, uses }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    term = try c.decode(String.self, forKey: .term)
    heardAs = try c.decodeIfPresent([String].self, forKey: .heardAs) ?? []
    source = try c.decodeIfPresent(String.self, forKey: .source) ?? "manual"
    uses = try c.decodeIfPresent(Int.self, forKey: .uses) ?? 0
  }
}

public struct DictionarySnippet: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let trigger: String
  public let expansion: String
  public let uses: Int

  public init(id: String, trigger: String, expansion: String, uses: Int) {
    self.id = id
    self.trigger = trigger
    self.expansion = expansion
    self.uses = uses
  }

  enum CodingKeys: String, CodingKey { case id, trigger, expansion, uses }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    trigger = try c.decode(String.self, forKey: .trigger)
    expansion = try c.decode(String.self, forKey: .expansion)
    uses = try c.decodeIfPresent(Int.self, forKey: .uses) ?? 0
  }
}

public struct DictionaryResponse: Decodable, Equatable, Sendable {
  public let terms: [DictionaryWord]
  public let snippets: [DictionarySnippet]

  enum CodingKeys: String, CodingKey { case ok, terms, snippets }

  public init(terms: [DictionaryWord], snippets: [DictionarySnippet]) {
    self.terms = terms
    self.snippets = snippets
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    guard try c.decodeIfPresent(Bool.self, forKey: .ok) == true else {
      throw DecodingError.dataCorruptedError(forKey: .ok, in: c, debugDescription: "ok není true")
    }
    terms = try c.decodeIfPresent([DictionaryWord].self, forKey: .terms) ?? []
    snippets = try c.decodeIfPresent([DictionarySnippet].self, forKey: .snippets) ?? []
  }
}

/// Kategorie aplikací (`lib/admin/voice/categories.ts`, `VOICE_CATEGORIES`).
public enum VoiceCategory: String, CaseIterable, Sendable, Codable, Identifiable {
  case email
  case workMsg = "work_msg"
  case personalMsg = "personal_msg"
  case aiPrompt = "ai_prompt"
  case document
  case other

  public var id: String { rawValue }

  /// Stejné názvy jako v adminu (`CATEGORY_LABEL`).
  public var title: String {
    switch self {
    case .email: return "E-maily"
    case .workMsg: return "Pracovní zprávy"
    case .personalMsg: return "Osobní zprávy"
    case .aiPrompt: return "Prompty pro AI"
    case .document: return "Dokumenty"
    case .other: return "Ostatní"
    }
  }

  /// Kde se kategorie použije, ať je jasné, co se mění.
  public var apps: String {
    switch self {
    case .email: return "Mail, Outlook, Gmail"
    case .workMsg: return "Slack, Teams"
    case .personalMsg: return "Zprávy, WhatsApp, Messenger"
    case .aiPrompt: return "Claude, ChatGPT, Terminál, Cursor"
    case .document: return "Pages, Word, Notion"
    case .other: return "Všechno ostatní"
    }
  }

  /// Výchozí styl serveru (`DEFAULT_STYLES`).
  public var defaultStyle: VoiceStyle {
    switch self {
    case .email, .document: return .formal
    case .workMsg, .other: return .neutral
    case .personalMsg: return .casual
    case .aiPrompt: return .exact
    }
  }
}

/// Styl čištění textu (`STYLE_KEYS`, popisky `STYLE_LABEL`).
public enum VoiceStyle: String, CaseIterable, Sendable, Codable, Identifiable {
  case formal
  case neutral
  case casual
  case exact

  public var id: String { rawValue }

  public var title: String {
    switch self {
    case .formal: return "Spisovně"
    case .neutral: return "Přirozeně"
    case .casual: return "Volně"
    case .exact: return "Přesně"
    }
  }

  /// Co styl dělá, jednou větou (zkráceně podle `STYLE_INSTRUCTION` v `cleanup.ts`).
  public var explanation: String {
    switch self {
    case .formal: return "Celé věty a spisovné tvary, slova jinak nemění."
    case .neutral: return "Jak byste to napsali sami. Doplní interpunkci a vypustí výplňová slova."
    case .casual: return "Jako zpráva kamarádovi. Hovorové tvary nechá, tečka na konci být nemusí."
    case .exact: return "Pro kód a zadání pro AI. Nic nepřeformuluje, názvy a anglická slova nechá přesně."
    }
  }

  /// Ukázka téže věty v každém stylu. Ilustrace, ne výstup modelu.
  public static let sampleHeard = "ehm takže zítra ve tři bych potřeboval tu nabídku pro Nováka, jo"

  public var sample: String {
    switch self {
    case .formal: return "Zítra ve tři bych potřeboval nabídku pro Nováka."
    case .neutral: return "Zítra ve tři bych potřeboval tu nabídku pro Nováka."
    case .casual: return "zítra ve tři bych potřeboval tu nabídku pro Nováka, jo"
    case .exact: return "Zítra ve tři bych potřeboval tu nabídku pro Nováka."
    }
  }
}

/// Nastavení, která jdou měnit z Macu (`GET/PATCH /settings`).
public struct RemoteSettings: Equatable, Sendable {
  public var styles: [VoiceCategory: VoiceStyle]
  /// `false` = „jen čísla“: text diktátu se na serveru neukládá.
  public var storeText: Bool
  public var autoLearnTerms: Bool
  public var cleanupEnabled: Bool

  public init(styles: [VoiceCategory: VoiceStyle], storeText: Bool, autoLearnTerms: Bool, cleanupEnabled: Bool) {
    self.styles = styles
    self.storeText = storeText
    self.autoLearnTerms = autoLearnTerms
    self.cleanupEnabled = cleanupEnabled
  }

  public func style(for category: VoiceCategory) -> VoiceStyle {
    styles[category] ?? category.defaultStyle
  }
}

/// Obálka `{ ok, settings: { … } }`. Neznámá kategorie nebo styl se přeskočí.
struct SettingsEnvelope: Decodable {
  let settings: RemoteSettings

  private struct Raw: Decodable {
    let styles: [String: String]?
    let storeText: Bool?
    let autoLearnTerms: Bool?
    let cleanupEnabled: Bool?
  }

  enum CodingKeys: String, CodingKey { case ok, settings }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    guard try c.decodeIfPresent(Bool.self, forKey: .ok) == true else {
      throw DecodingError.dataCorruptedError(forKey: .ok, in: c, debugDescription: "ok není true")
    }
    let raw = try c.decode(Raw.self, forKey: .settings)
    var styles: [VoiceCategory: VoiceStyle] = [:]
    for (key, value) in raw.styles ?? [:] {
      if let category = VoiceCategory(rawValue: key), let style = VoiceStyle(rawValue: value) {
        styles[category] = style
      }
    }
    settings = RemoteSettings(
      styles: styles,
      storeText: raw.storeText ?? true,
      autoLearnTerms: raw.autoLearnTerms ?? true,
      cleanupEnabled: raw.cleanupEnabled ?? true
    )
  }
}

/// Změna nastavení: posílá se jen to, co se mění.
public struct SettingsPatch: Encodable, Equatable, Sendable {
  public var styles: [String: String]?
  public var storeText: Bool?
  public var autoLearnTerms: Bool?
  public var cleanupEnabled: Bool?

  public init(
    styles: [VoiceCategory: VoiceStyle]? = nil,
    storeText: Bool? = nil,
    autoLearnTerms: Bool? = nil,
    cleanupEnabled: Bool? = nil
  ) {
    self.styles = styles.map { Dictionary(uniqueKeysWithValues: $0.map { ($0.key.rawValue, $0.value.rawValue) }) }
    self.storeText = storeText
    self.autoLearnTerms = autoLearnTerms
    self.cleanupEnabled = cleanupEnabled
  }

  public var isEmpty: Bool { styles == nil && storeText == nil && autoLearnTerms == nil && cleanupEnabled == nil }
}

/// Uložení slova nebo zkratky (`POST /terms`). `id` = úprava, bez něj nové.
public enum DictionaryEdit: Equatable, Sendable {
  case word(id: String?, term: String, heardAs: [String])
  case snippet(id: String?, trigger: String, expansion: String)
}

struct OkBody: Decodable {
  let ok: Bool
}

/// Odpověď `POST /feedback`: kolik slov člověk změnil a kolik slov se tím naučilo.
public struct FeedbackResult: Decodable, Equatable, Sendable {
  public let userEdits: Int
  public let learned: Int

  enum CodingKeys: String, CodingKey { case ok, userEdits, learned }

  public init(userEdits: Int, learned: Int) {
    self.userEdits = userEdits
    self.learned = learned
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    guard try c.decodeIfPresent(Bool.self, forKey: .ok) == true else {
      throw DecodingError.dataCorruptedError(forKey: .ok, in: c, debugDescription: "ok není true")
    }
    userEdits = try c.decodeIfPresent(Int.self, forKey: .userEdits) ?? 0
    learned = (try? c.decodeIfPresent(Int.self, forKey: .learned)) ?? 0
  }

  /// Oprava, kterou nemá smysl posílat znovu (diktát neznámý, starší než 24 h, bez textu).
  public static func isFinal(_ error: VoiceError) -> Bool {
    if case .server(let code, _) = error { return ["NOT_FOUND", "TOO_OLD", "NO_TEXT", "INVALID_BODY"].contains(code) }
    return false
  }
}

/// Klient pro okno ZakazIQ Voice: čísla, slovník a nastavení (VO11). Stejná pravidla jako
/// `VoiceClient` (klíč jen v hlavičce, bez cookie, bez přesměrování, bez `Origin`).
public struct VoiceAPI: Sendable {
  public let base: URL
  let key: String
  private let transport: VoiceTransport

  public init(base: URL, key: String, transport: VoiceTransport = URLSessionTransport()) {
    self.base = base
    self.key = key
    self.transport = transport
  }

  public func stats(range: StatsRange) async -> Result<StatsResponse, VoiceError> {
    var request = VoiceClient.request(base: base, path: "stats", key: key)
    request.url = Self.withQuery(request.url!, ["range": range.rawValue])
    return await send(request, as: StatsResponse.self)
  }

  public func dictionary() async -> Result<DictionaryResponse, VoiceError> {
    await send(VoiceClient.request(base: base, path: "terms", key: key), as: DictionaryResponse.self)
  }

  public func save(_ edit: DictionaryEdit) async -> Result<Void, VoiceError> {
    var request = VoiceClient.request(base: base, path: "terms", key: key, method: "POST")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = Self.body(for: edit)
    return await send(request, as: OkBody.self).map { _ in () }
  }

  public func deleteWord(id: String) async -> Result<Void, VoiceError> {
    var request = VoiceClient.request(base: base, path: "terms", key: key, method: "DELETE")
    request.url = Self.withQuery(request.url!, ["id": id])
    return await send(request, as: OkBody.self).map { _ in () }
  }

  /// Oprava po vložení (VO09): jak vložený úsek vypadá teď. Server se z rozdílu učí.
  public func feedback(id: UUID, editedText: String) async -> Result<FeedbackResult, VoiceError> {
    var request = VoiceClient.request(base: base, path: "feedback", key: key, method: "POST")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    struct Body: Encodable { let id: String; let editedText: String }
    request.httpBody = try? JSONEncoder().encode(Body(id: id.uuidString.lowercased(), editedText: String(editedText.prefix(20_000))))
    return await send(request, as: FeedbackResult.self)
  }

  public func settings() async -> Result<RemoteSettings, VoiceError> {
    await send(VoiceClient.request(base: base, path: "settings", key: key), as: SettingsEnvelope.self).map(\.settings)
  }

  public func update(_ patch: SettingsPatch) async -> Result<RemoteSettings, VoiceError> {
    var request = VoiceClient.request(base: base, path: "settings", key: key, method: "PATCH")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONEncoder().encode(patch)
    return await send(request, as: SettingsEnvelope.self).map(\.settings)
  }

  // MARK: Pomocné

  static func body(for edit: DictionaryEdit) -> Data? {
    struct Word: Encodable { let kind = "term"; let id: String?; let term: String; let heardAs: [String] }
    struct Snippet: Encodable { let kind = "snippet"; let id: String?; let term: String; let expansion: String }
    let encoder = JSONEncoder()
    switch edit {
    case .word(let id, let term, let heardAs):
      return try? encoder.encode(Word(id: id, term: term, heardAs: heardAs))
    case .snippet(let id, let trigger, let expansion):
      // Server čte zkratku z pole `term` (`app/api/public/voice/terms/route.ts`).
      return try? encoder.encode(Snippet(id: id, term: trigger, expansion: expansion))
    }
  }

  static func withQuery(_ url: URL, _ items: [String: String]) -> URL {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
    components.queryItems = items.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
    return components.url ?? url
  }

  func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async -> Result<T, VoiceError> {
    do {
      let (data, response) = try await transport.send(request)
      return VoiceClient.parse(T.self, data: data, status: response.statusCode)
    } catch {
      return .failure(VoiceError.from(error))
    }
  }
}
