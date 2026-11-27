import Foundation

/// Stopa schůzky: `me` = mikrofon (Kryštof), `other` = zvuk počítače (druhá strana).
public enum MeetingTrack: String, Codable, Sendable, CaseIterable {
  case me
  case other
}

/// Dělení jedné stopy schůzky na promluvy podle pauz (R-151). Čistá logika: dostává
/// rámce po 50 ms (čas od začátku schůzky a hlasitost v dB), vrací hotové promluvy.
///
/// - Promluva začne prvním rámcem nad prahem řeči (s 300 ms náběhem před ním).
/// - Skončí po 1,2 s ticha (+ 300 ms dozvuku za poslední řečí).
/// - Po 45 s se utne v první krátké pauze (300 ms), nejpozději v 60 s natvrdo; po utnutí
///   uprostřed řeči hned začne další promluva (bez náběhu, ať se nic neopakuje).
/// - Promluva s méně než 300 ms řeči se zahodí (kašel, klik, šum).
public struct TurnSegmenter: Sendable, Equatable {
  public struct Turn: Equatable, Sendable {
    public let startMs: Int
    public let endMs: Int
    public let speechMs: Int

    public var durationMs: Int { endMs - startMs }
  }

  public static let frameMs = 50
  public static let preRollMs = 300
  public static let postRollMs = 300
  public static let endSilenceMs = 1_200
  public static let softMaxMs = 45_000
  public static let shortPauseMs = 300
  public static let hardMaxMs = 60_000
  public static let minSpeechMs = 300
  public static let thresholdDb: Float = SpeechMeter.speechThresholdDb

  private struct Open: Equatable, Sendable {
    var start: Int
    var lastSpeechEnd: Int
    var speechMs: Int
  }

  private var open: Open?

  public init() {}

  public var isInTurn: Bool { open != nil }
  /// Začátek rozpracované promluvy (kvůli tomu, kolik zvuku si držet).
  public var openStartMs: Int? { open?.start }

  /// Jeden rámec 50 ms začínající v `timeMs`. Vrací promluvu, která tímhle rámcem skončila.
  public mutating func add(frameAt timeMs: Int, db: Float) -> Turn? {
    let frameEnd = timeMs + Self.frameMs
    let speech = db.isFinite && db > Self.thresholdDb
    guard var turn = open else {
      if speech { open = Open(start: max(0, timeMs - Self.preRollMs), lastSpeechEnd: frameEnd, speechMs: Self.frameMs) }
      return nil
    }
    if speech {
      turn.lastSpeechEnd = frameEnd
      turn.speechMs += Self.frameMs
    }
    let silent = frameEnd - turn.lastSpeechEnd
    let length = frameEnd - turn.start

    if silent >= Self.endSilenceMs || (length >= Self.softMaxMs && silent >= Self.shortPauseMs) {
      open = nil
      return finished(turn, end: min(frameEnd, turn.lastSpeechEnd + Self.postRollMs))
    }
    if length >= Self.hardMaxMs {
      // Natvrdo uprostřed řeči: další promluva navazuje přesně tam, kde tahle skončila.
      open = speech ? Open(start: frameEnd, lastSpeechEnd: frameEnd, speechMs: 0) : nil
      return finished(turn, end: frameEnd)
    }
    open = turn
    return nil
  }

  /// Konec schůzky: rozpracovaná promluva skončí v `timeMs`.
  public mutating func flush(at timeMs: Int) -> Turn? {
    guard let turn = open else { return nil }
    open = nil
    return finished(turn, end: min(timeMs, turn.lastSpeechEnd + Self.postRollMs))
  }

  private func finished(_ turn: Open, end: Int) -> Turn? {
    guard turn.speechMs >= Self.minSpeechMs, end > turn.start else { return nil }
    return Turn(startMs: turn.start, endMs: end, speechMs: turn.speechMs)
  }

  /// Hlasitost rámce v dB (RMS, −160 pro ticho), stejná stupnice jako `AVAudioRecorder`.
  public static func rmsDb(_ samples: ArraySlice<Float>) -> Float {
    guard !samples.isEmpty else { return -160 }
    var sum: Float = 0
    for s in samples { sum += s * s }
    let rms = (sum / Float(samples.count)).squareRoot()
    return rms > 0 ? max(-160, 20 * log10(rms)) : -160
  }
}

/// Limity schůzky (R-151): nejvýš 2 hodiny, upozornění 5 minut předem.
public enum MeetingLimits {
  public static let maxDuration: TimeInterval = 2 * 3600
  public static let warnBefore: TimeInterval = 5 * 60
}
