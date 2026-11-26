import AppKit
import ApplicationServices
import Carbon.HIToolbox
import ZakazIQVoiceCore

/// Čtení textového pole přes Zpřístupnění (VO09). Nikdy pole pro heslo ani při bezpečném
/// vstupu, nikdy pole delší než 50 000 znaků. Jen čte, nic do aplikace nepíše.
@MainActor
enum FocusReader {
  struct Field {
    let element: AXUIElement
    let pid: pid_t
    let value: String
    /// Kurzor (konec výběru) v jednotkách UTF-16; `nil` = aplikace ho nedává.
    let caret: Int?
  }

  enum Failure: Error, Equatable {
    /// Pole pro heslo nebo bezpečný vstup — nečte se a nepočítá jako chyba.
    case secure
    /// Zpřístupnění není povolené.
    case notTrusted
    /// Aplikace nedala prvek, hodnotu nebo to není text (Electron, web, plátno).
    case unreadable
    case tooLong
  }

  /// Jak dlouho čekat na odpověď aplikace. Zaseknutá aplikace nesmí zdržet diktování.
  static let timeout: Float = 0.3

  /// Pole, ve kterém je teď kurzor.
  static func focusedField() -> Result<Field, Failure> {
    guard AXIsProcessTrusted() else { return .failure(.notTrusted) }
    if IsSecureEventInputEnabled() { return .failure(.secure) }
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, timeout)
    guard let element = element(system, kAXFocusedUIElementAttribute) else { return .failure(.unreadable) }
    return read(element)
  }

  /// Znovu přečte už známý prvek (i když v něm kurzor není).
  static func read(_ element: AXUIElement) -> Result<Field, Failure> {
    if IsSecureEventInputEnabled() { return .failure(.secure) }
    AXUIElementSetMessagingTimeout(element, timeout)
    if string(element, kAXSubroleAttribute) == (kAXSecureTextFieldSubrole as String)
      || string(element, kAXRoleAttribute) == "AXSecureTextField" {
      return .failure(.secure)
    }
    if let count = int(element, kAXNumberOfCharactersAttribute), count > EditLocator.maxFieldLength {
      return .failure(.tooLong)
    }
    guard let value = string(element, kAXValueAttribute) else { return .failure(.unreadable) }
    if (value as NSString).length > EditLocator.maxFieldLength { return .failure(.tooLong) }
    var pid: pid_t = 0
    AXUIElementGetPid(element, &pid)
    return .success(Field(element: element, pid: pid, value: value, caret: caret(element)))
  }

  /// Je kurzor pořád v tomhle prvku?
  static func isFocused(_ element: AXUIElement) -> Bool {
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, timeout)
    guard let current = self.element(system, kAXFocusedUIElementAttribute) else { return false }
    return CFEqual(current, element)
  }

  // MARK: Atributy

  private static func copy(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value
  }

  private static func element(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
    guard let value = copy(element, attribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
  }

  private static func string(_ element: AXUIElement, _ attribute: String) -> String? {
    copy(element, attribute) as? String
  }

  private static func int(_ element: AXUIElement, _ attribute: String) -> Int? {
    (copy(element, attribute) as? NSNumber)?.intValue
  }

  private static func caret(_ element: AXUIElement) -> Int? {
    guard let value = copy(element, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    var range = CFRange()
    guard AXValueGetValue(value as! AXValue, .cfRange, &range) else { return nil }
    return range.location + range.length
  }
}
