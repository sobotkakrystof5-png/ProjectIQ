import Foundation

/// Aplikace, ve které může běžet hovor s druhou stranou (R-152).
public struct CallApp: Equatable, Hashable, Sendable {
  /// Bundle id hlavní aplikace (pomocné procesy prohlížeče se převedou na ni).
  public let bundleId: String
  public let name: String
  /// Prohlížeč: hovor v něm může, ale nemusí být; službu se pozná z názvu okna.
  public let isBrowser: Bool

  public init(bundleId: String, name: String, isBrowser: Bool) {
    self.bundleId = bundleId
    self.name = name
    self.isBrowser = isBrowser
  }
}

/// Hovor, který právě bere zvuk z mikrofonu.
public struct DetectedCall: Equatable, Sendable {
  public let app: CallApp
  /// Služba poznaná z názvu okna prohlížeče („Google Meet"), u aplikací nic.
  public var service: String?

  public init(app: CallApp, service: String? = nil) {
    self.app = app
    self.service = service
  }

  /// Co ukázat v nabídce: „Google Meet", „Zoom", u prohlížeče bez poznané služby „Chrome".
  public var label: String { service ?? app.name }
}

/// Které aplikace jsou na hovory a jak poznat službu v prohlížeči.
public enum CallCatalog {
  /// Aplikace na hovory (bundle id → název).
  static let apps: [String: String] = [
    "us.zoom.xos": "Zoom",
    "com.microsoft.teams2": "Microsoft Teams",
    "com.microsoft.teams": "Microsoft Teams",
    "net.whatsapp.WhatsApp": "WhatsApp",
    "desktop.WhatsApp": "WhatsApp",
    "com.apple.FaceTime": "FaceTime",
    // Zvuk FaceTime (i hovoru z iPhonu přes Mac) bere systémová služba, ne aplikace.
    "com.apple.avconferenced": "FaceTime nebo telefon",
    "com.tinyspeck.slackmacgap": "Slack",
    "com.hnc.Discord": "Discord",
    "com.cisco.webexmeetingsapp": "Webex",
    "Cisco-Systems.Spark": "Webex",
    "ru.keepcoder.Telegram": "Telegram",
    "org.telegram.desktop": "Telegram",
    "com.viber.osx": "Viber",
    "com.skype.skype": "Skype",
  ]

  /// Prohlížeče (bundle id → název).
  static let browsers: [String: String] = [
    "com.google.Chrome": "Chrome",
    "com.google.Chrome.beta": "Chrome",
    "com.google.Chrome.canary": "Chrome",
    "com.apple.Safari": "Safari",
    "company.thebrowser.Browser": "Arc",
    "company.thebrowser.dia": "Dia",
    "com.microsoft.edgemac": "Edge",
    "com.brave.Browser": "Brave",
    "org.mozilla.firefox": "Firefox",
    "com.operasoftware.Opera": "Opera",
    "com.vivaldi.Vivaldi": "Vivaldi",
    "app.zen-browser.zen": "Zen",
  ]

  /// Pomocné procesy, které mikrofon berou za hlavní aplikaci.
  static let aliases: [String: String] = [
    // Safari nahrává ve sdíleném procesu WebKitu.
    "com.apple.WebKit.GPU": "com.apple.Safari",
    "org.mozilla.plugincontainer": "org.mozilla.firefox",
  ]

  /// Bundle id procesu bez části pomocného procesu: `com.google.Chrome.helper` → `com.google.Chrome`.
  public static func mainBundleId(_ bundleId: String) -> String {
    if let alias = aliases[bundleId] { return alias }
    let parts = bundleId.split(separator: ".", omittingEmptySubsequences: false)
    guard let cut = parts.firstIndex(where: { $0.lowercased().hasPrefix("helper") }), cut > 0 else { return bundleId }
    return parts[..<cut].joined(separator: ".")
  }

  /// Aplikace na hovory pro proces, který bere zvuk z mikrofonu; jinak nic.
  public static func app(forProcess bundleId: String) -> CallApp? {
    let id = mainBundleId(bundleId)
    if let name = apps[id] { return CallApp(bundleId: id, name: name, isBrowser: false) }
    if let name = browsers[id] { return CallApp(bundleId: id, name: name, isBrowser: true) }
    return nil
  }

  /// Služba hovoru podle názvu okna prohlížeče (název okna = otevřená karta).
  public static func service(inTitle title: String) -> String? {
    let t = title.lowercased()
    if t.hasPrefix("meet ") || t.hasPrefix("meet:") || t.hasPrefix("meet –") || t.contains("google meet") || t.contains("meet.google.com") {
      return "Google Meet"
    }
    if t.contains("microsoft teams") || t.contains("| teams") { return "Microsoft Teams" }
    if t.hasPrefix("zoom") || t.contains("zoom meeting") || t.contains("zoom workplace") { return "Zoom" }
    if t.contains("webex") { return "Webex" }
    if t.contains("whereby") { return "Whereby" }
    if t.contains("jitsi") { return "Jitsi Meet" }
    if t.contains("whatsapp") { return "WhatsApp" }
    if t.contains("discord") { return "Discord" }
    return nil
  }
}

/// Kdy nabídnout nahrání hovoru a kdy se zeptat, jestli skončil (R-152).
///
/// Dostává každé ~2 s seznam hovorových aplikací, které berou zvuk z mikrofonu (bez
/// ZakazIQ Voice). Hovor = aplikace drží mikrofon; krátký výpadek do `endAfter` je
/// pořád tentýž hovor. Každý hovor se nabídne jen jednou, „Teď ne" platí do jeho konce.
public struct CallDetector: Sendable {
  public enum Event: Equatable, Sendable {
    /// Nabídnout „Nahrát a přepsat schůzku?".
    case offerStart(DetectedCall)
    /// Nahrává se a hovor skončil: zeptat se, jestli nahrávání ukončit.
    case offerEnd(DetectedCall)
    /// Schovat nabídku, která právě visí.
    case withdraw
  }

