import Foundation

/// Údaje o jedné promluvě pro `POST /meetings/<id>/turns` (pole `meta`).
public struct MeetingTurnMeta: Codable, Equatable, Sendable {
  public var track: MeetingTrack
  public var idx: Int
  public var startMs: Int
  public var durationMs: Int
  public var speechMs: Int?

  public init(track: MeetingTrack, idx: Int, startMs: Int, durationMs: Int, speechMs: Int?) {
    self.track = track
    self.idx = idx
    self.startMs = max(0, min(7_500_000, startMs))
    self.durationMs = max(1, min(120_000, durationMs))
    self.speechMs = speechMs.map { max(0, min(120_000, $0)) }
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(track, forKey: .track)
    try c.encode(idx, forKey: .idx)
    try c.encode(startMs, forKey: .startMs)
    try c.encode(durationMs, forKey: .durationMs)
    try c.encode(speechMs, forKey: .speechMs)
  }

  public func json() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(self)
  }
}

public struct MeetingSummaryDTO: Decodable, Equatable, Sendable {
  public let title: String
  public let summary: String
  public let agreements: [String]
  public let mySteps: [String]
  public let clientSteps: [String]
  public let openQuestions: [String]
  public let internalNotes: [String]
}

public struct MeetingBlockDTO: Decodable, Equatable, Sendable, Identifiable {
  public let speaker: MeetingTrack
  public let label: String
  public let startMs: Int
  public let text: String

  public var id: String { "\(startMs)-\(speaker.rawValue)" }
}

public struct MeetingListItemDTO: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let title: String?
  public let startedAt: String
  public let durationMs: Int?
  public let status: String
  public let contactName: String?
  public let hasSummary: Bool
  public let turns: Int
}

/// Kontrola po schůzce ze serveru: promluvy s textem obou stran a ozvěna vynechaná z přepisu.
public struct MeetingCheckDTO: Decodable, Equatable, Sendable {
  public let meTurns: Int
  public let otherTurns: Int
  public let echoTurns: Int
}

/// Kontakt k přiřazení schůzky (jen jméno a firma).
public struct MeetingContactDTO: Decodable, Equatable, Sendable, Identifiable, Hashable {
  public let id: String
  public let name: String
  public let company: String?
}

public struct MeetingContactsDTO: Decodable, Equatable, Sendable {
  public let suggested: [MeetingContactDTO]
  public let results: [MeetingContactDTO]
}

public struct MeetingDetailDTO: Decodable, Equatable, Sendable, Identifiable {
  public let id: String
  public let title: String?
  public let startedAt: String
  public let durationMs: Int?
  public let status: String
  public let appName: String?
  public let contactId: String?
  public let contactName: String?
  public let words: Int
  public let blocks: [MeetingBlockDTO]
  public let transcript: String
  public let summary: MeetingSummaryDTO?
  public let summaryText: String?
  public let failedTurns: Int
  /// Starší server ho neposílá.
  public let check: MeetingCheckDTO?

  /// Kontrola obou stran. Bez `check` ze serveru se počítá z odstavců přepisu (bez čísel).
  public func evaluateCheck(note: MeetingRecordingNote?) -> MeetingCheck {
    if let check {
      return MeetingCheck.evaluate(
        meTurns: check.meTurns, otherTurns: check.otherTurns, echoTurns: check.echoTurns,
        failedTurns: failedTurns, note: note
      )
    }
    return MeetingCheck.evaluate(
      meTurns: blocks.filter { $0.speaker == .me }.count,
      otherTurns: blocks.filter { $0.speaker == .other }.count,
      echoTurns: 0, failedTurns: failedTurns, exact: false, note: note
    )
  }
}

struct MeetingEnvelope: Decodable { let meeting: MeetingDetailDTO }
struct MeetingListEnvelope: Decodable { let meetings: [MeetingListItemDTO] }
struct TurnResult: Decodable { let status: String }

/// Datum ze serveru (ISO s milisekundami i bez nich).
public enum MeetingDates {
  public static func parse(_ raw: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = f.date(from: raw) { return date }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: raw)
  }

  /// Čas od začátku schůzky: „3:07", nad hodinu „1:03:07".
  public static func offset(_ ms: Int) -> String {
    let total = max(0, ms / 1000)
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? "\(h):" + String(format: "%02d:%02d", m, s) : "\(m):" + String(format: "%02d", s)
  }

  /// Délka schůzky: „45 min", „1 h 12 min".
  public static func duration(_ ms: Int?) -> String {
    guard let ms else { return "probíhá" }
    let minutes = max(1, Int((Double(ms) / 60_000).rounded()))
    return minutes < 60 ? "\(minutes) min" : "\(minutes / 60) h \(minutes % 60) min"
  }
}

