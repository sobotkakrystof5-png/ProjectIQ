import AppKit
import SwiftUI

/// Barvy Dílků (plán, oddíl 9; hex z `app/tokens-dilky.css`). Jinde v aplikaci se barva nepíše.
enum Dilky {
  static let navy950 = Color(hex: 0x0C1A36)
  static let navy900 = Color(hex: 0x132850)
  static let navy800 = Color(hex: 0x1B3868)
  static let navy700 = Color(hex: 0x23478B)
  static let navy600 = Color(hex: 0x2B57A8)
  static let navy500 = Color(hex: 0x3A6EC4)
  static let navy300 = Color(hex: 0x8AAEE3)
  static let navy200 = Color(hex: 0xB8CEEF)
  static let navy100 = Color(hex: 0xDCE7F7)
  static let navy50 = Color(hex: 0xEEF2FB)
  static let ground = Color(hex: 0xF4F6FB)
  static let surface = Color(hex: 0xFFFFFF)
  static let quiet = Color(hex: 0x4A5878)
  static let danger = Color(hex: 0xB3261E)

  static let groundNS = NSColor(hex: 0xF4F6FB)
}

extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}

extension NSColor {
  convenience init(hex: UInt32) {
    self.init(
      srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1
    )
  }
}

/// Písma Dílků přibalená v aplikaci (`Contents/Resources/Fonts`, licence OFL).
/// Obě jsou proměnná (osa `wght`), tloušťka se nastavuje číslem 400–700.
enum DilkyFont {
  static let sansFamily = "Instrument Sans"
  static let monoFamily = "JetBrains Mono"
  private static let weightAxis = 0x7767_6874  // 'wght'

  /// Zaregistruje písma jen pro tenhle proces. Bez balíčku (`swift run`) se použije systémové.
  static func register() {
    guard let dir = Bundle.main.resourceURL?.appendingPathComponent("Fonts"),
          let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    else { return }
    for file in files where file.pathExtension.lowercased() == "ttf" {
      CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil)
    }
  }

  static func sans(_ size: CGFloat, weight: CGFloat = 400) -> Font {
    Font(make(sansFamily, size: size, weight: weight, fallback: .systemFont(ofSize: size, weight: systemWeight(weight))))
  }

  static func mono(_ size: CGFloat, weight: CGFloat = 400) -> Font {
    Font(make(monoFamily, size: size, weight: weight, fallback: .monospacedSystemFont(ofSize: size, weight: systemWeight(weight))))
  }

  static func nsSans(_ size: CGFloat, weight: CGFloat = 400) -> NSFont {
    make(sansFamily, size: size, weight: weight, fallback: .systemFont(ofSize: size, weight: systemWeight(weight)))
  }

  private static func make(_ family: String, size: CGFloat, weight: CGFloat, fallback: NSFont) -> NSFont {
    let variation = NSFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
    let descriptor = NSFontDescriptor(fontAttributes: [.family: family, variation: [weightAxis: weight]])
    guard let font = NSFont(descriptor: descriptor, size: size), font.familyName == family else { return fallback }
    return font
  }

  private static func systemWeight(_ weight: CGFloat) -> NSFont.Weight {
    switch weight {
    case ..<450: return .regular
    case ..<550: return .medium
    case ..<650: return .semibold
    default: return .bold
    }
  }
}
