import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Schůzka: kontrola sluchátek a obou stran")
struct MeetingCheckTests {
  @Test("výstup: reproduktory, sluchátka v konektoru, AirPods, monitor, neznámé")
  func outputRoute() {
    let cc = OutputRoute.fourCC
    #expect(cc("bltn") == 0x626C_746E)
    #expect(OutputRoute.classify(transport: cc("bltn"), dataSource: cc("ispk")) == .speakers)
    #expect(OutputRoute.classify(transport: cc("bltn"), dataSource: cc("hdpn")) == .headphones)
    #expect(OutputRoute.classify(transport: cc("bltn"), dataSource: nil) == .unknown)
    #expect(OutputRoute.classify(transport: cc("blue"), dataSource: nil) == .headphones)
    #expect(OutputRoute.classify(transport: cc("blea"), dataSource: nil) == .headphones)
    #expect(OutputRoute.classify(transport: cc("hdmi"), dataSource: nil) == .speakers)
    #expect(OutputRoute.classify(transport: cc("airp"), dataSource: nil) == .speakers)
    #expect(OutputRoute.classify(transport: cc("usb "), dataSource: nil) == .unknown)
    #expect(OutputRoute.classify(transport: cc("virt"), dataSource: nil) == .unknown)
  }

  @Test("hlídání druhé strany: až po 90 s a 10 s vlastní řeči, jen jednou, ne když něco hrálo")
  func watch() {
    var w = OtherSideWatch()
    w.myTurn(speechMs: 12_000)
    let early = w.shouldWarn(elapsed: 89)
    let onTime = w.shouldWarn(elapsed: 90)
    let again = w.shouldWarn(elapsed: 200)
    #expect(!early && onTime && !again)

    var quiet = OtherSideWatch()
    quiet.myTurn(speechMs: 4_000)
    let quietWarn = quiet.shouldWarn(elapsed: 300)
    #expect(!quietWarn)

    var heard = OtherSideWatch()
    heard.myTurn(speechMs: 30_000)
    heard.otherLevel(0)
    #expect(!heard.heard)
    heard.otherLevel(0.2)
    #expect(heard.heard)
    let heardWarn = heard.shouldWarn(elapsed: 300)
    #expect(!heardWarn)
  }

  @Test("obě strany slyšet, se sluchátky: všechno v pořádku")
  func allGood() {
    let check = MeetingCheck.evaluate(meTurns: 41, otherTurns: 37, echoTurns: 0, failedTurns: 0, note: .init(route: .headphones, otherHeard: true))
    #expect(!check.hasProblem)
    #expect(check.items.map(\.title) == ["Váš hlas: 41 promluv", "Druhá strana: 37 promluv", "Se sluchátky"])
  }

  @Test("druhá strana chybí a tap byl potichu: rada k povolení s tlačítkem")
  func silentOther() throws {
    let check = MeetingCheck.evaluate(meTurns: 3, otherTurns: 0, echoTurns: 0, failedTurns: 0, note: .init(route: .speakers, otherHeard: false))
    #expect(check.hasProblem)
    let other = try #require(check.items.first { $0.id == "other" })
    #expect(other.tone == .problem)
    #expect(other.action == .openSystemAudioSettings)
    #expect(other.detail?.contains("potichu") == true)
    #expect(check.items.first { $0.id == "me" }?.title == "Váš hlas: 3 promluvy")
  }

  @Test("zvuk počítače hrál, ale bez řeči: bez tlačítka do Nastavení")
  func heardButNoSpeech() {
    let check = MeetingCheck.evaluate(meTurns: 5, otherTurns: 0, echoTurns: 0, failedTurns: 0, note: .init(route: .headphones, otherHeard: true))
    let other = check.items.first { $0.id == "other" }
    #expect(other?.action == nil)
    #expect(other?.detail?.contains("Mluvila druhá strana přes tento Mac?") == true)
  }

  @Test("bez sluchátek: ozvěna vynechaná, čísla v pádech")
  func speakers() {
    let one = MeetingCheck.evaluate(meTurns: 1, otherTurns: 1, echoTurns: 1, failedTurns: 1, note: .init(route: .speakers, otherHeard: true))
    #expect(one.items.first { $0.id == "me" }?.title == "Váš hlas: 1 promluva")
    #expect(one.items.first { $0.id == "route" }?.detail == "Mikrofon zachytil i druhou stranu z reproduktorů, 1 promluvu jsem z přepisu vynechal. Se sluchátky bude přepis přesnější.")
    #expect(one.items.first { $0.id == "failed" }?.detail == "1 promluvu se nepodařilo přepsat.")
    #expect(!one.hasProblem)

    let none = MeetingCheck.evaluate(meTurns: 2, otherTurns: 2, echoTurns: 0, failedTurns: 0, note: .init(route: .speakers, otherHeard: true))
    #expect(none.items.first { $0.id == "route" }?.tone == .notice)
  }

