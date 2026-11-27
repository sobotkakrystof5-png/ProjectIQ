import AppKit
import Carbon.HIToolbox
import CoreGraphics
import ZakazIQVoiceCore

/// Zachytávání zkratky diktování (VO04, D-V6) přes `CGEventTap`.
///
/// - Fn = `flagsChanged` s kódem 63 a příznakem `maskSecondaryFn`. Šipky a F-klávesy nesou
///   příznak taky, proto rozhoduje kód klávesy.
/// - Tap je `.defaultTap` (potřebuje Zpřístupnění), ale **pohltí jen Esc** (během nahrávání
///   a zpracování) **a Enter** (jen během nahrávání: diktát ukončí, do pole nepropadne).
///   Všechno ostatní propouští beze změny.
/// - Když ho macOS vypne (pomalé zpětné volání, zásah uživatele), znovu ho zapne.
@MainActor
final class FnMonitor {
  enum Signal: Equatable {
    case down
    case up
    case otherKey
    case escape
    /// Enter (i na numerické klávesnici). Nepohlcuje se; zachycení oprav (VO09) si pole
    /// přečte dřív, než zpráva odejde.
    case enter
    /// Enter během nahrávání: diktát skončí. Klávesa se pohltí, aplikace ji nedostane.
    case finishKey
  }

  var shortcut: DictationShortcut = .fn {
    didSet { if shortcut != oldValue { triggerHeld = false } }
  }

  /// Nastavuje řadič diktátu: `true` jen během nahrávání a zpracování.
  var capturesEscape = false
  /// Nastavuje řadič diktátu: `true` jen během nahrávání (Enter diktát ukončí).
  var capturesEnter = false

  var onSignal: ((Signal) -> Void)?

  private var tap: CFMachPort?
  private var source: CFRunLoopSource?
  private var triggerHeld = false
  /// Pohlcený Enter: jeho opakování a puštění se pohltí taky, jinak by držený Enter
  /// po konci nahrávání odeslal zprávu v Claude Code.
  private var swallowingEnter = false

  var isRunning: Bool { tap != nil }

  /// Spustí zachytávání. `false` = chybí oprávnění (Sledování vstupu a Zpřístupnění).
  @discardableResult
  func start() -> Bool {
    if tap != nil { return true }
    let mask = (CGEventMask(1) << CGEventType.flagsChanged.rawValue)
      | (CGEventMask(1) << CGEventType.keyDown.rawValue)
      | (CGEventMask(1) << CGEventType.keyUp.rawValue)
    guard let tap = CGEvent.tapCreate(
      tap: .cgSessionEventTap,
      place: .headInsertEventTap,
      options: .defaultTap,
      eventsOfInterest: mask,
      callback: fnMonitorCallback,
      userInfo: Unmanaged.passUnretained(self).toOpaque()
    ) else { return false }
    let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    self.tap = tap
    self.source = source
    return true
  }

  func stop() {
    if let tap { CGEvent.tapEnable(tap: tap, enable: false) }
    if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
    tap = nil
    source = nil
    triggerHeld = false
    swallowingEnter = false
  }

  /// Zpětné volání běží na hlavním vlákně (zdroj je v hlavní smyčce); musí být rychlé,
  /// proto se signál posílá dál asynchronně. Rozhodnutí o pohlcení Esc je synchronní.
  fileprivate func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
      if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
      // Puštění klávesy mohlo přijít, zatímco byl tap vypnutý: srovnat se skutečným stavem,
      // jinak by diktát „s drženou klávesou" běžel až do limitu 10 minut.
      let down = shortcut.isDown(flags: CGEventSource.flagsState(.combinedSessionState).rawValue)
      if down != triggerHeld {
        triggerHeld = down
        post(down ? .down : .up)
      }
    case .flagsChanged:
      let code = event.getIntegerValueField(.keyboardEventKeycode)
      if shortcut.matches(keyCode: code) {
        let down = shortcut.isDown(flags: event.flags.rawValue)
        if down != triggerHeld {
          triggerHeld = down
          post(down ? .down : .up)
        }
      } else if triggerHeld {
        post(.otherKey)
      }
    case .keyDown:
      let code = event.getIntegerValueField(.keyboardEventKeycode)
      let isEnter = Self.isEnter(code)
      if code == Int64(kVK_Escape) {
        if capturesEscape {
          post(.escape)
          return nil
        }
      } else if isEnter && swallowingEnter {
        // Opakování drženého Enteru po konci nahrávání.
        return nil
      } else if isEnter && capturesEnter {
        swallowingEnter = true
        post(.finishKey)
        return nil
      } else if triggerHeld {
        post(.otherKey)
      } else if isEnter {
        post(.enter)
      }
    case .keyUp:
      if swallowingEnter, Self.isEnter(event.getIntegerValueField(.keyboardEventKeycode)) {
        swallowingEnter = false
        return nil
      }
    default:
      break
    }
    return Unmanaged.passUnretained(event)
  }

  private static func isEnter(_ code: Int64) -> Bool {
    code == Int64(kVK_Return) || code == Int64(kVK_ANSI_KeypadEnter)
  }

  private func post(_ signal: Signal) {
    DispatchQueue.main.async { [weak self] in self?.onSignal?(signal) }
  }

  /// Je zapnutý bezpečný vstup (pole pro heslo)? Tehdy se nenahrává.
  static var secureInputActive: Bool { IsSecureEventInputEnabled() }

  /// Co dělá klávesa fn v systému (jen čtení, nic se nemění).
  static var fnKeyUsage: FnKeyUsage {
    let value = CFPreferencesCopyAppValue("AppleFnUsageType" as CFString, "com.apple.HIToolbox" as CFString)
    return FnKeyUsage(rawValue: (value as? NSNumber)?.intValue)
  }
}

private func fnMonitorCallback(
  proxy: CGEventTapProxy,
  type: CGEventType,
  event: CGEvent,
  refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
  guard let refcon else { return Unmanaged.passUnretained(event) }
  let monitor = Unmanaged<FnMonitor>.fromOpaque(refcon).takeUnretainedValue()
  return MainActor.assumeIsolated { monitor.handle(type: type, event: event) }
}
