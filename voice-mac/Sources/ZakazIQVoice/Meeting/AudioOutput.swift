import AppKit
import CoreAudio
import ZakazIQVoiceCore

/// Výchozí výstup zvuku: hraje schůzka do sluchátek, nebo z reproduktorů?
/// Jen čte vlastnosti zařízení v Core Audio, nic nenahrává a nechce oprávnění.
enum AudioOutput {
  static func currentRoute() -> OutputRoute {
    guard let device = defaultOutputDevice() else { return .unknown }
    guard let transport = uint32(device, kAudioDevicePropertyTransportType, scope: kAudioObjectPropertyScopeGlobal) else { return .unknown }
    let dataSource = uint32(device, kAudioDevicePropertyDataSource, scope: kAudioDevicePropertyScopeOutput)
    return OutputRoute.classify(transport: transport, dataSource: dataSource)
  }

  private static func defaultOutputDevice() -> AudioObjectID? {
    var device = AudioObjectID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device)
    return status == noErr && device != kAudioObjectUnknown ? device : nil
  }

  private static func uint32(_ device: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope) -> UInt32? {
    var address = AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    guard AudioObjectHasProperty(device, &address) else { return nil }
    var value: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    return AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr ? value : nil
  }
}

/// Odkazy do Nastavení systému pro kontrolu schůzky.
enum SystemSettingsLink {
  /// Soukromí › Nahrávání obrazovky a zvuku systému (tam je i „jen zvuk systému").
  static func openSystemAudio() {
    open("Privacy_ScreenCapture")
  }

  static func openMicrophone() {
    open("Privacy_Microphone")
  }

  static func open(_ action: MeetingCheck.Action) {
    switch action {
    case .openSystemAudioSettings: openSystemAudio()
    case .openMicrophoneSettings: openMicrophone()
    }
  }

  private static func open(_ anchor: String) {
    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") {
      NSWorkspace.shared.open(url)
    }
  }
}
