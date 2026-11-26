import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Opravy po vložení: najít upravený úsek")
struct EditLocatorTests {
  /// Vloží text na místo kurzoru a vrátí pole i snímek.
  private func paste(_ inserted: String, into field: String, at offset: Int) throws -> (String, PasteSnapshot) {
    let ns = field as NSString
    let full = ns.replacingCharacters(in: NSRange(location: offset, length: 0), with: inserted)
    let caret = offset + (inserted as NSString).length
    let snap = try #require(EditLocator.snapshot(field: full, inserted: inserted, caret: caret))
    return (full, snap)
  }

  @Test("oprava jednoho slova v celém poli")
  func oneWord() throws {
    let (_, snap) = try paste("Pošli to Prvotce a zakaz iq.", into: "", at: 0)
    #expect(EditLocator.editedSegment(snap, now: "Pošli to Prvotce a ZakazIQ.") == "Pošli to Prvotce a ZakazIQ.")
  }

  @Test("beze změny a jen doplněná čárka se neposílají")
  func unchangedAndPunctuation() throws {
    let (field, snap) = try paste("ahoj jak se máš", into: "", at: 0)
    #expect(EditLocator.editedSegment(snap, now: field) == nil)
    #expect(EditLocator.editedSegment(snap, now: "ahoj, jak se máš?") == nil)
    // Velké písmeno se počítá.
    #expect(EditLocator.editedSegment(snap, now: "Ahoj jak se máš") == "Ahoj jak se máš")
  }

  @Test("smazaný konec vloženého textu")
  func deletedEnd() throws {
    let before = "Dobrý den,\n\n"
    let after = "\n\nS pozdravem Kryštof"
    let (_, snap) = try paste("posílám nabídku na web a ještě něco navíc.", into: before + after, at: (before as NSString).length)
    let now = before + "posílám nabídku na web." + after
    #expect(EditLocator.editedSegment(snap, now: now) == "posílám nabídku na web.")
  }

  @Test("text vložený doprostřed odstavce, upravené slovo")
  func middleOfParagraph() throws {
    let paragraph = "Tohle je první věta odstavce, která tu byla dřív. A tohle je druhá věta, taky stará."
    let offset = (paragraph as NSString).range(of: " A tohle").location
    let (_, snap) = try paste(" Termín je ve čtvrtek ve tři.", into: paragraph, at: offset)
    let now = (paragraph as NSString).replacingCharacters(in: NSRange(location: offset, length: 0), with: " Termín je v pátek ve tři.")
    #expect(EditLocator.editedSegment(snap, now: now) == " Termín je v pátek ve tři.")
  }

  @Test("chybějící kotva = nic (okolní text se změnil nebo pole odešlo)")
  func missingAnchor() throws {
    let surrounding = "Úvodní věta, která je dost dlouhá na kotvu. ||| Závěrečná věta, která je taky dost dlouhá."
    let offset = (surrounding as NSString).range(of: "|||").location
    let (_, snap) = try paste("vložený text tady", into: surrounding, at: offset)
    #expect(EditLocator.editedSegment(snap, now: "Úplně jiný obsah pole, nic z původního.") == nil)
    // Pole tvořené jen diktátem je teď prázdné (zpráva odeslaná).
    let (_, only) = try paste("Zpráva do Slacku", into: "", at: 0)
    #expect(EditLocator.editedSegment(only, now: "") == nil)
    #expect(EditLocator.editedSegment(only, now: "  \n") == nil)
  }

  @Test("pole přepsané celé = nic, je to nový text")
  func rewritten() throws {
    let (_, snap) = try paste("zítra ve tři u Nováka probereme nabídku", into: "", at: 0)
    #expect(EditLocator.editedSegment(snap, now: "Odpověz mu, že se ozvu příští týden") == nil)
  }

  @Test("celý vložený úsek smazaný, kotvy zůstaly = prázdný text")
  func deletedAll() throws {
    let before = "Začátek dopisu, který tam byl předtím. "
    let after = " Konec dopisu, který tam byl taky předtím."
    let (_, snap) = try paste("Titulky vytvořil Jan Novák", into: before + after, at: (before as NSString).length)
    #expect(EditLocator.editedSegment(snap, now: before + after) == "")
  }

  @Test("opakovaný text v poli: rozhodnou kotvy a místo")
  func repeated() throws {
    let block = "Ahoj, posílám podklady. "
    let field = block + block + block
    let offset = (block as NSString).length * 2
    let (_, snap) = try paste("Prvotka", into: field, at: offset)
    // Stejný text je v poli i na prvním místě; oprava se má najít na místě vložení.
    let full = (field as NSString).replacingCharacters(in: NSRange(location: offset, length: 0), with: "Prvotka")
    let withEarlierCopy = "Prvotka " + full
    #expect(EditLocator.editedSegment(snap, now: withEarlierCopy) == nil)
    let fixed = (full as NSString).replacingCharacters(in: NSRange(location: offset, length: 7), with: "Prvotku")
    #expect(EditLocator.editedSegment(snap, now: fixed) == "Prvotku")
  }

