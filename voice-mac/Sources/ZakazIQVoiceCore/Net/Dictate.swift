import Foundation

/// Pole `meta` k diktátu (plán, oddíl 7). Server ho kontroluje `.strict()`, proto tu
/// není nic navíc — celkový čas po vložení si měří Mac sám v historii.
public struct DictationMeta: Codable, Equatable, Sendable {
  public struct App: Codable, Equatable, Sendable {
    public var bundleId: String?
    public var name: String?
    /// Jen nápověda kategorie u prohlížeče; aplikace titulky oken nečte, posílá `null`.
    public var titleHint: String?

    public init(bundleId: String?, name: String?, titleHint: String? = nil) {
      self.bundleId = bundleId.map { String($0.prefix(200)) }
      self.name = name.map { String($0.prefix(120)) }
      self.titleHint = titleHint
    }

    // `null` musí jít ven výslovně (server chce klíč, ne jeho vynechání).
    public func encode(to encoder: Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(bundleId, forKey: .bundleId)
      try c.encode(name, forKey: .name)
      try c.encode(titleHint, forKey: .titleHint)
    }
  }

  public var id: UUID
  public var startedAt: Date
  public var durationMs: Int
  public var speechMs: Int?
  public var mode: DictationMode
  public var cancelled: Bool
  public var app: App

  public init(id: UUID, startedAt: Date, durationMs: Int, speechMs: Int?, mode: DictationMode, cancelled: Bool = false, app: App) {
    self.id = id
    self.startedAt = startedAt
    // Server bere nejvýš 605 000 ms (10 min s rezervou).
    self.durationMs = min(605_000, max(0, durationMs))
    self.speechMs = speechMs.map { min(605_000, max(0, $0)) }
    self.mode = mode
    self.cancelled = cancelled
    self.app = app
  }

  enum CodingKeys: String, CodingKey {
    case id, startedAt, durationMs, speechMs, mode, cancelled, app
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id.uuidString.lowercased(), forKey: .id)
    try c.encode(Self.isoString(startedAt), forKey: .startedAt)
    try c.encode(durationMs, forKey: .durationMs)
    try c.encode(speechMs, forKey: .speechMs)
    try c.encode(mode, forKey: .mode)
    try c.encode(cancelled, forKey: .cancelled)
    try c.encode(app, forKey: .app)
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(UUID.self, forKey: .id)
    let raw = try c.decode(String.self, forKey: .startedAt)
    guard let date = Self.parseISO(raw) else {
      throw DecodingError.dataCorruptedError(forKey: .startedAt, in: c, debugDescription: "startedAt")
    }
    startedAt = date
    durationMs = try c.decode(Int.self, forKey: .durationMs)
    speechMs = try c.decodeIfPresent(Int.self, forKey: .speechMs)
    mode = try c.decode(DictationMode.self, forKey: .mode)
    cancelled = try c.decodeIfPresent(Bool.self, forKey: .cancelled) ?? false
    app = try c.decode(App.self, forKey: .app)
  }

  /// `2026-11-25T14:03:11+01:00` — s posunem místního času, jak chce server.
  public static func isoString(_ date: Date, timeZone: TimeZone = .current) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    f.timeZone = timeZone
    return f.string(from: date)
  }

  static func parseISO(_ raw: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: raw)
  }

  /// JSON přesně podle kontraktu (klíče seřazené, ať jde porovnat v testu).
  public func json() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self)
  }
}

/// Odpověď `POST /dictate`: `{ ok, id, status, text, words, guards }`.
public struct DictateResponse: Decodable, Equatable, Sendable {
  public let id: String
  public let status: String
  public let text: String
  public let words: Int
  public let guards: [String]

  enum CodingKeys: String, CodingKey { case id, status, text, words, guards }

  public init(id: String, status: String, text: String, words: Int, guards: [String] = []) {
    self.id = id
    self.status = status
    self.text = text
    self.words = words
    self.guards = guards
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decodeIfPresent(String.self, forKey: .id) ?? ""
    status = try c.decode(String.self, forKey: .status)
    text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
    words = try c.decodeIfPresent(Int.self, forKey: .words) ?? 0
    guards = try c.decodeIfPresent([String].self, forKey: .guards) ?? []
  }

