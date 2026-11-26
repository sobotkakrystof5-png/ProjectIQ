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
}
