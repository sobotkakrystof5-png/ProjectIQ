import Foundation

/// Jak se posílá požadavek. Aplikace používá `URLSessionTransport`, testy podstrčí odpověď.
public protocol VoiceTransport: Sendable {
  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Spojení se serverem ZakazIQ Voice (`/api/public/voice/*`).
///
/// - Klíč jde jen v `Authorization: Bearer …`, nikdy v adrese ani v logu.
/// - Bez cookie a cache (`.ephemeral`), bez hlavičky `Origin` (server by ji odmítl 403).
/// - Přesměrování se nesleduje: odpověď 3xx je chyba `.redirected`.
public struct VoiceClient: Sendable {
  public static let userAgent = "ZakazIQVoice/0.1 (macOS)"
  public static let basePath = "api/public/voice"

  public let base: URL
  // Jen pro tenhle modul (rozšíření v `Dictate.swift`); ven se klíč nedostane.
  let key: String
  let transport: VoiceTransport

  public init(base: URL, key: String, transport: VoiceTransport = URLSessionTransport()) {
    self.base = base
    self.key = key
    self.transport = transport
  }

  /// Vyzkoušet připojení = načíst nastavení pro Mac.
  public func fetchConfig() async -> Result<ConfigResponse, VoiceError> {
    let request = Self.request(base: base, path: "config", key: key)
    do {
      let (data, response) = try await transport.send(request)
      return Self.parse(ConfigResponse.self, data: data, status: response.statusCode)
    } catch {
      return .failure(VoiceError.from(error))
    }
  }

  public static func url(base: URL, path: String) -> URL {
    base.appendingPathComponent(basePath).appendingPathComponent(path)
  }

  public static func request(base: URL, path: String, key: String, method: String = "GET") -> URLRequest {
    var request = URLRequest(url: url(base: base, path: path))
    request.httpMethod = method
    request.timeoutInterval = 10
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.httpShouldHandleCookies = false
    request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
    return request
  }

  /// Rozbor odpovědi: 2xx → model, `{ ok:false, code }` → `.server`, 3xx → `.redirected`,
  /// cokoli jiného → `.unexpectedResponse` (špatná adresa).
  public static func parse<T: Decodable>(_ type: T.Type, data: Data, status: Int) -> Result<T, VoiceError> {
    if (300..<400).contains(status) { return .failure(.redirected) }
    let decoder = JSONDecoder()
    if (200..<300).contains(status) {
      if let value = try? decoder.decode(T.self, from: data) { return .success(value) }
      return .failure(.unexpectedResponse(status: status))
    }
    if let failure = try? decoder.decode(FailureBody.self, from: data), !failure.ok, !failure.code.isEmpty {
      return .failure(.server(code: failure.code, status: status))
    }
    return .failure(.unexpectedResponse(status: status))
  }
}

/// `URLSession` bez cookie, cache a přesměrování. Pro každý požadavek vlastní relace,
/// ať delegát nedrží spojení naživu.
public struct URLSessionTransport: VoiceTransport {
  public init() {}

  public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil
    config.httpShouldSetCookies = false
    config.urlCache = nil
    config.timeoutIntervalForRequest = request.timeoutInterval
    // Shrnutí schůzky (R-151) smí trvat až 5 minut, ostatní požadavky 2 minuty.
    config.timeoutIntervalForResource = max(120, request.timeoutInterval)
    let session = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    return (data, http)
  }
}

final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}
