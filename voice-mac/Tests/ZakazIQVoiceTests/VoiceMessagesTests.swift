import Testing
@testable import ZakazIQVoiceCore

@Suite("České hlášky")
struct VoiceMessagesTests {
  @Test("kódy serveru mají vlastní hlášku")
  func serverCodes() {
    #expect(VoiceMessages.text(for: .server(code: "UNAUTHORIZED", status: 401))
      == "Klíč neplatí nebo byl zrušený. Vytvořte nový v adminu a vložte ho sem.")
    #expect(VoiceMessages.text(for: .server(code: "RATE_LIMITED", status: 429))
      == "Příliš mnoho pokusů za sebou. Zkuste to za pár minut znovu.")
    #expect(VoiceMessages.text(for: .server(code: "NOT_CONFIGURED", status: 503))
      == "Server ještě není na diktování připravený. Chybí mu nastavení nebo databáze.")
    #expect(VoiceMessages.text(for: .server(code: "ORIGIN_NOT_ALLOWED", status: 403))
      == "Server požadavek odmítl. Aktualizujte aplikaci ZakazIQ Voice.")
  }

  @Test("neznámý kód podle stavu: 5xx = server, 4xx = adresa a klíč")
  func unknownCodes() {
    #expect(VoiceMessages.text(for: .server(code: "INTERNAL", status: 500))
      == "Server teď neodpovídá správně. Zkuste to za chvíli znovu.")
    #expect(VoiceMessages.text(for: .server(code: "NECO_NOVEHO", status: 400))
      == "Server požadavek nepřijal. Zkontrolujte adresu a klíč.")
  }

  @Test("hláška nikdy neukáže kód chyby", arguments: [
    "UNAUTHORIZED", "ORIGIN_NOT_ALLOWED", "TOO_LARGE", "UNSUPPORTED_TYPE", "INVALID_META",
    "RATE_LIMITED", "NOT_CONFIGURED", "STT_FAILED", "INTERNAL", "NECO_NOVEHO",
  ])
  func noCodeInText(code: String) {
    for status in [400, 401, 403, 413, 415, 429, 500, 502, 503] {
      let text = VoiceMessages.text(for: .server(code: code, status: status))
      #expect(!text.contains(code))
      #expect(!text.contains(String(status)))
    }
  }

  @Test("každá chyba má větu s radou, co dál")
  func everyErrorHasText() {
    let all: [VoiceError] = [
      .noKey, .invalidKey, .invalidAddress(.empty), .invalidAddress(.invalid), .invalidAddress(.insecure),
      .invalidAddress(.hasPath), .unexpectedResponse(status: 404), .redirected, .offline, .cannotConnect,
      .timedOut, .insecureConnection, .network,
    ]
    for error in all {
      let text = VoiceMessages.text(for: error)
      #expect(text.hasSuffix("."))
      #expect(text.count < 140)
      #expect(!text.lowercased().contains("error"))
    }
  }

  @Test("úspěch ukáže název zařízení")
  func connected() {
    #expect(VoiceMessages.connected(to: "MacBook") == "Připojeno k zařízení MacBook")
  }

  @Test("znovu se zkouší jen síť, 502 a 429")
  func retryable() {
    #expect(VoiceError.offline.isRetryable)
    #expect(VoiceError.timedOut.isRetryable)
    #expect(VoiceError.server(code: "STT_FAILED", status: 502).isRetryable)
    #expect(VoiceError.server(code: "RATE_LIMITED", status: 429).isRetryable)
    #expect(!VoiceError.server(code: "UNAUTHORIZED", status: 401).isRetryable)
    #expect(!VoiceError.redirected.isRetryable)
    #expect(!VoiceError.insecureConnection.isRetryable)
  }
}