  /// Má se text vložit? Jen u stavů se slovy (`ok`, `raw`, `snippet`) a neprázdného textu.
  public var hasText: Bool {
    ["ok", "raw", "snippet"].contains(status) && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}

/// Tělo `multipart/form-data` s `meta` (text) a `audio` (m4a). Bez nahrávky (zrušený diktát)
/// jde jen `meta`.
public struct MultipartBody: Sendable {
  public let boundary: String
  public private(set) var data = Data()

  public init(boundary: String = "ZakazIQVoice-\(UUID().uuidString)") {
    self.boundary = boundary
  }

  public var contentType: String { "multipart/form-data; boundary=\(boundary)" }

  public mutating func addField(name: String, value: Data) {
    append("--\(boundary)\r\n")
    append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
    data.append(value)
    append("\r\n")
  }

  public mutating func addFile(name: String, filename: String, contentType: String, data file: Data) {
    append("--\(boundary)\r\n")
    append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n")
    append("Content-Type: \(contentType)\r\n\r\n")
    data.append(file)
    append("\r\n")
  }

  public mutating func finish() {
    append("--\(boundary)--\r\n")
  }

  private mutating func append(_ text: String) { data.append(Data(text.utf8)) }

  /// Tělo diktátu: `meta` a případně `audio`.
  public static func dictation(meta: DictationMeta, audio: Data?, boundary: String? = nil) throws -> MultipartBody {
    var body = boundary.map(MultipartBody.init(boundary:)) ?? MultipartBody()
    body.addField(name: "meta", value: try meta.json())
    if let audio {
      body.addFile(name: "audio", filename: "diktat.m4a", contentType: "audio/mp4", data: audio)
    }
    body.finish()
    return body
  }
}

/// Výsledek odeslání diktátu.
public enum DictateOutcome: Equatable, Sendable {
  case success(DictateResponse)
  /// `retryAfter` z hlavičky `Retry-After` (u 429), jinak `nil`.
  case failure(VoiceError, retryAfter: TimeInterval?)
}

extension VoiceClient {
  /// Nejvyšší velikost nahrávky (D-V11; server 4 MB).
  public static let maxAudioBytes = 4 * 1024 * 1024
  public static let dictateTimeout: TimeInterval = 30

  /// `POST /dictate`. Bez `audio` = zrušený diktát (jen statistika).
  public func dictate(meta: DictationMeta, audio: Data?) async -> DictateOutcome {
    if let audio, audio.count > Self.maxAudioBytes {
      return .failure(.server(code: "TOO_LARGE", status: 413), retryAfter: nil)
    }
    let body: MultipartBody
    do {
      body = try MultipartBody.dictation(meta: meta, audio: audio)
    } catch {
      return .failure(.server(code: "INVALID_META", status: 400), retryAfter: nil)
    }
    var request = Self.request(base: base, path: "dictate", key: key, method: "POST")
    request.timeoutInterval = Self.dictateTimeout
    request.setValue(body.contentType, forHTTPHeaderField: "Content-Type")
    request.httpBody = body.data
    do {
      let (data, response) = try await transport.send(request)
      switch Self.parse(DictateResponse.self, data: data, status: response.statusCode) {
      case .success(let value):
        return .success(value)
      case .failure(let error):
        return .failure(error, retryAfter: Self.retryAfter(response))
      }
    } catch {
      return .failure(VoiceError.from(error), retryAfter: nil)
    }
  }

  static func retryAfter(_ response: HTTPURLResponse) -> TimeInterval? {
    guard let raw = response.value(forHTTPHeaderField: "Retry-After"), let seconds = TimeInterval(raw.trimmingCharacters(in: .whitespaces)) else {
      return nil
    }
    return seconds
  }
}

/// Kdy zkusit diktát z fronty znovu (D-V10, VO06).
public enum RetryPolicy {
  /// Nahrávka čeká ve frontě nejvýš 24 h, pak se smaže (D-V7).
  public static let maxAge: TimeInterval = 24 * 3600

  /// 5, 10, 20, 40, 60, 60… s. `Retry-After` ze serveru má přednost (v mezích 5 s – 10 min).
  public static func delay(attempts: Int, retryAfter: TimeInterval? = nil) -> TimeInterval {
    if let retryAfter { return min(600, max(5, retryAfter)) }
    let exponent = max(0, attempts - 1)
    return min(60, 5 * pow(2, Double(min(exponent, 4))))
  }

  public static func isExpired(createdAt: Date, now: Date = Date()) -> Bool {
    now.timeIntervalSince(createdAt) >= maxAge
  }
}
