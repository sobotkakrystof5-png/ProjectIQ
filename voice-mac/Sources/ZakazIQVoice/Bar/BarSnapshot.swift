#if DEBUG
import AppKit
import SwiftUI
import ZakazIQVoiceCore

/// Jen ladicí sestavení: `ZAKAZIQ_VOICE_BAR_SNAPSHOT=/cesta.png` vykreslí všechny stavy
/// lišty pod sebe do PNG a aplikace skončí (kontrola vzhledu bez spuštění a bez oprávnění).
@MainActor
enum BarSnapshot {
  static func runIfRequested() -> Bool {
    if let path = ProcessInfo.processInfo.environment["ZAKAZIQ_VOICE_MEETING_SNAPSHOT"], !path.isEmpty {
      renderMeetingChecks(to: path)
      return true
    }
    if let path = ProcessInfo.processInfo.environment["ZAKAZIQ_VOICE_CALL_SNAPSHOT"], !path.isEmpty {
      renderCallPrompts(to: path)
      return true
    }
    if let path = ProcessInfo.processInfo.environment["ZAKAZIQ_VOICE_TRANSCRIPT_SNAPSHOT"], !path.isEmpty {
      renderTranscriptInWindow(to: path)
      return true
    }
    guard let path = ProcessInfo.processInfo.environment["ZAKAZIQ_VOICE_BAR_SNAPSHOT"], !path.isEmpty else { return false }
    DilkyFont.register()
    let rows: [(String, BarModel)] = [
      ("Klid", model { _ in }),
      ("Najetí myší", model { $0.hovering = true }),
      ("Poslouchá (držení)", model { m in m.listening(.hold); speak(m, seconds: 7) }),
      ("Bez držení", model { m in m.listening(.handsFree); speak(m, seconds: 102) }),
      ("Zpracovává", model { $0.processing() }),
      ("Hláška", model { $0.show(BarMessage("Text je ve schránce")) }),
      ("Chyba", model { $0.show(BarMessage("Bez připojení, diktát počká", tone: .error)) }),
    ]
    let cards: [(String, TranscriptModel)] = [
      ("Přepis", transcript("Projdi prosím komponentu FlowBarView a přidej do ní stav pro chybu sítě. Pak spusť testy a napiš mi, co neprošlo.", words: 21, copied: false)),
      ("Zkopírováno", transcript("Ano, pošli to klientovi ještě dnes.", words: 6, copied: true)),
      ("Dlouhý přepis", transcript(String(repeating: "Tohle je delší diktát, který se do karty nevejde celý, takže se text posouvá a tlačítko zůstává dole. ", count: 14), words: 224, copied: false)),
    ]
    let view = VStack(alignment: .leading, spacing: 14) {
      ForEach(Array(cards.enumerated()), id: \.offset) { _, row in
        HStack(alignment: .top, spacing: 16) {
          Text(row.0)
            .font(DilkyFont.sans(12, weight: 500))
            .foregroundStyle(Dilky.navy950)
            .frame(width: 130, alignment: .leading)
          TranscriptView(model: row.1)
            .background(
              LinearGradient(colors: [Color(hex: 0xC9D3E6), Color(hex: 0x7F93B8)], startPoint: .topLeading, endPoint: .bottomTrailing),
              in: RoundedRectangle(cornerRadius: 10)
            )
        }
      }
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        HStack(spacing: 16) {
          Text(row.0)
            .font(DilkyFont.sans(12, weight: 500))
            .foregroundStyle(Dilky.navy950)
            .frame(width: 130, alignment: .leading)
          FlowBarView(model: row.1)
            .background(
              LinearGradient(colors: [Color(hex: 0xC9D3E6), Color(hex: 0x7F93B8)], startPoint: .topLeading, endPoint: .bottomTrailing),
              in: RoundedRectangle(cornerRadius: 10)
            )
        }
      }
    }
    .padding(20)
    .background(Dilky.ground)

