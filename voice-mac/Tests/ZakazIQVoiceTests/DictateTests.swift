import Foundation
import SQLite3
import Testing
@testable import ZakazIQVoiceCore

/// Podstrčená odpověď s hlavičkami; zapamatuje si poslaný požadavek.
final class HeaderTransport: VoiceTransport, @unchecked Sendable {
  let status: Int
  let body: String
  let headers: [String: String]
  let failure: URLError.Code?
  private(set) var lastRequest: URLRequest?

  init(status: Int = 200, body: String = "", headers: [String: String] = [:], failure: URLError.Code? = nil) {
    self.status = status
    self.body = body
    self.headers = headers
    self.failure = failure
  }

  func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    lastRequest = request
    if let failure { throw URLError(failure) }
    let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    return (Data(body.utf8), response)
  }
}

@Suite("Odeslání diktátu")
struct DictateTests {
  static let id = UUID(uuidString: "7E1B7D2C-0A4B-4C1E-9D55-2F0C3A8B9E10")!
  static let started = Date(timeIntervalSince1970: 1_795_611_791) // 2026-11-25T14:03:11+01:00

  static func meta(cancelled: Bool = false) -> DictationMeta {
    DictationMeta(
      id: id,
      startedAt: started,
      durationMs: 8420,
      speechMs: 6900,
      mode: .hold,
      cancelled: cancelled,
      app: .init(bundleId: "com.apple.mail", name: "Mail")
    )
  }

  @Test("meta je JSON přesně podle kontraktu (plán, oddíl 7), null se posílá výslovně")
  func metaJSON() throws {
    let prague = try #require(TimeZone(identifier: "Europe/Prague"))
    #expect(DictationMeta.isoString(Self.started, timeZone: prague) == "2026-11-25T14:03:11+01:00")

    let json = try #require(try JSONSerialization.jsonObject(with: Self.meta().json()) as? [String: Any])
    #expect(Set(json.keys) == ["id", "startedAt", "durationMs", "speechMs", "mode", "cancelled", "app"])
    #expect(json["id"] as? String == "7e1b7d2c-0a4b-4c1e-9d55-2f0c3a8b9e10")
    #expect(json["durationMs"] as? Int == 8420)
    #expect(json["speechMs"] as? Int == 6900)
    #expect(json["mode"] as? String == "hold")
    #expect(json["cancelled"] as? Bool == false)
    let app = try #require(json["app"] as? [String: Any])
    #expect(app["bundleId"] as? String == "com.apple.mail")
    #expect(app["name"] as? String == "Mail")
    #expect(app.keys.contains("titleHint") && app["titleHint"] is NSNull)

    let handsFree = DictationMeta(id: Self.id, startedAt: Self.started, durationMs: 1, speechMs: nil, mode: .handsFree, app: .init(bundleId: nil, name: nil))
    let raw = String(decoding: try handsFree.json(), as: UTF8.self)
    #expect(raw.contains(#""mode":"hands_free""#))
    #expect(raw.contains(#""speechMs":null"#))
    #expect(raw.contains(#""bundleId":null"#))
  }

  @Test("meta drží meze serveru a projde zpátky přes JSON (fronta)")
  func metaLimitsAndRoundTrip() throws {
    let long = DictationMeta(id: Self.id, startedAt: Self.started, durationMs: 900_000, speechMs: -5, mode: .hold, app: .init(bundleId: String(repeating: "a", count: 300), name: String(repeating: "b", count: 200)))
    #expect(long.durationMs == 605_000)
    #expect(long.speechMs == 0)
    #expect(long.app.bundleId?.count == 200)
    #expect(long.app.name?.count == 120)
    let back = try JSONDecoder().decode(DictationMeta.self, from: Self.meta().json())
    #expect(back == Self.meta())
  }

