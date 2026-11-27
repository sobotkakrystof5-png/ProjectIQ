import AVFoundation
import CoreAudio

/// Zvuk počítače (druhá strana hovoru) přes Core Audio tap (macOS 14.2+, R-151).
///
/// Tap zachytí všechno, co jde do výstupu (Meet v prohlížeči, Zoom, WhatsApp), soukromé
/// agregované zařízení ho doručuje po bufferech. Zvuk se dál normálně přehrává (`unmuted`).
/// Poprvé se macOS zeptá na oprávnění Nahrávání zvuku systému (`NSAudioCaptureUsageDescription`).
@available(macOS 14.2, *)
final class SystemAudioCapture: @unchecked Sendable {
  enum Failure: Error {
    case tap(OSStatus)
    case format
    case outputDevice
    case aggregate(OSStatus)
    case ioProc(OSStatus)
    case start(OSStatus)
  }

  private var tapID = AudioObjectID(kAudioObjectUnknown)
  private var aggregateID = AudioObjectID(kAudioObjectUnknown)
  private var procID: AudioDeviceIOProcID?
  private let queue = DispatchQueue(label: "cz.zakaziq.voice.meeting.system", qos: .userInitiated)

  /// `onBuffer` běží na vlastní frontě; buffer platí jen během volání (zvuk se musí hned zkopírovat).
  func start(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws {
    let description = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
    description.uuid = UUID()
    description.name = "ZakazIQ Voice schůzka"
    description.isPrivate = true
    description.muteBehavior = .unmuted

    var tap = AudioObjectID(kAudioObjectUnknown)
    var status = AudioHardwareCreateProcessTap(description, &tap)
    guard status == noErr else { throw Failure.tap(status) }
    tapID = tap

    var asbd = AudioStreamBasicDescription()
    var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioTapPropertyFormat,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    status = AudioObjectGetPropertyData(tap, &address, 0, nil, &size, &asbd)
    guard status == noErr, let format = AVAudioFormat(streamDescription: &asbd) else {
      stop()
      throw Failure.format
    }

    guard let outputUID = Self.defaultOutputUID() else {
      stop()
      throw Failure.outputDevice
    }
    let aggregate: [String: Any] = [
      kAudioAggregateDeviceNameKey: "ZakazIQ Voice schůzka",
      kAudioAggregateDeviceUIDKey: UUID().uuidString,
      kAudioAggregateDeviceMainSubDeviceKey: outputUID,
      kAudioAggregateDeviceIsPrivateKey: true,
      kAudioAggregateDeviceIsStackedKey: false,
      kAudioAggregateDeviceTapAutoStartKey: true,
      kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
      kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: description.uuid.uuidString]],
    ]
    var device = AudioObjectID(kAudioObjectUnknown)
    status = AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &device)
    guard status == noErr else {
      stop()
      throw Failure.aggregate(status)
    }
    aggregateID = device

    var proc: AudioDeviceIOProcID?
    status = AudioDeviceCreateIOProcIDWithBlock(&proc, device, queue) { _, input, _, _, _ in
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: input, deallocator: nil) else { return }
      onBuffer(buffer)
    }
    guard status == noErr, let proc else {
      stop()
      throw Failure.ioProc(status)
    }
    procID = proc
    status = AudioDeviceStart(device, proc)
    guard status == noErr else {
      stop()
      throw Failure.start(status)
    }
  }

  func stop() {
    if aggregateID != kAudioObjectUnknown {
      if let procID {
        AudioDeviceStop(aggregateID, procID)
        AudioDeviceDestroyIOProcID(aggregateID, procID)
      }
      AudioHardwareDestroyAggregateDevice(aggregateID)
    }
    if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
    procID = nil
    aggregateID = AudioObjectID(kAudioObjectUnknown)
    tapID = AudioObjectID(kAudioObjectUnknown)
  }

  /// UID výchozího výstupu (reproduktory, sluchátka), na kterém tap běží.
  static func defaultOutputUID() -> String? {
    var device = AudioObjectID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var address = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr else { return nil }
    var uid: Unmanaged<CFString>?
    size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    address.mSelector = kAudioDevicePropertyDeviceUID
    guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &uid) == noErr, let uid else { return nil }
    return uid.takeRetainedValue() as String
  }
}

/// Mikrofon (Kryštof) přes `AVAudioEngine`, ve formátu vstupu, jak ho dává systém.
final class MicCapture: @unchecked Sendable {
  enum Failure: Error { case noInput }

  private let engine = AVAudioEngine()

  func start(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else { throw Failure.noInput }
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in onBuffer(buffer) }
    engine.prepare()
    try engine.start()
  }

  func stop() {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
  }
}