    let renderer = ImageRenderer(content: view)
    renderer.scale = 2
    guard let image = renderer.nsImage,
          let tiff = image.tiffRepresentation,
          let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:])
    else { return true }
    try? png.write(to: URL(fileURLWithPath: path))
    return true
  }

  private static func model(_ configure: (BarModel) -> Void) -> BarModel {
    let m = BarModel()
    configure(m)
    return m
  }

  /// Dlouhý přepis ve skutečném okně (`ImageRenderer` posuvnou oblast nevykreslí).
  /// `ZAKAZIQ_VOICE_TRANSCRIPT_SNAPSHOT=/cesta.png`.
  private static func renderTranscriptInWindow(to path: String) {
    DilkyFont.register()
    let model = transcript(String(repeating: "Tohle je delší diktát, který se do karty nevejde celý, takže se text posouvá a tlačítko zůstává dole. ", count: 14), words: 224, copied: false)
    let size = TranscriptLayout.panelSize(textHeight: model.textHeight)
    let window = NSWindow(contentRect: NSRect(x: -4000, y: -4000, width: size.width, height: size.height), styleMask: [.borderless], backing: .buffered, defer: false)
    window.backgroundColor = NSColor(hex: 0x7F93B8)
    let hosting = NSHostingView(rootView: TranscriptView(model: model))
    hosting.frame = NSRect(origin: .zero, size: size)
    window.contentView = hosting
    window.orderFrontRegardless()
    RunLoop.main.run(until: Date().addingTimeInterval(0.8))
    hosting.layoutSubtreeIfNeeded()
    guard let rep = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else { return }
    hosting.cacheDisplay(in: hosting.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    window.orderOut(nil)
  }

  /// Karty nabídky u hovoru (R-152) pod sebou ve skutečném okně.
  /// `ZAKAZIQ_VOICE_CALL_SNAPSHOT=/cesta.png`.
  private static func renderCallPrompts(to path: String) {
    DilkyFont.register()
    let prompts: [CallPromptModel.Prompt] = [
      .init(kind: .start, label: "Google Meet"),
      .init(kind: .start, label: "Chrome", note: "Hraje to z reproduktorů. Se sluchátky bude přepis přesnější."),
      .init(kind: .end, label: "Microsoft Teams"),
      .init(kind: .silentOther, label: "Google Meet"),
    ]
    let view = VStack(spacing: 0) {
      ForEach(Array(prompts.enumerated()), id: \.offset) { _, prompt in
        CallPromptCard(prompt: prompt, primary: {}, secondary: {})
      }
    }
    let hosting = NSHostingView(rootView: view)
    let size = hosting.fittingSize
    let window = NSWindow(contentRect: NSRect(x: -4000, y: -4000, width: size.width, height: size.height), styleMask: [.borderless], backing: .buffered, defer: false)
    window.backgroundColor = NSColor(hex: 0x7F93B8)
    hosting.frame = NSRect(origin: .zero, size: size)
    window.contentView = hosting
    window.orderFrontRegardless()
    RunLoop.main.run(until: Date().addingTimeInterval(0.8))
    hosting.layoutSubtreeIfNeeded()
    guard let rep = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else { return }
    hosting.cacheDisplay(in: hosting.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    window.orderOut(nil)
  }

  /// Okno Schůzky po konci schůzky: kontrola obou stran a přiřazení ke kontaktu, dvě varianty
  /// vedle sebe (chybí druhá strana bez sluchátek / všechno v pořádku s kontaktem).
  /// `ZAKAZIQ_VOICE_MEETING_SNAPSHOT=/cesta.png`.
  private static func renderMeetingChecks(to path: String) {
    DilkyFont.register()
    func detail(_ extra: String, blocks: String) -> MeetingDetailDTO {
      let raw = #"{"id":"6a1f","title":"Nový web pro Ateliér Horák","startedAt":"2026-11-28T09:10:00.000Z","durationMs":1520000,"status":"done","appName":"Google Meet","words":312,"blocks":"# + blocks + #","transcript":"","summary":null,"summaryText":null,"failedTurns":2,"# + extra + "}"
      return try! JSONDecoder().decode(MeetingDetailDTO.self, from: Data(raw.utf8))
    }
    let meOnly = #"[{"speaker":"me","label":"Kryštof","startMs":0,"endMs":4000,"text":"Dobrý den, slyšíte mě? Tak jsem rád, že to vyšlo."},{"speaker":"me","label":"Kryštof","startMs":64000,"endMs":70000,"text":"Posílám vám odkaz na návrh, podívejte se prosím."}]"#
    let both = #"[{"speaker":"me","label":"Kryštof","startMs":0,"endMs":4000,"text":"Dobrý den, slyšíte mě?"},{"speaker":"other","label":"Jan Horák","startMs":5000,"endMs":9000,"text":"Ano, dobrý den. Mám připravené fotky na web."}]"#
    let problem = MeetingsModel()
    problem.applyDemo(
      detail: detail(#""contactId":null,"contactName":null,"check":{"meTurns":14,"otherTurns":0,"echoTurns":0}"#, blocks: meOnly),
      contacts: try! JSONDecoder().decode(MeetingContactsDTO.self, from: Data(#"{"suggested":[{"id":"c1","name":"Jan Horák","company":"Ateliér Horák"}],"results":[{"id":"c2","name":"Petra Horáková","company":null},{"id":"c1","name":"Jan Horák","company":"Ateliér Horák"}]}"#.utf8)),
      note: MeetingRecordingNote(route: .speakers, otherHeard: false),
      query: "horák",
      idleRoute: .speakers,
      systemAudio: SystemAudioCheck(heard: false, at: Date())
    )
    let fine = MeetingsModel()
    fine.applyDemo(
      detail: detail(#""contactId":"c1","contactName":"Jan Horák","check":{"meTurns":41,"otherTurns":37,"echoTurns":12}"#, blocks: both),
      contacts: try! JSONDecoder().decode(MeetingContactsDTO.self, from: Data(#"{"suggested":[],"results":[]}"#.utf8)),
      note: MeetingRecordingNote(route: .speakers, otherHeard: true)
    )
    let view = HStack(alignment: .top, spacing: 0) {
      MeetingsView(model: problem).frame(width: 720, height: 1180)
      MeetingsView(model: fine).frame(width: 720, height: 1180)
    }
    .background(Dilky.ground)
    let hosting = NSHostingView(rootView: view)
    let size = CGSize(width: 1440, height: 1180)
    let window = NSWindow(contentRect: NSRect(x: -4000, y: -4000, width: size.width, height: size.height), styleMask: [.borderless], backing: .buffered, defer: false)
    hosting.frame = NSRect(origin: .zero, size: size)
    window.contentView = hosting
    window.orderFrontRegardless()
    RunLoop.main.run(until: Date().addingTimeInterval(1.0))
    hosting.layoutSubtreeIfNeeded()
    guard let rep = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else { return }
    hosting.cacheDisplay(in: hosting.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    window.orderOut(nil)
  }

  private static func transcript(_ text: String, words: Int, copied: Bool) -> TranscriptModel {
    let m = TranscriptModel()
    m.show(.init(id: UUID(), text: text, words: words, appName: "Code"))
    if copied { m.copy() }
    return m
  }

  private static func speak(_ m: BarModel, seconds: TimeInterval) {
    let pattern: [Double] = [0.1, 0.3, 0.6, 0.9, 0.7, 0.4, 0.8, 1, 0.6, 0.3, 0.5, 0.7, 0.9, 0.5, 0.2, 0.65]
    for (i, level) in pattern.enumerated() { m.push(level: level, elapsed: seconds - Double(15 - i) * 0.05) }
  }
}
#endif
