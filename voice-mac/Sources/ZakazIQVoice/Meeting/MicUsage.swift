import AppKit
import ApplicationServices
import CoreAudio

/// Kdo právě bere zvuk z mikrofonu (R-152). Core Audio zná každý proces se zvukem a ví,
/// jestli zrovna nahrává; nepotřebuje k tomu žádné oprávnění a nic se tím nenahrává.
enum MicUsage {
  struct Process: Equatable {
    let bundleId: String
    let pid: pid_t
  }

  /// Procesy, které teď mají otevřený vstup z mikrofonu.
  static func inputProcesses() -> [Process] {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyProcessObjectList,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    let system = AudioObjectID(kAudioObjectSystemObject)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr, size > 0 else { return [] }
    var objects = [AudioObjectID](repeating: kAudioObjectUnknown, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &objects) == noErr else { return [] }
    return objects.compactMap { object in
      guard isRunningInput(object), let bundleId = bundleId(object), !bundleId.isEmpty else { return nil }
      return Process(bundleId: bundleId, pid: pid(object))
    }
  }

  private static func isRunningInput(_ object: AudioObjectID) -> Bool {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioProcessPropertyIsRunningInput,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    var value: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr && value != 0
  }

  private static func pid(_ object: AudioObjectID) -> pid_t {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioProcessPropertyPID,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    var value: pid_t = 0
    var size = UInt32(MemoryLayout<pid_t>.size)
    return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr ? value : 0
  }

  private static func bundleId(_ object: AudioObjectID) -> String? {
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioProcessPropertyBundleID,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr, let value else { return nil }
    return value.takeRetainedValue() as String
  }
}

/// Názvy oken aplikace přes Zpřístupnění (stejné oprávnění jako vkládání textu). Název okna
/// prohlížeče je otevřená karta, podle něj se pozná Meet nebo Teams. Bez oprávnění nic.
enum WindowTitles {
  static func titles(pid: pid_t, limit: Int = 20) -> [String] {
    guard AXIsProcessTrusted(), pid > 0 else { return [] }
    let app = AXUIElementCreateApplication(pid)
    // Zaseknutá aplikace nesmí zdržet hlídání hovorů.
    AXUIElementSetMessagingTimeout(app, 0.5)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
          let windows = value as? [AXUIElement]
    else { return [] }
    return windows.prefix(limit).compactMap { window in
      var title: CFTypeRef?
      guard AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title) == .success else { return nil }
      return title as? String
    }
  }
}