extension VoiceAPI {
  public static let turnTimeout: TimeInterval = 60
  public static let summaryTimeout: TimeInterval = 300

  public func createMeeting(id: UUID, startedAt: Date, appBundleId: String?, appName: String?) async -> Result<Void, VoiceError> {
    struct App: Encodable { let bundleId: String?; let name: String? }
    struct Body: Encodable { let id: String; let startedAt: String; let app: App }
    var request = VoiceClient.request(base: base, path: "meetings", key: key, method: "POST")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let app = App(bundleId: appBundleId.map { String($0.prefix(200)) }, name: appName.map { String($0.prefix(120)) })
    request.httpBody = try? JSONEncoder().encode(Body(id: id.uuidString.lowercased(), startedAt: DictationMeta.isoString(startedAt), app: app))
    return await send(request, as: OkBody.self).map { _ in () }
  }

  /// Jedna promluva (multipart `meta` + `audio`). Vrací stav přepisu (`ok`, `empty`, `blocked`).
  public func sendTurn(meetingId: UUID, meta: MeetingTurnMeta, audio: Data) async -> Result<String, VoiceError> {
    var body = MultipartBody()
    guard let metaJSON = try? meta.json() else { return .failure(.server(code: "INVALID_META", status: 400)) }
    body.addField(name: "meta", value: metaJSON)
    body.addFile(name: "audio", filename: "promluva.m4a", contentType: "audio/mp4", data: audio)
    body.finish()
    var request = VoiceClient.request(base: base, path: "meetings/\(meetingId.uuidString.lowercased())/turns", key: key, method: "POST")
    request.timeoutInterval = Self.turnTimeout
    request.setValue(body.contentType, forHTTPHeaderField: "Content-Type")
    request.httpBody = body.data
    return await send(request, as: TurnResult.self).map(\.status)
  }

  public func finishMeeting(id: UUID, endedAt: Date, durationMs: Int) async -> Result<MeetingDetailDTO, VoiceError> {
    struct Body: Encodable { let endedAt: String; let durationMs: Int }
    var request = VoiceClient.request(base: base, path: "meetings/\(id.uuidString.lowercased())/finish", key: key, method: "POST")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONEncoder().encode(Body(endedAt: DictationMeta.isoString(endedAt), durationMs: max(0, min(7_500_000, durationMs))))
    return await send(request, as: MeetingEnvelope.self).map(\.meeting)
  }

  public func meetings() async -> Result<[MeetingListItemDTO], VoiceError> {
    await send(VoiceClient.request(base: base, path: "meetings", key: key), as: MeetingListEnvelope.self).map(\.meetings)
  }

  public func meeting(id: String) async -> Result<MeetingDetailDTO, VoiceError> {
    await send(VoiceClient.request(base: base, path: "meetings/\(id)", key: key), as: MeetingEnvelope.self).map(\.meeting)
  }

  public func summarizeMeeting(id: String) async -> Result<MeetingDetailDTO, VoiceError> {
    var request = VoiceClient.request(base: base, path: "meetings/\(id)/summary", key: key, method: "POST")
    request.timeoutInterval = Self.summaryTimeout
    return await send(request, as: MeetingEnvelope.self).map(\.meeting)
  }

  /// Návrh kontaktu z kalendáře a s `query` (aspoň 2 znaky) i výsledky hledání.
  public func meetingContacts(id: String, query: String) async -> Result<MeetingContactsDTO, VoiceError> {
    var request = VoiceClient.request(base: base, path: "meetings/\(id)/contacts", key: key)
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { request.url = Self.withQuery(request.url!, ["q": String(trimmed.prefix(80))]) }
    return await send(request, as: MeetingContactsDTO.self)
  }

  /// Přiřadí schůzku ke kontaktu, `nil` ji odpojí. Vrátí schůzku s novým jménem druhé strany.
  public func setMeetingContact(id: String, contactId: String?) async -> Result<MeetingDetailDTO, VoiceError> {
    struct Body: Encodable {
      let contactId: String?
      func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(contactId, forKey: .contactId)
      }
      enum CodingKeys: String, CodingKey { case contactId }
    }
    var request = VoiceClient.request(base: base, path: "meetings/\(id)", key: key, method: "PATCH")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONEncoder().encode(Body(contactId: contactId))
    return await send(request, as: MeetingEnvelope.self).map(\.meeting)
  }

  public func deleteMeeting(id: String) async -> Result<Void, VoiceError> {
    await send(VoiceClient.request(base: base, path: "meetings/\(id)", key: key, method: "DELETE"), as: OkBody.self).map { _ in () }
  }
}
