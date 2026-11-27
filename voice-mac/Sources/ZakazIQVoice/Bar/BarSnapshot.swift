#if DEBUG
import AppKit
import SwiftUI
import ZakazIQVoiceCore

/// Jen ladicí sestavení: `ZAKAZIQ_VOICE_BAR_SNAPSHOT=/cesta.png` vykreslí všechny stavy
/// lišty pod sebe do PNG a aplikace skončí (kontrola vzhledu bez spuštění a bez oprávnění).
@MainActor
enum BarSnapshot {
  static func runIfRequested() -> Bool {
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
