import Foundation

/// Klíč zařízení `zk_voice_<prefix 10>_<tajemství 32>` (stejný tvar jako `lib/admin/voice/keys.ts`).
/// Leží jen v Klíčence, nikdy v `UserDefaults`, v logu ani v hlášce.
public enum DeviceKey {
  static let prefix = "zk_voice_"
  static let idLength = 10
  static let secretLength = 32

  /// Vrátí klíč bez mezer a konců řádků, nebo `nil`, když nemá správný tvar.
  public static func normalize(_ raw: String) -> String? {
    let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard key.hasPrefix(prefix) else { return nil }
    let rest = key.dropFirst(prefix.count).split(separator: "_", omittingEmptySubsequences: false)
    guard rest.count == 2,
          rest[0].count == idLength,
          rest[1].count == secretLength,
          rest.allSatisfy({ $0.allSatisfy(isAsciiAlphanumeric) })
    else { return nil }
    return key
  }

  /// Zakrytý tvar pro okno: `zk_voice_abcd…` — jako `maskVoiceKey` v adminu.
  public static func masked(_ key: String) -> String {
    guard key.hasPrefix(prefix) else { return "…" }
    let id = key.dropFirst(prefix.count).prefix(4)
    return "\(prefix)\(id)…"
  }

  private static func isAsciiAlphanumeric(_ c: Character) -> Bool {
    guard c.isASCII, let v = c.asciiValue else { return false }
    return (48...57).contains(v) || (65...90).contains(v) || (97...122).contains(v)
  }
}
