import Foundation

/// Klávesa, kterou se diktuje (D-V6). Fn je výchozí, pravý ⌥ je záloha pro klávesnice,
/// kde fn dělá něco jiného.
public enum DictationShortcut: String, CaseIterable, Sendable, Identifiable {
  case fn
  case rightOption

  public var id: String { rawValue }

  /// Kód klávesy v událostech `flagsChanged` (kVK_Function, kVK_RightOption).
  public var keyCode: Int64 {
    switch self {
    case .fn: return 63
    case .rightOption: return 61
    }
  }

  /// Je to tahle klávesa? Klávesa 🌐/fn na novějších klávesnicích Applu může mít kód 179
  /// místo 63; jiná klávesa ho nemá, proto se bere taky.
  public func matches(keyCode code: Int64) -> Bool {
    switch self {
    case .fn: return code == 63 || code == 179
    case .rightOption: return code == 61
    }
  }

  /// Bit příznaku v `CGEventFlags.rawValue`: fn = `maskSecondaryFn`, pravý ⌥ =
  /// `NX_DEVICERALTKEYMASK` (rozliší pravý od levého, který nese stejný `maskAlternate`).
  public var flagBit: UInt64 {
    switch self {
    case .fn: return 0x0080_0000
    case .rightOption: return 0x0000_0040
    }
  }

  public func isDown(flags: UInt64) -> Bool { flags & flagBit != 0 }

  public var title: String {
    switch self {
    case .fn: return "fn"
    case .rightOption: return "pravý ⌥"
    }
  }
}

/// Co dělá samotná klávesa fn v systému (`com.apple.HIToolbox` → `AppleFnUsageType`).
/// Diktování to přebít nemá; aplikace jen poradí, kde to přepnout.
public enum FnKeyUsage: Equatable, Sendable {
  case nothing
  case changeInputSource
  case emoji
  case appleDictation
  case unknown

  public init(rawValue: Int?) {
    switch rawValue {
    case 0: self = .nothing
    case 1: self = .changeInputSource
    case 2: self = .emoji
    case 3: self = .appleDictation
    // Chybí-li hodnota, systém použije výchozí chování klávesy 🌐 (výběr emoji nebo zdroje).
    default: self = .unknown
    }
  }

  /// Překáží diktování přes fn?
  public var interferes: Bool { self != .nothing }

  /// Věta do Nastavení (bez emoji, Dílky).
  public var advice: String? {
    switch self {
    case .nothing:
      return nil
    case .changeInputSource:
      return "Klávesa fn teď přepíná jazyk klávesnice. V Nastavení systému › Klávesnice u ní zvolte Nedělat nic."
    case .emoji:
      return "Klávesa fn teď otevírá výběr emoji. V Nastavení systému › Klávesnice u ní zvolte Nedělat nic."
    case .appleDictation:
      return "Klávesa fn teď spouští diktování od Applu. V Nastavení systému › Klávesnice u ní zvolte Nedělat nic."
    case .unknown:
      return "Klávesa fn může v systému otevírat výběr emoji. V Nastavení systému › Klávesnice u ní zvolte Nedělat nic."
    }
  }
}