  @Test("schůzka z jiného Macu nebo starší: bez poznámky, počty z odstavců bez čísel")
  func withoutNote() throws {
    let raw = #"{"id":"a","title":null,"startedAt":"2026-11-27T13:10:00.000Z","durationMs":60000,"status":"done","appName":null,"contactId":null,"contactName":null,"words":4,"blocks":[{"speaker":"me","label":"Kryštof","startMs":0,"endMs":2000,"text":"Dobrý den."}],"transcript":"","summary":null,"summaryText":null,"failedTurns":0}"#
    let detail = try JSONDecoder().decode(MeetingDetailDTO.self, from: Data(raw.utf8))
    #expect(detail.check == nil)
    let check = detail.evaluateCheck(note: nil)
    #expect(check.items.first { $0.id == "me" }?.title == "Váš hlas je v přepisu")
    #expect(check.items.first { $0.id == "other" }?.action == .openSystemAudioSettings)
    #expect(!check.items.contains { $0.id == "route" })

    let withCheck = raw.replacingOccurrences(of: #""failedTurns":0}"#, with: #""failedTurns":0,"check":{"meTurns":4,"otherTurns":2,"echoTurns":3}}"#)
    let exact = try JSONDecoder().decode(MeetingDetailDTO.self, from: Data(withCheck.utf8)).evaluateCheck(note: nil)
    #expect(exact.items.map(\.title) == ["Váš hlas: 4 promluvy", "Druhá strana: 2 promluvy", "Ozvěna vynechaná"])
  }

  @Test("Mac si pamatuje posledních 30 schůzek a stav zvuku systému")
  func preferences() throws {
    let suite = "cz.zakaziq.voice.tests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let prefs = Preferences(defaults: defaults)

    #expect(prefs.systemAudioCheck == nil)
    #expect(prefs.meetingNote(id: "x") == nil)
    for i in 0..<35 { prefs.setMeetingNote(.init(route: .speakers, otherHeard: i % 2 == 0), id: "m\(i)") }
    #expect(prefs.meetingNote(id: "m34") == MeetingRecordingNote(route: .speakers, otherHeard: true))
    #expect(prefs.meetingNote(id: "m5") == MeetingRecordingNote(route: .speakers, otherHeard: false))
    #expect(prefs.meetingNote(id: "m4") == nil)
    prefs.setMeetingNote(.init(route: .headphones, otherHeard: true), id: "m34")
    #expect(prefs.meetingNote(id: "m34")?.route == .headphones)

    let at = Date(timeIntervalSince1970: 1_800_000_000)
    prefs.systemAudioCheck = SystemAudioCheck(heard: false, at: at)
    #expect(prefs.systemAudioCheck == SystemAudioCheck(heard: false, at: at))
  }
}

@Suite("Schůzka: přiřazení ke kontaktu")
struct MeetingContactAPITests {
  static let base = URL(string: "https://www.zakaziq.cz")!

  @Test("hledání: dotaz v adrese, oříznutý; bez dotazu jen návrh")
  func search() async throws {
    let body = #"{"ok":true,"suggested":[{"id":"c1","name":"Jan Horák","company":"Ateliér Horák"}],"results":[]}"#
    let transport = FakeTransport(.http(200, body))
    let api = VoiceAPI(base: Self.base, key: DeviceKeyTests.sample, transport: transport)
    let value = try await api.meetingContacts(id: "m1", query: "  Horák a syn ").get()
    #expect(value.suggested.first?.name == "Jan Horák")
    let url = try #require(transport.lastRequest?.url)
    #expect(url.path == "/api/public/voice/meetings/m1/contacts")
    #expect(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems == [URLQueryItem(name: "q", value: "Horák a syn")])

    let empty = FakeTransport(.http(200, body))
    _ = await VoiceAPI(base: Self.base, key: DeviceKeyTests.sample, transport: empty).meetingContacts(id: "m1", query: " ")
    #expect(empty.lastRequest?.url?.query == nil)
  }

  @Test("přiřazení: PATCH s contactId, odpojení posílá null výslovně")
  func assign() async throws {
    let detail = #"{"ok":true,"meeting":{"id":"m1","title":null,"startedAt":"2026-11-27T13:10:00.000Z","durationMs":60000,"status":"done","appName":null,"contactId":"c1","contactName":"Jan Horák","words":0,"blocks":[],"transcript":"","summary":null,"summaryText":null,"failedTurns":0}}"#
    let transport = FakeTransport(.http(200, detail))
    let api = VoiceAPI(base: Self.base, key: DeviceKeyTests.sample, transport: transport)
    let assigned = try await api.setMeetingContact(id: "m1", contactId: "c1").get()
    #expect(assigned.contactName == "Jan Horák")
    #expect(transport.lastRequest?.httpMethod == "PATCH")
    #expect(transport.lastRequest?.url?.path == "/api/public/voice/meetings/m1")
    #expect(transport.lastRequest?.httpBody.map { String(decoding: $0, as: UTF8.self) } == #"{"contactId":"c1"}"#)

    _ = await api.setMeetingContact(id: "m1", contactId: nil)
    #expect(transport.lastRequest?.httpBody.map { String(decoding: $0, as: UTF8.self) } == #"{"contactId":null}"#)
  }

  @Test("kontakt se nenašel: kód ze serveru")
  func notFound() async {
    let transport = FakeTransport(.http(404, #"{"ok":false,"code":"CONTACT_NOT_FOUND"}"#))
    let result = await VoiceAPI(base: Self.base, key: DeviceKeyTests.sample, transport: transport).setMeetingContact(id: "m1", contactId: "x")
    #expect(result == .failure(.server(code: "CONTACT_NOT_FOUND", status: 404)))
  }
}
