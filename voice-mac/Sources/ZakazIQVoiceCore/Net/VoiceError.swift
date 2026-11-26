import Foundation

/// Co se může pokazit při spojení se serverem. Text pro člověka: `VoiceMessages.text(for:)`.
public enum VoiceError: Error, Equatable, Sendable {
  case noKey
  case invalidKey
  case invalidAddress(ServerAddressError)
  /// Server odpověděl `{ ok: false, code }`.
  case server(code: String, status: Int)
  /// Odpověď, která není z ZakazIQ (špatná adresa, stránka 404, HTML).
  case unexpectedResponse(status: Int)
  /// Server přesměroval. Přesměrování se nesleduje, klíč by mohl odejít jinam.
  case redirected
  case offline
  case cannotConnect
  case timedOut
  case insecureConnection
  case network

  /// Převod chyby z `URLSession`.
  public static func from(_ error: Error) -> VoiceError {
    guard let url = error as? URLError else { return .network }
    switch url.code {
    case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
      return .offline
    case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
      return .cannotConnect
    case .timedOut:
      return .timedOut
    case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
         .serverCertificateHasUnknownRoot, .serverCertificateNotYetValid, .clientCertificateRejected,
         .clientCertificateRequired, .appTransportSecurityRequiresSecureConnection:
      return .insecureConnection
    case .httpTooManyRedirects, .redirectToNonExistentLocation:
      return .redirected
    default:
      return .network
    }
  }

  /// Má smysl to zkusit znovu bez zásahu člověka? (Plán: jen síť, 502 a 429.)
  public var isRetryable: Bool {
    switch self {
    case .offline, .cannotConnect, .timedOut, .network: return true
    case .server(_, let status): return status == 502 || status == 429
    default: return false
    }
  }
}

/// České hlášky podle `zakaziq-ux-texty-cs`: co se stalo + co teď. Nikdy kód chyby.
public enum VoiceMessages {
  public static func connected(to device: String) -> String {
    "Připojeno k zařízení \(device)"
  }

  public static let transcriptionMissing =
    "Na serveru zatím chybí přepis řeči, diktovat ještě nepůjde."

  public static func text(for error: VoiceError) -> String {
    switch error {
    case .noKey:
      return "Nejdřív vložte klíč zařízení. Vytvoříte ho v adminu v části ZakazIQ Voice › Zařízení."
    case .invalidKey:
      return "Tohle není klíč zařízení. Zkopírujte ho z adminu celý, začíná zk_voice_."
    case .invalidAddress(let reason):
      return text(for: reason)
    case .server(let code, let status):
      return serverText(code: code, status: status)
    case .unexpectedResponse:
      return "Na téhle adrese ZakazIQ neodpovídá. Zkontrolujte adresu serveru."
    case .redirected:
      return "Server adresu přesměrovává. Zadejte ji přesně, třeba https://www.zakaziq.cz."
    case .offline:
      return "Mac není připojený k internetu. Připojte se a zkuste to znovu."
    case .cannotConnect:
      return "Server na téhle adrese neodpovídá. Zkontrolujte, že běží, a zkuste to znovu."
    case .timedOut:
      return "Server neodpověděl včas. Zkuste to znovu."
    case .insecureConnection:
      return "Zabezpečené spojení se nepodařilo navázat. Zkontrolujte adresu serveru."
    case .network:
      return "Spojení se serverem selhalo. Zkuste to znovu."
    }
  }

  public static func text(for error: ServerAddressError) -> String {
    switch error {
    case .empty:
      return "Vyplňte adresu serveru."
    case .invalid:
      return "Tahle adresa nevypadá správně. Zkuste třeba https://www.zakaziq.cz."
    case .insecure:
      return "Adresa musí začínat https://. Výjimka je jen localhost při vývoji."
    case .hasPath:
      return "Stačí adresa bez cesty, třeba https://www.zakaziq.cz."
    }
  }

  static func serverText(code: String, status: Int) -> String {
    switch code {
    case "UNAUTHORIZED":
      return "Klíč neplatí nebo byl zrušený. Vytvořte nový v adminu a vložte ho sem."
    case "RATE_LIMITED":
      return "Příliš mnoho pokusů za sebou. Zkuste to za pár minut znovu."
    case "NOT_CONFIGURED":
      return "Server ještě není na diktování připravený. Chybí mu nastavení nebo databáze."
    case "ORIGIN_NOT_ALLOWED":
      return "Server požadavek odmítl. Aktualizujte aplikaci ZakazIQ Voice."
    case "TOO_LARGE":
      return "Nahrávka je moc velká. Zkuste kratší diktát."
    case "STT_FAILED":
      return "Přepis řeči se teď nepovedl. Zkuste to za chvíli znovu."
    default:
      return status >= 500
        ? "Server teď neodpovídá správně. Zkuste to za chvíli znovu."
        : "Server požadavek nepřijal. Zkontrolujte adresu a klíč."
    }
  }
}
