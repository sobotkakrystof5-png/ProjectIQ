import Foundation

/// Proč adresa neprošla. Text pro člověka skládá `VoiceMessages`.
public enum ServerAddressError: Error, Equatable, Sendable {
  case empty
  case invalid
  /// `http://` mimo localhost — klíč by šel po síti nešifrovaně.
  case insecure
  /// Adresa s cestou, dotazem nebo přihlašovacími údaji. Stačí schéma, host a port.
  case hasPath
}

/// Adresa serveru ZakazIQ (plán, oddíl 7).
///
/// - Vždy `https://`, výjimka jen `localhost` / `127.0.0.1` / `::1` při vývoji.
/// - Apex `zakaziq.cz` se přepíše na `www.zakaziq.cz`: apex přesměrovává (308)
///   a při přesměrování by se hlavička s klíčem ztratila (poučení z R-136).
/// - Ukládá se jen základ (schéma + host + port), cesty skládá `VoiceClient`.
public enum ServerAddress {
  public static let production = URL(string: "https://www.zakaziq.cz")!
  public static let development = URL(string: "http://localhost:3000")!

  static let localHosts: Set<String> = ["localhost", "127.0.0.1", "::1", "[::1]"]
  static let apexHost = "zakaziq.cz"
  static let wwwHost = "www.zakaziq.cz"

  public static func isLocal(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    return localHosts.contains(host)
  }

  public static func normalize(_ raw: String) -> Result<URL, ServerAddressError> {
    var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return .failure(.empty) }

    if !text.contains("://") {
      // Bez schématu: localhost jede při vývoji po http, všechno ostatní po https.
      let hostPart = text.split(separator: "/", maxSplits: 1).first.map(String.init) ?? text
      let bareHost = hostPart.split(separator: ":").first.map { $0.lowercased() } ?? ""
      text = (localHosts.contains(bareHost) ? "http://" : "https://") + text
    }

    guard var parts = URLComponents(string: text),
          let scheme = parts.scheme?.lowercased(),
          let host = parts.host?.lowercased(),
          !host.isEmpty,
          !host.contains(" ")
    else { return .failure(.invalid) }

    if parts.user != nil || parts.password != nil || parts.query != nil || parts.fragment != nil {
      return .failure(.hasPath)
    }
    guard parts.path.isEmpty || parts.path == "/" else { return .failure(.hasPath) }

    let local = localHosts.contains(host)
    switch scheme {
    case "https":
      break
    case "http":
      guard local else { return .failure(.insecure) }
    default:
      return .failure(.invalid)
    }

    parts.scheme = scheme
    parts.host = host == apexHost ? wwwHost : host
    parts.path = ""
    if scheme == "https", parts.port == 443 { parts.port = nil }
    if scheme == "http", parts.port == 80 { parts.port = nil }

    guard let url = parts.url else { return .failure(.invalid) }
    return .success(url)
  }

  /// Text do pole v Nastavení — bez lomítka na konci.
  public static func display(_ url: URL) -> String {
    var text = url.absoluteString
    while text.hasSuffix("/") { text.removeLast() }
    return text
  }
}
