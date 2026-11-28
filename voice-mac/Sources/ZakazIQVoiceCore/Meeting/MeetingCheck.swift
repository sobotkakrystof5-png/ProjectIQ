import Foundation

/// Kam jde zvuk z Macu během schůzky. Bez sluchátek slyší mikrofon i druhou stranu
/// z reproduktorů; server tu ozvěnu z přepisu vynechá, se sluchátky je ale přepis přesnější.
public enum OutputRoute: String, Codable, Equatable, Sendable {
  case headphones
  case speakers
  case unknown

  /// Čtyřznakový kód Core Audio („bltn", „ispk") jako číslo.
  public static func fourCC(_ code: String) -> UInt32 {
    code.utf8.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
  }

  /// `transport` = `kAudioDevicePropertyTransportType`, `dataSource` = `kAudioDevicePropertyDataSource`
  /// výstupu (má ho jen vestavěný zvuk: reproduktory „ispk", sluchátka v konektoru „hdpn").
  /// Bluetooth se bere jako sluchátka (AirPods); reproduktor přes Bluetooth to nepozná.
  public static func classify(transport: UInt32, dataSource: UInt32?) -> OutputRoute {
    switch transport {
    case fourCC("bltn"):
      if dataSource == fourCC("hdpn") { return .headphones }
      if dataSource == fourCC("ispk") { return .speakers }
      return .unknown
    case fourCC("blue"), fourCC("blea"):
      return .headphones
    case fourCC("hdmi"), fourCC("dprt"), fourCC("airp"):
      return .speakers
    default:
      return .unknown
    }
  }
}

/// Hlídá během schůzky, jestli zvuk počítače (druhá strana) vůbec něco přináší. Bez povolení
/// Nahrávání zvuku systému dává tap jen ticho a přepis by měl jen jednu stranu. Upozorní nejvýš
/// jednou: až po 90 s a až když jste sami mluvili aspoň 10 s (jinak hovor nejspíš ještě nezačal).
public struct OtherSideWatch: Equatable, Sendable {
  public static let minElapsed: TimeInterval = 90
  public static let minMySpeechMs = 10_000

  public private(set) var heard = false
  public private(set) var mySpeechMs = 0
  public private(set) var warned = false

  public init() {}

  /// Hlasitost zvuku počítače 0…1 (`SpeechMeter.normalized`, nad nulou = nad −50 dB).
  public mutating func otherLevel(_ normalized: Double) {
    if normalized > 0 { heard = true }
  }

  public mutating func myTurn(speechMs: Int) {
    mySpeechMs += max(0, speechMs)
  }

  /// Je čas upozornit, že druhou stranu neslyšíme? `true` vrátí jen jednou za schůzku.
  public mutating func shouldWarn(elapsed: TimeInterval) -> Bool {
    guard !warned, !heard, elapsed >= Self.minElapsed, mySpeechMs >= Self.minMySpeechMs else { return false }
    warned = true
    return true
  }
}

/// Co si Mac pamatuje o schůzce, kterou nahrál (server to neví): výstup a jestli zvuk
/// počítače něco přinesl. Jen tohle, žádný text.
public struct MeetingRecordingNote: Codable, Equatable, Sendable {
  public let route: OutputRoute
  public let otherHeard: Bool

  public init(route: OutputRoute, otherHeard: Bool) {
    self.route = route
    self.otherHeard = otherHeard
  }
}

/// Kontrola po schůzce: slyšela aplikace obě strany, hrálo to ze sluchátek, chybí část přepisu?
public struct MeetingCheck: Equatable, Sendable {
  public enum Tone: Equatable, Sendable {
    case ok
    case notice
    case problem
  }

  public enum Action: Equatable, Sendable {
    case openSystemAudioSettings
    case openMicrophoneSettings

    public var title: String { "Otevřít Nastavení" }
  }

