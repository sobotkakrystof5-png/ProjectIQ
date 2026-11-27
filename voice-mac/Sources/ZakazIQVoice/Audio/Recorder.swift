import AVFoundation
import Foundation
import ZakazIQVoiceCore

/// Nahrávání diktátu (VO04): AAC v m4a, 16 kHz, mono, ~32 kbps, měření každých 50 ms.
///
/// Nahrávka leží v `~/Library/Application Support/ZakazIQ Voice/rec/` (složka 0700,
/// soubor 0600) jen do odeslání; po něm, po zrušení, nebo nejpozději po 24 h ve frontě
/// se maže (VO06, D-V7).
@MainActor
final class Recorder: NSObject {
  struct Take {
    let url: URL
    let durationMs: Int
    let speechMs: Int
  }

  /// Hlasitost 0…1 každých 50 ms (lišta, dílky).
  var onLevel: ((Double) -> Void)?
  /// Tik každých 50 ms během nahrávání (hlídání prahů v `DictationTrigger`).
  var onTick: (() -> Void)?
  /// Úsek nad prahem řeči (volá se před `onTick`, ať tik vidí čerstvý čas řeči).
  var onSpeech: (() -> Void)?

  private var recorder: AVAudioRecorder?
  private var meter = SpeechMeter()
  private var timer: Timer?

  var isRecording: Bool { recorder?.isRecording == true }

  static var directory: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("ZakazIQ Voice", isDirectory: true).appendingPathComponent("rec", isDirectory: true)
  }

  static let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 16_000,
    AVNumberOfChannelsKey: 1,
    AVEncoderBitRateKey: 32_000,
    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
  ]

  /// Začne nahrávat hned (připraví a spustí v jednom kroku). `false` = mikrofon nejde.
  func start(id: UUID) -> Bool {
    stopTimer()
    recorder?.stop()
    recorder = nil
    meter = SpeechMeter()
    do {
      let dir = Self.directory
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
      let url = dir.appendingPathComponent("\(id.uuidString.lowercased()).m4a")
      let rec = try AVAudioRecorder(url: url, settings: Self.settings)
      rec.isMeteringEnabled = true
      guard rec.prepareToRecord() else { return false }
      try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
      guard rec.record() else { return false }
      recorder = rec
      startTimer()
      return true
    } catch {
      recorder = nil
      return false
    }
  }

  /// Ukončí nahrávku a vrátí ji k odeslání.
  func stop() -> Take? {
    guard let rec = recorder else { return nil }
    let duration = rec.currentTime
    rec.stop()
    stopTimer()
    recorder = nil
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: rec.url.path)
    return Take(url: rec.url, durationMs: Int((duration * 1000).rounded()), speechMs: meter.speechMs)
  }

  /// Zastaví a nahrávku hned smaže (zrušeno, příliš krátké).
  func discard() {
    guard let rec = recorder else { return }
    rec.stop()
    stopTimer()
    recorder = nil
    rec.deleteRecording()
  }

  private func startTimer() {
    let interval = Double(SpeechMeter.intervalMs) / 1000
    let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.sample() }
    }
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer
  }

  private func stopTimer() {
    timer?.invalidate()
    timer = nil
  }

  private func sample() {
    guard let rec = recorder, rec.isRecording else { return }
    rec.updateMeters()
    let power = rec.averagePower(forChannel: 0)
    meter.add(averagePowerDb: power)
    onLevel?(SpeechMeter.normalized(power))
    if power > SpeechMeter.speechThresholdDb { onSpeech?() }
    onTick?()
  }

  /// Úklid po pádu: nahrávky starší než `maxAge`, které nejsou ve frontě.
  static func removeStale(olderThan maxAge: TimeInterval, keeping keep: Set<String>) {
    let fm = FileManager.default
    guard let files = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
    let limit = Date().addingTimeInterval(-maxAge)
    for file in files where file.pathExtension == "m4a" && !keep.contains(file.path) {
      let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
      if modified < limit { try? fm.removeItem(at: file) }
    }
  }
}
