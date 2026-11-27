import CoreGraphics
import Foundation

/// Rozměry a umístění karty s přepisem nad lištou. Čisté funkce, ať jdou testovat.
public enum TranscriptLayout {
  /// Šířka karty.
  public static let cardWidth: CGFloat = 520
  /// Vnitřní okraj karty vlevo a vpravo.
  public static let padding: CGFloat = 16
  /// Rezerva kolem karty v průhledném panelu na stín.
  public static let shadowInset: CGFloat = 14
  /// Delší text se v kartě posouvá.
  public static let maxTextHeight: CGFloat = 240
  public static let minTextHeight: CGFloat = 20
  /// Hlavička 28, mezera 10, mezera 12, spodní řádek s tlačítkem 40, okraj 16 nahoře a 14 dole.
  public static let chromeHeight: CGFloat = 16 + 28 + 10 + 12 + 40 + 14
  /// Mezera mezi horní hranou lišty a kartou.
  public static let gapAboveBar: CGFloat = 4

  /// Šířka pro text (bez okrajů a místa pro posuvník).
  public static var textWidth: CGFloat { cardWidth - 2 * padding - 8 }

  /// Výška textu v kartě: změřená, zaokrouhlená nahoru, mezi `minTextHeight` a `maxTextHeight`.
  public static func textHeight(measured: CGFloat) -> CGFloat {
    min(maxTextHeight, max(minTextHeight, measured.rounded(.up)))
  }

  /// Posouvá se text? (Delší než `maxTextHeight`.)
  public static func isScrollable(measured: CGFloat) -> Bool {
    measured.rounded(.up) > maxTextHeight
  }

  public static func cardSize(textHeight: CGFloat) -> CGSize {
    CGSize(width: cardWidth, height: chromeHeight + textHeight)
  }

  /// Panel = karta + rezerva na stín ze všech stran.
  public static func panelSize(textHeight: CGFloat) -> CGSize {
    let card = cardSize(textHeight: textHeight)
    return CGSize(width: card.width + 2 * shadowInset, height: card.height + 2 * shadowInset)
  }

  /// Počátek panelu (souřadnice AppKitu, osa y nahoru): vodorovně uprostřed, spodní hrana
  /// karty kousek nad panelem lišty (lišta je 12 px nad Dockem a vysoká 52).
  public static func panelOrigin(panelSize: CGSize, visibleFrame: CGRect) -> CGPoint {
    let cardBottom = visibleFrame.minY + BarLayout.gapAboveDock + BarLayout.panelSize.height + gapAboveBar
    return CGPoint(
      x: (visibleFrame.midX - panelSize.width / 2).rounded(),
      y: (cardBottom - shadowInset).rounded()
    )
  }
}