  /// Jak dlouho musí aplikace držet mikrofon, než se nabídne (krátká zkouška zvuku ne).
  public static let startDelay: TimeInterval = 3
  /// Za jak dlouho po puštění mikrofonu zmizí nabídka nahrávání.
  public static let withdrawAfter: TimeInterval = 6
  /// Za jak dlouho po puštění mikrofonu hovor skončil.
  public static let endAfter: TimeInterval = 15

  enum Prompt: Equatable {
    case start(String)
    case end(String)
  }

  struct Track: Equatable {
    var call: DetectedCall
    var since: Date
    var lastSeen: Date
    var offered: Bool
  }

  struct Recording: Equatable {
    var call: DetectedCall?
    /// Na konec hovoru se už zeptalo (nebo „Nahrávat dál"); znovu až po návratu hovoru.
    var endAsked: Bool
  }

  private(set) var tracks: [String: Track] = [:]
  private(set) var prompt: Prompt?
  private(set) var recording: Recording?

  public init() {}

  /// Jedno kolo. `active` = hovory, které teď drží mikrofon. `canOffer` = nabídka je
  /// zapnutá a nic se nediktuje ani nenahrává.
  public mutating func update(active: [DetectedCall], now: Date, canOffer: Bool) -> [Event] {
    var events: [Event] = []
    var activeKeys = Set<String>()
    for call in active where !activeKeys.contains(call.app.bundleId) {
      let key = call.app.bundleId
      activeKeys.insert(key)
      if var track = tracks[key] {
        track.lastSeen = now
        if let service = call.service { track.call.service = service }
        tracks[key] = track
      } else {
        tracks[key] = Track(call: call, since: now, lastSeen: now, offered: false)
      }
    }

    // Nahrává se: hlídat, jestli hovor skončil.
    if var rec = recording {
      // Co běží během nahrávání, se po jeho konci znovu nenabízí.
      for key in activeKeys { tracks[key]?.offered = true }
      if rec.call == nil, let newest = tracks.values.filter({ activeKeys.contains($0.call.app.bundleId) }).max(by: { $0.since < $1.since }) {
        rec.call = newest.call
      }
      if let key = rec.call?.app.bundleId {
        if activeKeys.contains(key) {
          if let track = tracks[key] { rec.call = track.call }
          if prompt == .end(key) {
            prompt = nil
            events.append(.withdraw)
          }
          rec.endAsked = false
        } else if !rec.endAsked, let track = tracks[key], now.timeIntervalSince(track.lastSeen) >= Self.endAfter {
          rec.endAsked = true
          if prompt != nil { events.append(.withdraw) }
          prompt = .end(key)
          events.append(.offerEnd(track.call))
        }
      }
      recording = rec
    }

    // Hovory, které skončily.
    for (key, track) in tracks where !activeKeys.contains(key) && now.timeIntervalSince(track.lastSeen) >= Self.endAfter {
      tracks[key] = nil
    }

    // Nabídka nahrání.
    if case .start(let key) = prompt {
      if !canOffer {
        // Začal diktát nebo se nabídka vypnula: schovat a nabídnout znovu, až to půjde.
        prompt = nil
        tracks[key]?.offered = false
        events.append(.withdraw)
      } else if let track = tracks[key], !activeKeys.contains(key), now.timeIntervalSince(track.lastSeen) >= Self.withdrawAfter {
        prompt = nil
        events.append(.withdraw)
      } else if tracks[key] == nil {
        prompt = nil
        events.append(.withdraw)
      }
    }
    if canOffer, recording == nil, prompt == nil {
      let ready = tracks.values
        .filter { !$0.offered && activeKeys.contains($0.call.app.bundleId) && now.timeIntervalSince($0.since) >= Self.startDelay }
        .min { $0.since < $1.since }
      if let ready {
        let key = ready.call.app.bundleId
        tracks[key]?.offered = true
        prompt = .start(key)
        events.append(.offerStart(ready.call))
      }
    }
    return events
  }

  /// Začalo nahrávání schůzky (z nabídky s `call`, nebo ručně s `nil` = hovor, který zrovna běží).
  public mutating func recordingStarted(call: DetectedCall?, now: Date) -> [Event] {
    var events: [Event] = []
    if prompt != nil {
      prompt = nil
      events.append(.withdraw)
    }
    let running = call.flatMap { tracks[$0.app.bundleId]?.call }
      ?? call
      ?? tracks.values.filter { now.timeIntervalSince($0.lastSeen) < Self.withdrawAfter }.max { $0.since < $1.since }?.call
    if let key = running?.app.bundleId { tracks[key]?.offered = true }
    recording = Recording(call: running, endAsked: false)
    return events
  }

  /// Nahrávání skončilo (jakkoli).
  public mutating func recordingStopped() -> [Event] {
    recording = nil
    if case .end = prompt {
      prompt = nil
      return [.withdraw]
    }
    return []
  }

  /// „Teď ne" (nebo nabídka vypršela): tenhle hovor už nenabízet.
  public mutating func dismissOffer() {
    if case .start = prompt { prompt = nil }
  }

  /// „Nahrávat dál": na konec se znovu zeptá, až hovor zase začne a skončí.
  public mutating func keepRecording() {
    if case .end = prompt { prompt = nil }
  }
}
