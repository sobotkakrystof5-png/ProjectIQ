import Foundation

/// Odpověď `GET /api/public/voice/config` (plán, oddíl 7; `app/api/public/voice/config/route.ts`).
/// Neznámé klíče se ignorují a nepovinné mají výchozí hodnotu, ať starší aplikace
/// nespadne, když server přidá pole.
public struct ConfigResponse: Decodable, Equatable, Sendable {
  public struct Device: Decodable, Equatable, Sendable {
    public let name: String
  }

  public struct Term: Decodable, Equatable, Sendable {
    public let id: String
    public let term: String
    public let heardAs: [String]

    enum CodingKeys: String, CodingKey { case id, term, heardAs }

    public init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      id = try c.decode(String.self, forKey: .id)
      term = try c.decode(String.self, forKey: .term)
      heardAs = try c.decodeIfPresent([String].self, forKey: .heardAs) ?? []
    }
  }

  public struct Snippet: Decodable, Equatable, Sendable {
    public let id: String
    public let trigger: String
    public let expansion: String
  }

  public struct Summary: Decodable, Equatable, Sendable {
    public let today: Int
    public let streak: Int

    public init(today: Int, streak: Int) {
      self.today = today
      self.streak = streak
    }
  }

  public let device: Device
  public let terms: [Term]
  public let snippets: [Snippet]
  public let cleanupEnabled: Bool
  /// `false` = na serveru chybí klíč k přepisu řeči; připojení funguje, diktovat ještě nepůjde.
  public let transcriptionReady: Bool
  public let summary: Summary

  enum CodingKeys: String, CodingKey {
    case ok, device, terms, snippets, cleanupEnabled, transcriptionReady, summary
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    guard try c.decodeIfPresent(Bool.self, forKey: .ok) == true else {
      throw DecodingError.dataCorruptedError(forKey: .ok, in: c, debugDescription: "ok není true")
    }
    device = try c.decode(Device.self, forKey: .device)
    terms = try c.decodeIfPresent([Term].self, forKey: .terms) ?? []
    snippets = try c.decodeIfPresent([Snippet].self, forKey: .snippets) ?? []
    cleanupEnabled = try c.decodeIfPresent(Bool.self, forKey: .cleanupEnabled) ?? true
    transcriptionReady = try c.decodeIfPresent(Bool.self, forKey: .transcriptionReady) ?? true
    summary = try c.decodeIfPresent(Summary.self, forKey: .summary) ?? Summary(today: 0, streak: 0)
  }
}

/// Chybová odpověď serveru `{ ok: false, code }`.
struct FailureBody: Decodable {
  let ok: Bool
  let code: String
}
