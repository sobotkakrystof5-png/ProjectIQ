import Foundation

/// Co udělat s textem, který vrátil server (VO06, plán oddíl 3 bod 5).
public enum PasteDecision: Equatable, Sendable {
  /// Vložit ⌘V do aplikace, ve které se diktovalo.
  case paste
  /// Nevkládat, jen dát do schránky (a lišta řekne proč).
  case clipboardOnly(ClipboardReason)
  /// Není co vložit (ticho, zablokováno, zrušeno).
  case nothing
}

public enum ClipboardReason: Equatable, Sendable {
  /// Mezitím se přepnulo do jiné aplikace — vložit jinam by škodilo.
  case appChanged
  /// Chybí Zpřístupnění, ⌘V nejde poslat.
  case noAccessibility
  /// Esc během zpracování: text jen do historie, ne do schránky.
  case abandoned
}

public enum PastePlan {
  /// Rozhodne podle odpovědi a aplikace vpředu (pid při stisku × teď).
  public static func decide(
    response: DictateResponse,
    startPid: Int32?,
    frontPid: Int32?,
    canPostEvents: Bool,
    abandoned: Bool = false
  ) -> PasteDecision {
    guard response.hasText else { return .nothing }
    if abandoned { return .clipboardOnly(.abandoned) }
    guard let startPid, let frontPid, startPid == frontPid else { return .clipboardOnly(.appChanged) }
    guard canPostEvents else { return .clipboardOnly(.noAccessibility) }
    return .paste
  }

  /// Schránku po vložení vrátit, jen když ji mezitím nezměnil nikdo jiný.
  public static func shouldRestoreClipboard(currentChangeCount: Int, ourChangeCount: Int) -> Bool {
    currentChangeCount == ourChangeCount
  }

  /// Za jak dlouho po ⌘V vrátit schránku.
  public static let restoreDelay: TimeInterval = 0.6

  /// Pod tolik ms řeči se nahrávka vůbec neposílá (G1 na Macu; server má tutéž pojistku).
  public static let minSpeechMs = 300
}
