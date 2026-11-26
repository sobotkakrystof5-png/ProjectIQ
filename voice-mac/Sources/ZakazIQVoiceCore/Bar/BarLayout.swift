import CoreGraphics
import Foundation

/// Stav lišty (plán, oddíl 9, tabulka „Lišta").
public enum BarStage: Equatable, Sendable {
  /// Lišta skrytá (volba „Ukazovat lištu v klidu" vypnutá).
  case hidden
  case idle
  case listening(DictationMode)
  case processing
  /// Dílky krátce bliknou (300 ms) a lišta se vrátí do klidu.
  case done
  case message(BarMessage)
}

public struct BarMessage: Equatable, Sendable {
  public enum Tone: Equatable, Sendable {
    case info
    case error
  }

  public let text: String
  public let tone: Tone
  /// Text ke zkopírování kliknutím na lištu (diktát z fronty, nevložený text).
  public let copyText: String?

  public init(_ text: String, tone: Tone = .info, copyText: String? = nil) {
    self.text = text
    self.tone = tone
    self.copyText = copyText
  }

  /// Jak dlouho hláška zůstane. Nabídka ke zkopírování déle, ať se stihne kliknout.
  public var duration: TimeInterval { copyText == nil ? 3 : 8 }
}

/// Rozměry a umístění lišty. Čisté funkce, ať jdou testovat bez obrazovky.
public enum BarLayout {
  /// Mezera nad Dockem (nad `visibleFrame.minY`).
  public static let gapAboveDock: CGFloat = 12
  /// Panel je pevný a průhledný; pilulka uvnitř mění velikost (dole uprostřed).
  public static let panelSize = CGSize(width: 380, height: 52)

  /// Velikost pilulky podle stavu (body z náhledu `lista-nahled.html`).
  public static func pillSize(for stage: BarStage, hovering: Bool) -> CGSize {
    switch stage {
    case .hidden: return .zero
    case .idle, .done: return hovering ? CGSize(width: 184, height: 32) : CGSize(width: 48, height: 14)
    case .listening(.hold): return CGSize(width: 216, height: 36)
    case .listening(.handsFree): return CGSize(width: 252, height: 36)
    case .processing: return CGSize(width: 96, height: 28)
    case .message(let message): return CGSize(width: messageWidth(message.text), height: 32)
    }
  }

  /// Šířka hlášky: aspoň 248 (náhled), delší text pilulku roztáhne, nejvýš na šířku panelu.
  /// Odhad 6,3 bodu na znak Instrument Sans 12 + dílky, mezery a okraje.
  public static func messageWidth(_ text: String) -> CGFloat {
    let estimate = 14 + 18 + 10 + CGFloat(text.count) * 6.3 + 14
    return min(panelSize.width - 8, max(248, estimate.rounded(.up)))
  }

  /// Velikost dílku (strana čtverečku) podle stavu.
  public static func tileSize(for stage: BarStage, hovering: Bool) -> CGFloat {
    switch stage {
    case .hidden: return 0
    case .idle, .done: return hovering ? 10 : 4
    case .listening, .message: return 8
    case .processing: return 7
    }
  }

  /// Obrazovka, na které je bod (kurzor). Mimo všechny = první (hlavní).
  public static func screenIndex(containing point: CGPoint, frames: [CGRect]) -> Int {
    frames.firstIndex { $0.contains(point) } ?? 0
  }

  /// Počátek panelu (souřadnice AppKitu, osa y nahoru): vodorovně uprostřed viditelné
  /// plochy, spodní hrana 12 px nad Dockem. Zaokrouhleno na celé body (ostré hrany).
  public static func panelOrigin(panelSize: CGSize = panelSize, visibleFrame: CGRect) -> CGPoint {
    CGPoint(
      x: (visibleFrame.midX - panelSize.width / 2).rounded(),
      y: (visibleFrame.minY + gapAboveDock).rounded()
    )
  }

  /// Obdélník pilulky uvnitř panelu (dole uprostřed), kvůli najetí myší.
  public static func pillRect(in panelSize: CGSize = panelSize, pill: CGSize) -> CGRect {
    CGRect(x: (panelSize.width - pill.width) / 2, y: 0, width: pill.width, height: pill.height)
  }

  /// Čas nahrávky na liště: „0:07", „9:30".
  public static func elapsedText(_ seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds.rounded(.down)))
    return "\(total / 60):" + String(format: "%02d", total % 60)
  }
}
