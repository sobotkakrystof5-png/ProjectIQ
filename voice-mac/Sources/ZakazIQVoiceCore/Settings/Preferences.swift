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
}
