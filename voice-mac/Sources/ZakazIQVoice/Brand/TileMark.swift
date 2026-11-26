import AppKit
import SwiftUI

/// Mřížka 2×2 dílků z loga (`public/ikony/ikona.svg`): dílek 18/64 strany, mezera 8/64,
/// zaoblení 28 % dílku.
enum TileMark {
  /// Ikona v liště menu: jen dílky, šablonový obrázek (barvu dodá systém, světlá i tmavá lišta).
  /// `active` = právě se nahrává: dílky v barvě vlnek (`navy-300`), aby to bylo vidět
  /// i bez lišty. Mimo nahrávání šablona, kterou obarví systém.
  static func menuBarImage(active: Bool = false) -> NSImage {
    let size = NSSize(width: 18, height: 18)
    let image = NSImage(size: size, flipped: false) { rect in
      (active ? NSColor(hex: 0x8AAEE3) : NSColor.black).setFill()
      let tile: CGFloat = 7
      let gap: CGFloat = 2
      let origin = (rect.width - (tile * 2 + gap)) / 2
      for row in 0..<2 {
        for col in 0..<2 {
          let r = NSRect(
            x: origin + CGFloat(col) * (tile + gap),
            y: origin + CGFloat(row) * (tile + gap),
            width: tile,
            height: tile
          )
          NSBezierPath(roundedRect: r, xRadius: 2, yRadius: 2).fill()
        }
      }
      return true
    }
    image.isTemplate = !active
    image.accessibilityDescription = active ? "ZakazIQ Voice nahrává" : "ZakazIQ Voice"
    return image
  }
}

/// Logo: zaoblený čtverec s přechodem `navy-600 → navy-800` a čtyřmi bílými dílky.
struct LogoMark: View {
  var size: CGFloat = 32

  var body: some View {
    let unit = size / 64
    ZStack(alignment: .topLeading) {
      RoundedRectangle(cornerRadius: 17.92 * unit, style: .continuous)
        .fill(LinearGradient(colors: [Dilky.navy600, Dilky.navy800], startPoint: .topLeading, endPoint: .bottomTrailing))
      ForEach(0..<4, id: \.self) { i in
        RoundedRectangle(cornerRadius: 5.04 * unit, style: .continuous)
          .fill(Color.white)
          .frame(width: 18 * unit, height: 18 * unit)
          .offset(x: (i % 2 == 0 ? 10 : 36) * unit, y: (i < 2 ? 10 : 36) * unit)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}
