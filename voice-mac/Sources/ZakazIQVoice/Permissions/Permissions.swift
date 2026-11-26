import AppKit
import ApplicationServices
import AVFoundation
import CoreGraphics
import IOKit.hid

/// Tři oprávnění, která diktování potřebuje (VO04 Fn a nahrávání, VO06 vložení).
enum PermissionKind: CaseIterable, Identifiable {
  case microphone
  case inputMonitoring
  case accessibility

  var id: Self { self }

  /// Názvy jako v Nastavení systému, ať je Kryštof najde.
  var title: String {
    switch self {
    case .microphone: return "Mikrofon"
    case .inputMonitoring: return "Sledování vstupu"
    case .accessibility: return "Zpřístupnění"
    }
  }

  var reason: String {
    switch self {
    case .microphone: return "Aby šlo diktovat."
    case .inputMonitoring: return "Aby fungovala klávesa Fn."
    case .accessibility: return "Aby se text vložil tam, kde píšete."
    }
  }

  fileprivate var settingsAnchor: String {
    switch self {
    case .microphone: return "Privacy_Microphone"
    case .inputMonitoring: return "Privacy_ListenEvent"
    case .accessibility: return "Privacy_Accessibility"
    }
  }
}

enum PermissionState: Equatable {
  case granted
  /// Systém se ještě neptal — tlačítko Povolit ukáže systémový dotaz.
  case notAsked
  /// Odmítnuto nebo vypnuto — změnit jde jen v Nastavení systému.
  case denied

  var label: String {
    switch self {
    case .granted: return "Povoleno"
    case .notAsked: return "Zatím nepovoleno"
    case .denied: return "Nepovoleno"
    }
  }
}

enum Permissions {
  static func state(_ kind: PermissionKind) -> PermissionState {
    switch kind {
    case .microphone:
      switch AVCaptureDevice.authorizationStatus(for: .audio) {
      case .authorized: return .granted
      case .notDetermined: return .notAsked
      default: return .denied
      }
    case .inputMonitoring:
      if CGPreflightListenEventAccess() { return .granted }
      return IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeDenied ? .denied : .notAsked
    case .accessibility:
      // Systém nerozliší „neptal se" a „vypnuto"; obojí vede do Nastavení.
      return AXIsProcessTrusted() ? .granted : .notAsked
    }
  }

  /// Požádá o oprávnění. Systémový dotaz se ukáže jen poprvé; potom (nebo po odmítnutí)
  /// otevře příslušné místo v Nastavení systému, jinak by se ukázaly dvě okna naráz.
  @MainActor
  static func request(_ kind: PermissionKind) async {
    if shouldOpenSettings(kind) { return openSettings(kind) }
    UserDefaults.standard.set(true, forKey: askedKey(kind))
    switch kind {
    case .microphone:
      _ = await AVCaptureDevice.requestAccess(for: .audio)
    case .inputMonitoring:
      _ = CGRequestListenEventAccess()
    case .accessibility:
      let prompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
      _ = AXIsProcessTrustedWithOptions([prompt: true] as CFDictionary)
    }
  }

  /// `true` = tlačítko má vést rovnou do Nastavení systému („Otevřít Nastavení").
  static func shouldOpenSettings(_ kind: PermissionKind) -> Bool {
    switch state(kind) {
    case .granted: return false
    case .denied: return true
    case .notAsked: return kind != .microphone && UserDefaults.standard.bool(forKey: askedKey(kind))
    }
  }

  private static func askedKey(_ kind: PermissionKind) -> String { "permissionAsked.\(kind)" }

  @MainActor
  static func openSettings(_ kind: PermissionKind) {
    let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(kind.settingsAnchor)")!
    NSWorkspace.shared.open(url)
  }

  static func snapshot() -> [PermissionKind: PermissionState] {
    Dictionary(uniqueKeysWithValues: PermissionKind.allCases.map { ($0, state($0)) })
  }
}
