import Foundation

/// Volby v `UserDefaults`. Nikdy sem nepatří klíč zařízení ani text diktátu.
public struct Preferences: @unchecked Sendable {
  static let serverKey = "serverAddress"

  private let defaults: UserDefaults

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  /// Uložená adresa, prošlá znovu kontrolou (kdyby ji někdo přepsal ručně `defaults write`).
  public var serverAddress: URL {
    guard let raw = defaults.string(forKey: Self.serverKey),
          case .success(let url) = ServerAddress.normalize(raw)
    else { return ServerAddress.production }
    return url
  }

  /// Uloží adresu, když projde kontrolou; vrátí, jak se uložila.
  @discardableResult
  public func setServerAddress(_ raw: String) -> Result<URL, ServerAddressError> {
    let result = ServerAddress.normalize(raw)
    if case .success(let url) = result {
      defaults.set(ServerAddress.display(url), forKey: Self.serverKey)
    }
    return result
  }

  // MARK: Diktování (VO04–VO06)

  static let shortcutKey = "shortcut"
  static let showBarWhenIdleKey = "showBarWhenIdle"
  static let soundsKey = "sounds"
  static let historyDaysKey = "historyDays"

  /// Výchozí počet dní, které drží místní historie (VO06).
  public static let defaultHistoryDays = 90

  public var shortcut: DictationShortcut {
    get { defaults.string(forKey: Self.shortcutKey).flatMap(DictationShortcut.init(rawValue:)) ?? .fn }
    nonmutating set { defaults.set(newValue.rawValue, forKey: Self.shortcutKey) }
  }

  /// Ukazovat lištu i v klidu (výchozí ano). Když ne, objeví se jen při diktátu.
  public var showBarWhenIdle: Bool {
    get { defaults.object(forKey: Self.showBarWhenIdleKey) as? Bool ?? true }
    nonmutating set { defaults.set(newValue, forKey: Self.showBarWhenIdleKey) }
  }

  /// Zvuk při začátku a konci diktátu (výchozí vypnuto).
  public var sounds: Bool {
    get { defaults.bool(forKey: Self.soundsKey) }
    nonmutating set { defaults.set(newValue, forKey: Self.soundsKey) }
  }

  /// Kolik dní drží místní historie diktátů (7–365).
  public var historyDays: Int {
    get {
      let value = defaults.integer(forKey: Self.historyDaysKey)
      return value == 0 ? Self.defaultHistoryDays : min(365, max(7, value))
    }
    nonmutating set { defaults.set(min(365, max(7, newValue)), forKey: Self.historyDaysKey) }
  }

  static let afterDictationKey = "afterDictation"

  /// Co udělat s přepisem. Výchozí je ukázat ho ke zkopírování (Kryštof 2026-11-27: přepis
  /// si zkontroluje a vloží do Claude Code sám).
  public var afterDictation: AfterDictation {
    get { defaults.string(forKey: Self.afterDictationKey).flatMap(AfterDictation.init(rawValue:)) ?? .showText }
    nonmutating set { defaults.set(newValue.rawValue, forKey: Self.afterDictationKey) }
  }

  static let watchCallsKey = "watchCalls"

  /// Když začne hovor (Meet, Teams, Zoom, WhatsApp…), nabídnout nahrání schůzky a po jeho
  /// konci ukončení (R-152). Výchozí ano.
  public var watchCalls: Bool {
    get { defaults.object(forKey: Self.watchCallsKey) as? Bool ?? true }
    nonmutating set { defaults.set(newValue, forKey: Self.watchCallsKey) }
  }

  static let learnFromEditsKey = "learnFromEdits"

  /// Posílat serveru opravy vloženého textu, aby se učil (VO09, D-V8). Výchozí ano.
  public var learnFromEdits: Bool {
    get { defaults.object(forKey: Self.learnFromEditsKey) as? Bool ?? true }
    nonmutating set { defaults.set(newValue, forKey: Self.learnFromEditsKey) }
  }

  // MARK: Schůzky — kontrola (průvodce první schůzkou)

  static let systemAudioCheckKey = "systemAudioCheck"
  static let meetingNotesKey = "meetingNotes"
  /// Kolik schůzek si Mac pamatuje (výstup a jestli slyšel zvuk počítače).
  public static let meetingNotesLimit = 30

  /// Poslední zjištění o nahrávání zvuku systému: přinesl tap při schůzce zvuk, nebo jen ticho?
  /// `nil` = zatím žádná schůzka (macOS se zeptá při první).
  public var systemAudioCheck: SystemAudioCheck? {
    get { defaults.data(forKey: Self.systemAudioCheckKey).flatMap { try? JSONDecoder().decode(SystemAudioCheck.self, from: $0) } }
    nonmutating set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: Self.systemAudioCheckKey) }
  }

  public func meetingNote(id: String) -> MeetingRecordingNote? {
    meetingNotes().first { $0.id == id }?.note
  }

  public func setMeetingNote(_ note: MeetingRecordingNote, id: String) {
    var notes = meetingNotes().filter { $0.id != id }
    notes.insert(StoredMeetingNote(id: id, note: note), at: 0)
    let limited = Array(notes.prefix(Self.meetingNotesLimit))
    defaults.set(try? JSONEncoder().encode(limited), forKey: Self.meetingNotesKey)
  }

  private func meetingNotes() -> [StoredMeetingNote] {
    defaults.data(forKey: Self.meetingNotesKey).flatMap { try? JSONDecoder().decode([StoredMeetingNote].self, from: $0) } ?? []
  }
}

private struct StoredMeetingNote: Codable {
  let id: String
  let note: MeetingRecordingNote
}

/// Výsledek poslední schůzky pro řádek „Nahrávání zvuku systému" v Nastavení.
public struct SystemAudioCheck: Codable, Equatable, Sendable {
  public let heard: Bool
  public let at: Date

  public init(heard: Bool, at: Date) {
    self.heard = heard
    self.at = at
  }
}
