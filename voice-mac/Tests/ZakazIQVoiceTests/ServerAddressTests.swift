import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Adresa serveru")
struct ServerAddressTests {
  private func ok(_ raw: String) -> String? {
    guard case .success(let url) = ServerAddress.normalize(raw) else { return nil }
    return ServerAddress.display(url)
  }

  private func fails(_ raw: String) -> ServerAddressError? {
    guard case .failure(let reason) = ServerAddress.normalize(raw) else { return nil }
    return reason
  }

  @Test("apex zakaziq.cz se přepíše na www (přesměrování by ztratilo klíč)",
        arguments: ["https://zakaziq.cz", "zakaziq.cz", "https://ZAKAZIQ.cz/", "  https://zakaziq.cz  \n", "https://zakaziq.cz:443"])
  func apexToWww(raw: String) {
    #expect(ok(raw) == "https://www.zakaziq.cz")
  }

  @Test("www a jiné https adresy zůstanou")
  func httpsKept() {
    #expect(ok("https://www.zakaziq.cz") == "https://www.zakaziq.cz")
    #expect(ok("https://project-iq-git-x.vercel.app/") == "https://project-iq-git-x.vercel.app")
    #expect(ok("https://example.cz:8443") == "https://example.cz:8443")
  }

  @Test("http:// mimo localhost se odmítne",
        arguments: ["http://www.zakaziq.cz", "http://zakaziq.cz", "http://192.168.1.10:3000", "http://localhost.example.com"])
  func insecureRejected(raw: String) {
    #expect(fails(raw) == .insecure)
  }

  @Test("localhost smí po http, i bez schématu")
  func localhostAllowed() {
    #expect(ok("http://localhost:3000") == "http://localhost:3000")
    #expect(ok("localhost:3000") == "http://localhost:3000")
    #expect(ok("http://127.0.0.1:3000/") == "http://127.0.0.1:3000")
    #expect(ok("https://localhost:3000") == "https://localhost:3000")
  }

  @Test("cesta, dotaz a přihlašovací údaje se odmítnou",
        arguments: ["https://www.zakaziq.cz/dashboard", "https://www.zakaziq.cz/?a=1", "https://user:heslo@www.zakaziq.cz", "https://www.zakaziq.cz/#x"])
  func pathRejected(raw: String) {
    #expect(fails(raw) == .hasPath)
  }

  @Test("prázdná a nesmyslná adresa")
  func invalid() {
    #expect(fails("") == .empty)
    #expect(fails("   ") == .empty)
    #expect(fails("ftp://www.zakaziq.cz") == .invalid)
    #expect(fails("https://") == .invalid)
    #expect(fails("https://zakaz iq.cz") == .invalid)
  }

  @Test("cesty API se skládají k základu adresy")
  func endpoint() {
    let url = VoiceClient.url(base: ServerAddress.production, path: "config")
    #expect(url.absoluteString == "https://www.zakaziq.cz/api/public/voice/config")
    let dev = VoiceClient.url(base: ServerAddress.development, path: "config")
    #expect(dev.absoluteString == "http://localhost:3000/api/public/voice/config")
  }

  @Test("uložená adresa: výchozí produkce, apex se uloží jako www, chybná se neuloží")
  func preferences() throws {
    let suite = "cz.zakaziq.voice.tests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let prefs = Preferences(defaults: defaults)

    #expect(prefs.serverAddress == ServerAddress.production)
    prefs.setServerAddress("zakaziq.cz")
    #expect(defaults.string(forKey: "serverAddress") == "https://www.zakaziq.cz")
    prefs.setServerAddress("http://localhost:3000")
    #expect(prefs.serverAddress == ServerAddress.development)
    #expect(prefs.setServerAddress("http://evil.example") == .failure(.insecure))
    #expect(prefs.serverAddress == ServerAddress.development)

    // Ručně podstrčená nebezpečná hodnota se nepoužije.
    defaults.set("http://evil.example", forKey: "serverAddress")
    #expect(prefs.serverAddress == ServerAddress.production)
  }
}