  public struct Item: Equatable, Sendable, Identifiable {
    public let id: String
    public let tone: Tone
    public let title: String
    public let detail: String?
    public let action: Action?
  }

  public let items: [Item]

  public var hasProblem: Bool { items.contains { $0.tone == .problem } }

  /// `exact = false`: počty jsou jen odstavce přepisu (starší server), čísla se neukazují.
  /// `note` zná jen Mac, který schůzku nahrál.
  public static func evaluate(
    meTurns: Int,
    otherTurns: Int,
    echoTurns: Int,
    failedTurns: Int,
    exact: Bool = true,
    note: MeetingRecordingNote? = nil
  ) -> MeetingCheck {
    var items: [Item] = []

    if meTurns > 0 {
      items.append(Item(id: "me", tone: .ok, title: exact ? "Váš hlas: \(turns(meTurns))" : "Váš hlas je v přepisu", detail: nil, action: nil))
    } else {
      items.append(Item(
        id: "me", tone: .problem, title: "Váš hlas v přepisu chybí",
        detail: "Mikrofon nic nezachytil. Zkontrolujte, který mikrofon je vybraný, a že ho ZakazIQ Voice smí používat.",
        action: .openMicrophoneSettings
      ))
    }

    if otherTurns > 0 {
      items.append(Item(id: "other", tone: .ok, title: exact ? "Druhá strana: \(turns(otherTurns))" : "Druhá strana je v přepisu", detail: nil, action: nil))
    } else if note?.otherHeard == true {
      items.append(Item(
        id: "other", tone: .problem, title: "Druhá strana v přepisu chybí",
        detail: "Zvuk počítače hrál, ale řeč jsem v něm nenašel. Mluvila druhá strana přes tento Mac?",
        action: nil
      ))
    } else {
      let detail = note == nil
        ? "Zkontrolujte, že má ZakazIQ Voice povolené nahrávání zvuku systému a že hovor hraje přes tento Mac."
        : "Zvuk počítače byl celou dobu potichu. Povolte ZakazIQ Voice nahrávání zvuku systému a hovor pusťte přes tento Mac."
      items.append(Item(id: "other", tone: .problem, title: "Druhá strana v přepisu chybí", detail: detail, action: .openSystemAudioSettings))
    }

    switch note?.route {
    case .speakers:
      let detail = echoTurns > 0
        ? "Mikrofon zachytil i druhou stranu z reproduktorů, \(turns(echoTurns, accusative: true)) jsem z přepisu vynechal. Se sluchátky bude přepis přesnější."
        : "Hrálo to z reproduktorů. Ozvěnu z přepisu vynechávám, se sluchátky bude přepis přesnější."
      items.append(Item(id: "route", tone: .notice, title: "Bez sluchátek", detail: detail, action: nil))
    case .headphones:
      items.append(Item(id: "route", tone: .ok, title: "Se sluchátky", detail: nil, action: nil))
    case .unknown, .none:
      if echoTurns > 0 {
        items.append(Item(
          id: "route", tone: .notice, title: "Ozvěna vynechaná",
          detail: "Mikrofon zachytil i druhou stranu z reproduktorů, \(turns(echoTurns, accusative: true)) jsem z přepisu vynechal.",
          action: nil
        ))
      }
    }

    if failedTurns > 0 {
      items.append(Item(
        id: "failed", tone: .notice, title: "Část přepisu chybí",
        detail: "\(turns(failedTurns, accusative: true)) se nepodařilo přepsat.",
        action: nil
      ))
    }
    return MeetingCheck(items: items)
  }

  /// „1 promluva", „3 promluvy", „5 promluv" (ve 4. pádě „1 promluvu").
  public static func turns(_ n: Int, accusative: Bool = false) -> String {
    let word: String
    switch n {
    case 1: word = accusative ? "promluvu" : "promluva"
    case 2...4: word = "promluvy"
    default: word = "promluv"
    }
    return "\(n) \(word)"
  }
}