  @Test("multipart: meta jako pole, audio jako soubor m4a; zrušený diktát bez zvuku")
  func multipart() throws {
    let audio = Data([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) // …ftyp
    let body = try MultipartBody.dictation(meta: Self.meta(), audio: audio, boundary: "B")
    let text = String(decoding: body.data, as: UTF8.self)
    #expect(body.contentType == "multipart/form-data; boundary=B")
    #expect(text.hasPrefix("--B\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n{"))
    #expect(text.contains("--B\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"diktat.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n"))
    #expect(text.hasSuffix("\r\n--B--\r\n"))
    #expect(body.data.range(of: audio) != nil)

    let cancelled = try MultipartBody.dictation(meta: Self.meta(cancelled: true), audio: nil, boundary: "B")
    let cancelledText = String(decoding: cancelled.data, as: UTF8.self)
    #expect(!cancelledText.contains("name=\"audio\""))
    #expect(cancelledText.contains(#""cancelled":true"#))
  }

  @Test("POST /dictate: klíč v hlavičce, bez Origin, odpověď se načte")
  func dictateRequest() async throws {
    let transport = HeaderTransport(body: #"{"ok":true,"id":"x","status":"ok","text":"Dobrý den, posílám nabídku.","words":4,"guards":[]}"#)
    let client = VoiceClient(base: URL(string: "https://www.zakaziq.cz")!, key: DeviceKeyTests.sample, transport: transport)
    let outcome = await client.dictate(meta: Self.meta(), audio: Data([1, 2, 3]))
    #expect(outcome == .success(DictateResponse(id: "x", status: "ok", text: "Dobrý den, posílám nabídku.", words: 4)))
    let request = try #require(transport.lastRequest)
    #expect(request.url?.absoluteString == "https://www.zakaziq.cz/api/public/voice/dictate")
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(DeviceKeyTests.sample)")
    #expect(request.value(forHTTPHeaderField: "Origin") == nil)
    #expect(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
    #expect(request.timeoutInterval == 30)
    #expect(request.url?.absoluteString.contains(DeviceKeyTests.sample) == false)
  }

  @Test("chyby: 429 a 502 se opakují (s Retry-After), 401 a 413 ne, síť ano")
  func failures() async {
    let base = URL(string: "https://www.zakaziq.cz")!
    func run(_ t: HeaderTransport, audio: Data = Data([1])) async -> DictateOutcome {
      await VoiceClient(base: base, key: DeviceKeyTests.sample, transport: t).dictate(meta: Self.meta(), audio: audio)
    }

    let limited = await run(HeaderTransport(status: 429, body: #"{"ok":false,"code":"RATE_LIMITED"}"#, headers: ["Retry-After": "42"]))
    #expect(limited == .failure(.server(code: "RATE_LIMITED", status: 429), retryAfter: 42))
    if case .failure(let e, _) = limited { #expect(e.isRetryable) }

    let stt = await run(HeaderTransport(status: 502, body: #"{"ok":false,"code":"STT_FAILED"}"#))
    if case .failure(let e, let after) = stt { #expect(e.isRetryable && after == nil) } else { Issue.record("čekal jsem chybu") }

    let unauthorized = await run(HeaderTransport(status: 401, body: #"{"ok":false,"code":"UNAUTHORIZED"}"#))
    if case .failure(let e, _) = unauthorized { #expect(!e.isRetryable) } else { Issue.record("čekal jsem chybu") }

    let offline = await run(HeaderTransport(failure: .notConnectedToInternet))
    #expect(offline == .failure(.offline, retryAfter: nil))

    let tooBig = await run(HeaderTransport(), audio: Data(count: VoiceClient.maxAudioBytes + 1))
    #expect(tooBig == .failure(.server(code: "TOO_LARGE", status: 413), retryAfter: nil))
  }

  @Test("odpověď: chybějící pole mají výchozí hodnotu, text se vkládá jen u ok/raw/snippet")
  func response() throws {
    let empty = try JSONDecoder().decode(DictateResponse.self, from: Data(#"{"ok":true,"status":"empty"}"#.utf8))
    #expect(empty.text == "" && empty.words == 0 && !empty.hasText)
    #expect(DictateResponse(id: "", status: "raw", text: "ahoj", words: 1).hasText)
    #expect(!DictateResponse(id: "", status: "ok", text: "  \n", words: 0).hasText)
    #expect(!DictateResponse(id: "", status: "blocked", text: "Titulky vytvořil…", words: 2).hasText)
  }

  @Test("fronta: 5–60 s s rostoucím čekáním, Retry-After má přednost, 24 h a konec")
  func retryPolicy() {
    #expect(RetryPolicy.delay(attempts: 1) == 5)
    #expect(RetryPolicy.delay(attempts: 2) == 10)
    #expect(RetryPolicy.delay(attempts: 3) == 20)
    #expect(RetryPolicy.delay(attempts: 5) == 60)
    #expect(RetryPolicy.delay(attempts: 50) == 60)
    #expect(RetryPolicy.delay(attempts: 1, retryAfter: 120) == 120)
    #expect(RetryPolicy.delay(attempts: 1, retryAfter: 1) == 5)
    #expect(RetryPolicy.delay(attempts: 1, retryAfter: 99_999) == 600)
    let now = Date()
    #expect(!RetryPolicy.isExpired(createdAt: now.addingTimeInterval(-23 * 3600), now: now))
    #expect(RetryPolicy.isExpired(createdAt: now.addingTimeInterval(-24 * 3600), now: now))
  }

  @Test("hlášky do lišty jsou krátké a bez kódu chyby")
  func barTexts() {
    let errors: [VoiceError] = [.offline, .noKey, .server(code: "UNAUTHORIZED", status: 401), .server(code: "TOO_LARGE", status: 413),
                                .server(code: "RATE_LIMITED", status: 429), .server(code: "STT_FAILED", status: 502),
                                .server(code: "XYZ", status: 500), .redirected]
    for error in errors {
      let text = VoiceMessages.barText(for: error)
      #expect(!text.isEmpty && text.count <= 50)
      #expect(!text.contains("UNAUTHORIZED") && !text.contains("XYZ"))
    }
    #expect(VoiceMessages.barText(for: .server(code: "UNAUTHORIZED", status: 401)) == "Klíč zařízení neplatí. Vložte nový v Nastavení.")
  }
}

@Suite("Vložení textu")
struct PastePlanTests {
  let text = DictateResponse(id: "", status: "ok", text: "Dobrý den", words: 2)

  @Test("vložit jen do stejné aplikace a se Zpřístupněním")
  func decide() {
    #expect(PastePlan.decide(response: text, startPid: 10, frontPid: 10, canPostEvents: true) == .paste)
    #expect(PastePlan.decide(response: text, startPid: 10, frontPid: 11, canPostEvents: true) == .clipboardOnly(.appChanged))
    #expect(PastePlan.decide(response: text, startPid: nil, frontPid: 11, canPostEvents: true) == .clipboardOnly(.appChanged))
    #expect(PastePlan.decide(response: text, startPid: 10, frontPid: 10, canPostEvents: false) == .clipboardOnly(.noAccessibility))
    #expect(PastePlan.decide(response: text, startPid: 10, frontPid: 10, canPostEvents: true, abandoned: true) == .clipboardOnly(.abandoned))
  }

  @Test("prázdný, zablokovaný ani zrušený diktát se nevkládá")
  func nothing() {
    for status in ["empty", "blocked", "cancelled"] {
      let r = DictateResponse(id: "", status: status, text: status == "blocked" ? "Děkuji za pozornost" : "", words: 0)
      #expect(PastePlan.decide(response: r, startPid: 1, frontPid: 1, canPostEvents: true) == .nothing)
    }
  }

  @Test("schránka se vrátí jen při stejném changeCount")
  func restore() {
    #expect(PastePlan.shouldRestoreClipboard(currentChangeCount: 41, ourChangeCount: 41))
    #expect(!PastePlan.shouldRestoreClipboard(currentChangeCount: 42, ourChangeCount: 41))
    #expect(PastePlan.restoreDelay == 0.6)
  }
}

@Suite("Místní historie a fronta")
struct LocalDBTests {
  func makeDB() throws -> (LocalDB, URL) {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("zakaziq-voice-\(UUID().uuidString)")
    let db = try LocalDB(path: dir.appendingPathComponent("voice.sqlite").path)
    return (db, dir)
  }

  func entry(_ minutesAgo: Double, status: HistoryStatus = .ok, text: String = "Text", app: String = "Mail", id: UUID = UUID()) -> HistoryEntry {
    HistoryEntry(id: id, startedAt: Date().addingTimeInterval(-minutesAgo * 60), appName: app, appBundleId: "com.apple.mail", mode: .hold, status: status, text: text, words: 1)
  }

  @Test("vytvoření: soubor 0600, složka 0700, otevře se znovu")
  func create() throws {
    let (db, dir) = try makeDB()
    defer { try? FileManager.default.removeItem(at: dir) }
    let fileMode = try FileManager.default.attributesOfItem(atPath: db.path)[.posixPermissions] as? Int
    let dirMode = try FileManager.default.attributesOfItem(atPath: dir.path)[.posixPermissions] as? Int
    #expect(fileMode == 0o600)
    #expect(dirMode == 0o700)
    try db.save(entry(1))
    let again = try LocalDB(path: db.path)
    #expect(try again.recent(limit: 10).count == 1)
  }

  @Test("zápis, přepis stejného id, čtení, hledání a mazání")
  func historyCrud() throws {
    let (db, dir) = try makeDB()
    defer { try? FileManager.default.removeItem(at: dir) }
    let id = UUID()
    try db.save(entry(5, status: .pending, text: "", id: id))
    var e = try #require(try db.entry(id: id))
    #expect(e.status == .pending && !e.synced)
    e.status = .ok
    e.text = "Pošlete mi 50% zálohu_dnes"
    e.words = 5
    e.totalMs = 1234
    e.synced = true
    try db.save(e)
    let back = try #require(try db.entry(id: id))
    #expect(back == e)

    try db.save(entry(1, text: "Schůzka zítra", app: "Zprávy"))
    try db.save(entry(2, status: .failed, text: ""))
    #expect(try db.recent(limit: 10).map(\.text).first == "Schůzka zítra")
    #expect(try db.recent(limit: 10, search: "50%").count == 1)
    #expect(try db.recent(limit: 10, search: "%").count == 1)
    #expect(try db.recent(limit: 10, search: "_").count == 1)
    // SQLite LIKE nerozlišuje velikost jen u ASCII: „zprávy" najde, „ZPRÁVY" ne (Á ≠ á).
    #expect(try db.recent(limit: 10, search: "zprávy").count == 1)
    #expect(try db.recent(limit: 10, search: "ZPRÁVY").count == 0)
    #expect(try db.recent(limit: 10, search: "Zprávy").count == 1)
    #expect(try db.recent(limit: 10, status: .failed).count == 1)
    #expect(try db.latestText() == "Schůzka zítra")

    try db.delete(id: id)
    #expect(try db.entry(id: id) == nil)
  }

  @Test("úklid historie po N dnech nechá diktáty, které čekají ve frontě")
  func purge() throws {
    let (db, dir) = try makeDB()
    defer { try? FileManager.default.removeItem(at: dir) }
    let old = entry(60 * 24 * 100)
    let oldQueued = entry(60 * 24 * 100, status: .pending, text: "")
    try db.save(old)
    try db.save(oldQueued)
    try db.save(entry(10))
    try db.enqueue(QueueItem(id: oldQueued.id, audioPath: "/tmp/x.m4a", meta: DictateTests.meta(), nextAttempt: Date(), createdAt: Date()))
    let removed = try db.purgeHistory(olderThan: Date().addingTimeInterval(-90 * 86_400))
    #expect(removed == 1)
    #expect(try db.entry(id: old.id) == nil)
    #expect(try db.entry(id: oldQueued.id) != nil)
  }

  @Test("fronta: na řadě, odklad, 24 h, počet a odebrání")
  func queue() throws {
    let (db, dir) = try makeDB()
    defer { try? FileManager.default.removeItem(at: dir) }
    let now = Date()
    let a = QueueItem(id: UUID(), audioPath: "/tmp/a.m4a", meta: DictateTests.meta(), nextAttempt: now.addingTimeInterval(-1), createdAt: now.addingTimeInterval(-60))
    let b = QueueItem(id: UUID(), audioPath: "/tmp/b.m4a", meta: DictateTests.meta(), attempts: 2, nextAttempt: now.addingTimeInterval(300), createdAt: now.addingTimeInterval(-30))
    let c = QueueItem(id: UUID(), audioPath: "/tmp/c.m4a", meta: DictateTests.meta(), nextAttempt: now, createdAt: now.addingTimeInterval(-25 * 3600))
    try [a, b, c].forEach(db.enqueue)
    #expect(try db.queueCount() == 3)
    #expect(try db.dueQueue(now: now).map(\.id) == [c.id, a.id])
    #expect(try db.expiredQueue(now: now).map(\.id) == [c.id])
    #expect(try db.dueQueue(now: now).first { $0.id == a.id }?.meta == DictateTests.meta())

    try db.reschedule(id: a.id, attempts: 1, next: now.addingTimeInterval(10))
    #expect(try db.dueQueue(now: now).map(\.id) == [c.id])
    try db.removeFromQueue(id: c.id)
    #expect(try db.queueCount() == 2)
    #expect(Set(try db.allQueue().map(\.audioPath)) == ["/tmp/a.m4a", "/tmp/b.m4a"])
  }

  @Test("oprava po vložení, smazání celé historie (frontu nechá), starší soubor dostane sloupec")
  func editsAndMigration() throws {
    let (db, dir) = try makeDB()
    defer { try? FileManager.default.removeItem(at: dir) }
    let edited = entry(3)
    let queued = entry(2, status: .pending, text: "")
    try db.save(edited)
    try db.save(queued)
    try db.save(entry(1))
    try db.enqueue(QueueItem(id: queued.id, audioPath: "/tmp/q.m4a", meta: DictateTests.meta(), nextAttempt: Date(), createdAt: Date()))
    #expect(try db.entry(id: edited.id)?.userEdited == false)
    try db.markEdited(id: edited.id)
    #expect(try db.entry(id: edited.id)?.userEdited == true)
    try db.deleteAllHistory()
    #expect(try db.recent(limit: 10).map(\.id) == [queued.id])

    // Soubor z verze 1 (bez user_edited) se při otevření doplní a data zůstanou.
    let oldPath = dir.appendingPathComponent("v1.sqlite").path
    var raw: OpaquePointer?
    #expect(sqlite3_open(oldPath, &raw) == SQLITE_OK)
    sqlite3_exec(raw, """
      CREATE TABLE history (id TEXT PRIMARY KEY, started_at REAL NOT NULL, app_name TEXT, app_bundle_id TEXT, mode TEXT NOT NULL,
        status TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', words INTEGER NOT NULL DEFAULT 0, error TEXT, total_ms INTEGER,
        synced INTEGER NOT NULL DEFAULT 0);
      INSERT INTO history (id, started_at, mode, status, text, words) VALUES ('7e1b7d2c-0a4b-4c1e-9d55-2f0c3a8b9e10', 1, 'hold', 'ok', 'starý', 1);
      PRAGMA user_version = 1;
      """, nil, nil, nil)
    sqlite3_close(raw)
    let migrated = try LocalDB(path: oldPath)
    let old = try #require(try migrated.entry(id: DictateTests.id))
    #expect(old.text == "starý" && !old.userEdited)
    try migrated.markEdited(id: DictateTests.id)
    #expect(try migrated.entry(id: DictateTests.id)?.userEdited == true)
  }

  @Test("stav ze serveru: error je neúspěch, text mají jen ok/raw/snippet")
  func statuses() {
    #expect(HistoryStatus(server: "ok") == .ok)
    #expect(HistoryStatus(server: "error") == .failed)
    #expect(HistoryStatus(server: "cancelled") == .cancelled)
    #expect(HistoryStatus.snippet.hasText && !HistoryStatus.empty.hasText && !HistoryStatus.pending.hasText)
  }
}
