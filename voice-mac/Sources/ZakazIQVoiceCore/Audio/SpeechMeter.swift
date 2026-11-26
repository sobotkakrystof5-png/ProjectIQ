import Foundation

/// Čas řeči a hlasitost z měření nahrávky (každých 50 ms).
///
/// `speechMs` = součet úseků nad prahem; server podle něj pozná ticho (G1: pod 300 ms
/// se nepřepisuje) a počítá rychlost diktování.
public struct SpeechMeter: Sendable, Equatable {
  /// Práh řeči v dB (průměrný výkon z `AVAudioRecorder`, −160…0).
  public static let speechThresholdDb: Float = -40
  /// Jak často se měří.
  public static let intervalMs = 50

  public private(set) var speechMs = 0
  public private(set) var samples = 0

  public init() {}

  public mutating func add(averagePowerDb: Float) {
    samples += 1
    if averagePowerDb > Self.speechThresholdDb { speechMs += Self.intervalMs }
  }

  /// Čas řeči z celé řady měření (testy, přepočet).
  public static func speechMs(levelsDb: [Float]) -> Int {
    var meter = SpeechMeter()
    levelsDb.forEach { meter.add(averagePowerDb: $0) }
    return meter.speechMs
  }

  /// Hlasitost 0…1 pro vlnky a dílky: −50 dB a méně = 0, −10 dB a víc = 1.
  public static func normalized(_ db: Float) -> Double {
    guard db.isFinite else { return 0 }
    return min(1, max(0, Double(db + 50) / 40))
  }

  /// Jas čtyř dílků podle pásma hlasitosti, po směru hodinových ručiček od levého horního.
  /// Pásmo 0 = všechny tlumené, pásmo 4 = všechny svítí.
  public static func tileBrightness(level: Double) -> [Double] {
    let band = Int((min(1, max(0, level)) * 4).rounded(.down))
    return (0..<4).map { $0 < band ? 1 : dimTile }
  }

  public static let dimTile = 0.35
}
