import Foundation
import Testing
@testable import ZakazIQVoiceCore

/// Podstrčená odpověď serveru; zapamatuje si poslaný požadavek.
final class FakeTransport: VoiceTransport, @unchecked Sendable {
  enum Reply {
    case http(Int, String)
    case fail(URLError.Code)
  }

  let reply: Reply
  private(set) var lastRequest: URLRequest?

  init(_ reply: Reply) { self.reply = reply }

  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    lastRequest = request
    switch reply {
    case .http(let status, let body):
      let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
      return (Data(body.utf8), response)
    case .fail(let code):
      throw URLError(code)
    }
  }
}

@Suite("Spojení se serverem")
struct VoiceClientTests {
  static let key = DeviceKeyTests.sample

  static func fixture() throws -> Data {
    let url = try #require(Bundle.module.url(forResource: "config-ok", withExtension: "json", subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
  }

  @Test("odpověď /config ze serveru se načte, neznámá pole nevadí")
  func decodesConfig() throws {
    let result = VoiceClient.parse(ConfigResponse.self, data: try Self.fixture(), status: 200)
    let config = try result.get()
    #expect(config.device.name == "MacBook")
    #expect(config.terms.map(\.term) == ["ZakazIQ", "Vizeon"])
    #expect(config.terms[0].heardAs == ["zakáz iq", "zakaz ik"])
    #expect(config.snippets.first?.expansion == "Kryštof Sobotka, VIZEON")
    #expect(config.cleanupEnabled)
    #expect(config.transcriptionReady == false)
    #expect(config.summary == .init(today: 342, streak: 5))
  }

  @Test("chybějící nepovinná pole mají výchozí hodnotu")
  func minimalConfig() throws {
    let data = Data(#"{"ok":true,"device":{"name":"Pracovní Mac"}}"#.utf8)
    let config = try VoiceClient.parse(ConfigResponse.self, data: data, status: 200).get()
    #expect(config.device.name == "Pracovní Mac")
    #expect(config.terms.isEmpty && config.snippets.isEmpty)
    #expect(config.transcriptionReady)
    #expect(config.summary == .init(today: 0, streak: 0))
  }

  @Test("chybové odpovědi serveru se rozliší podle kódu")
  func serverErrors() {
    let unauthorized = VoiceClient.parse(ConfigResponse.self, data: Data(#"{"ok":false,"code":"UNAUTHORIZED"}"#.utf8), status: 401)
    #expect(unauthorized == .failure(.server(code: "UNAUTHORIZED", status: 401)))

    let limited = VoiceClient.parse(ConfigResponse.self, data: Data(#"{"ok":false,"code":"RATE_LIMITED"}"#.utf8), status: 429)
    #expect(limited == .failure(.server(code: "RATE_LIMITED", status: 429)))
  }

  @Test("cizí odpověď = špatná adresa, přesměrování = chyba")
  func foreignResponses() {
    let html = Data("<!doctype html><title>404</title>".utf8)
    #expect(VoiceClient.parse(ConfigResponse.self, data: html, status: 404) == .failure(.unexpectedResponse(status: 404)))
    #expect(VoiceClient.parse(ConfigResponse.self, data: html, status: 200) == .failure(.unexpectedResponse(status: 200)))
    #expect(VoiceClient.parse(ConfigResponse.self, data: Data(#"{"ok":false,"code":"X"}"#.utf8), status: 200)
      == .failure(.unexpectedResponse(status: 200)))
    #expect(VoiceClient.parse(ConfigResponse.self, data: Data(), status: 308) == .failure(.redirected))
  }

  @Test("požadavek: klíč jen v hlavičce, bez Origin a cookie")
  func requestShape() async throws {
    let transport = FakeTransport(.http(200, #"{"ok":true,"device":{"name":"MacBook"}}"#))
    let client = VoiceClient(base: ServerAddress.production, key: Self.key, transport: transport)
    let result = await client.fetchConfig()
    #expect(try result.get().device.name == "MacBook")

    let request = try #require(transport.lastRequest)
    #expect(request.url?.absoluteString == "https://www.zakaziq.cz/api/public/voice/config")
    #expect(request.httpMethod == "GET")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(Self.key)")
    #expect(request.value(forHTTPHeaderField: "Origin") == nil)
    #expect(request.httpShouldHandleCookies == false)
    #expect(request.url?.absoluteString.contains(Self.key) == false)
  }

  @Test("síťové chyby se převedou na srozumitelné stavy")
  func networkErrors() async {
    let cases: [(URLError.Code, VoiceError)] = [
      (.notConnectedToInternet, .offline),
      (.cannotConnectToHost, .cannotConnect),
      (.cannotFindHost, .cannotConnect),
      (.timedOut, .timedOut),
      (.serverCertificateUntrusted, .insecureConnection),
      (.badServerResponse, .network),
    ]
    for (code, expected) in cases {
      let client = VoiceClient(base: ServerAddress.development, key: Self.key, transport: FakeTransport(.fail(code)))
      #expect(await client.fetchConfig() == .failure(expected))
    }
  }
}