  @Test("snímek: kurzor jinde než na konci vloženého textu, text v poli chybí, moc dlouhé pole")
  func snapshotEdges() {
    let field = "aaa vložený text bbb"
    let snap = EditLocator.snapshot(field: field, inserted: "vložený text", caret: 0)
    #expect(snap?.start == 4)
    #expect(snap?.prefix == "aaa " && snap?.prefixAtFieldStart == true)
    #expect(snap?.suffix == " bbb" && snap?.suffixAtFieldEnd == true)
    #expect(EditLocator.snapshot(field: field, inserted: "jiný", caret: 5) == nil)
    #expect(EditLocator.snapshot(field: field, inserted: "", caret: 5) == nil)
    #expect(EditLocator.snapshot(field: String(repeating: "x", count: 50_001), inserted: "x", caret: 1) == nil)
  }
}

@Suite("Opravy po vložení: fronta a počítadlo")
struct FeedbackQueueTests {
  @Test("tři stavy: beze změny, opraveno, ztraceno")
  func outcomes() throws {
    let snap = try #require(EditLocator.snapshot(field: "Ahoj Prvotka", inserted: "Ahoj Prvotka", caret: 12))
    #expect(EditLocator.locate(snap, now: "Ahoj Prvotka") == .unchanged)
    #expect(EditLocator.locate(snap, now: "Ahoj Prvotko") == .edited("Ahoj Prvotko"))
    #expect(EditLocator.locate(snap, now: "") == .lost)
  }

  @Test("fronta: stejné id nahradí, starší než 24 h zmizí, soubor 0600")
  func queue() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("zakaziq-voice-fq-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let q = FeedbackQueue(url: dir.appendingPathComponent("q.json"))
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let id = UUID()
    q.add(.init(id: id, editedText: "první", createdAt: now), now: now)
    q.add(.init(id: id, editedText: "druhá", createdAt: now), now: now)
    q.add(.init(id: UUID(), editedText: "stará", createdAt: now.addingTimeInterval(-25 * 3600)), now: now)
    #expect(q.pending(now: now).map(\.editedText) == ["druhá"])
    let perms = try FileManager.default.attributesOfItem(atPath: q.url.path)[.posixPermissions] as? Int
    #expect(perms == 0o600)
    q.bumpAttempts(id: id)
    #expect(q.pending(now: now).first?.attempts == 1)
    q.remove(id: id)
    #expect(q.pending(now: now).isEmpty)
    #expect(!FileManager.default.fileExists(atPath: q.url.path))
  }

  @Test("které chyby opravy se už neposílají znovu")
  func finalErrors() {
    #expect(FeedbackResult.isFinal(.server(code: "TOO_OLD", status: 409)))
    #expect(FeedbackResult.isFinal(.server(code: "NOT_FOUND", status: 404)))
    #expect(!FeedbackResult.isFinal(.offline))
    #expect(!FeedbackResult.isFinal(.server(code: "RATE_LIMITED", status: 429)))
  }

  @Test("/feedback: tělo { id, editedText }, odpověď s počtem naučených slov")
  func feedbackRequest() async throws {
    let transport = FakeTransport(.http(200, #"{"ok":true,"userEdits":1,"pairs":1,"learned":1}"#))
    let api = VoiceAPI(base: URL(string: "https://www.zakaziq.cz")!, key: DeviceKeyTests.sample, transport: transport)
    let id = try #require(UUID(uuidString: "0B9C6F1E-1D5B-4B8E-9C3A-2F1E0D9C8B7A"))
    let result = try await api.feedback(id: id, editedText: "Prvotku").get()
    #expect(result == FeedbackResult(userEdits: 1, learned: 1))
    let sent = try #require(transport.lastRequest)
    #expect(sent.url?.path == "/api/public/voice/feedback" && sent.httpMethod == "POST")
    let json = try #require(try JSONSerialization.jsonObject(with: sent.httpBody ?? Data()) as? [String: String])
    #expect(json == ["id": "0b9c6f1e-1d5b-4b8e-9c3a-2f1e0d9c8b7a", "editedText": "Prvotku"])
  }

  @Test("počítadlo nečitelných polí podle aplikace")
  func unreadable() throws {
    let suite = "cz.zakaziq.voice.tests.edits.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let counter = UnreadableFields(defaults: defaults)
    counter.record(app: "Slack")
    counter.record(app: "Slack")
    counter.record(app: nil)
    #expect(counter.sorted.map(\.app) == ["Slack", "Neznámá aplikace"])
    #expect(counter.counts["Slack"] == 2)
  }
}
