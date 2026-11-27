import AVFoundation
import QuartzCore
import ZakazIQVoiceCore

/// Hotová promluva jedné strany: soubor m4a a kde ve schůzce leží.
struct RecordedTurn: Sendable {
  let track: MeetingTrack
  let idx: Int
  let startMs: Int
  let durationMs: Int
  let speechMs: Int
  let url: URL
}

/// Jedna stopa schůzky (R-151): převede zvuk na 16 kHz mono, měří hlasitost po 50 ms,
/// `TurnSegmenter` rozhodne, kde promluva začíná a končí, a hotovou promluvu zapíše
/// do m4a. V paměti drží jen rozpracovanou promluvu a 300 ms před ní.
///
/// `append` volá zvukové vlákno; převod proběhne hned (buffer platí jen během volání),
/// zbytek na vlastní sériové frontě. `onTurn` a `onLevel` běží na té frontě.
final class TrackRecorder: @unchecked Sendable {
  static let sampleRate: Double = 16_000
  static let samplesPerMs = 16
  static let frameSamples = TurnSegmenter.frameMs * samplesPerMs
  /// Stejný formát jako diktát: AAC v m4a, 16 kHz, mono, ~32 kbit/s.
  static let fileSettings: [String: Any] = [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 16_000,
    AVNumberOfChannelsKey: 1,
    AVEncoderBitRateKey: 32_000,
    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
  ]

  let track: MeetingTrack
  var onTurn: ((RecordedTurn) -> Void)?
  var onLevel: ((Double) -> Void)?

  private let directory: URL
  private let meetingStart: CFTimeInterval
  private let queue: DispatchQueue
  private let outFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!

  // Jen ze zvukového vlákna (převod).
  private var converter: AVAudioConverter?
  private var converterInput: AVAudioFormat?

  // Jen z `queue`.
  private var segmenter = TurnSegmenter()
  private var pendingFrame: [Float] = []
  private var samples: [Float] = []
  private var samplesStartMs = 0
  private var timeMs = 0
  private var offsetMs: Int?
  private var nextIdx = 0
  private var finished = false

  init(track: MeetingTrack, directory: URL, meetingStart: CFTimeInterval) {
    self.track = track
    self.directory = directory
    self.meetingStart = meetingStart
    queue = DispatchQueue(label: "cz.zakaziq.voice.meeting.\(track.rawValue)", qos: .userInitiated)
  }

  /// Ze zvukového vlákna: převést na 16 kHz mono a předat frontě.
  func append(_ buffer: AVAudioPCMBuffer) {
    let arrived = CACurrentMediaTime()
    let chunk = convert(buffer)
    guard !chunk.isEmpty else { return }
    let chunkMs = chunk.count / Self.samplesPerMs
    queue.async { [weak self] in
      guard let self, !self.finished else { return }
      if self.offsetMs == nil {
        // Stopy začínají o pár set ms jinak; čas promluv se počítá od začátku schůzky.
        self.offsetMs = max(0, Int(((arrived - self.meetingStart) * 1000).rounded()) - chunkMs)
      }
      self.process(chunk)
    }
  }

  /// Konec schůzky: dopsat rozpracovanou promluvu. `done` běží na hlavním vlákně.
  func finish(done: @escaping @Sendable () -> Void) {
    queue.async { [weak self] in
      guard let self else { return DispatchQueue.main.async(execute: done) }
      if !self.finished {
        self.finished = true
        if let turn = self.segmenter.flush(at: self.timeMs) { self.emit(turn) }
        self.samples = []
      }
      DispatchQueue.main.async(execute: done)
    }
  }

  private func convert(_ buffer: AVAudioPCMBuffer) -> [Float] {
    if converter == nil || converterInput != buffer.format {
      converter = AVAudioConverter(from: buffer.format, to: outFormat)
      converter?.downmix = true
      converterInput = buffer.format
    }
    guard let converter, buffer.frameLength > 0 else { return [] }
    let ratio = outFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return [] }
    var consumed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if consumed {
        status.pointee = .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    guard error == nil, let data = out.floatChannelData, out.frameLength > 0 else { return [] }
    return Array(UnsafeBufferPointer(start: data[0], count: Int(out.frameLength)))
  }

  private func process(_ chunk: [Float]) {
    pendingFrame.append(contentsOf: chunk)
    while pendingFrame.count >= Self.frameSamples {
      let frame = pendingFrame[..<Self.frameSamples]
      let db = TurnSegmenter.rmsDb(frame)
      samples.append(contentsOf: frame)
      pendingFrame.removeFirst(Self.frameSamples)
      let at = timeMs
      timeMs += TurnSegmenter.frameMs
      onLevel?(SpeechMeter.normalized(db))
      if let turn = segmenter.add(frameAt: at, db: db) { emit(turn) }
      if !segmenter.isInTurn { trim(keepFrom: timeMs - TurnSegmenter.preRollMs) }
    }
  }

  /// Zahodí zvuk před `ms` (mimo promluvu stačí 300 ms na náběh další).
  private func trim(keepFrom ms: Int) {
    let drop = (ms - samplesStartMs) * Self.samplesPerMs
    guard drop > 0 else { return }
    samples.removeFirst(min(drop, samples.count))
    samplesStartMs = ms
  }

  private func emit(_ turn: TurnSegmenter.Turn) {
    let from = max(0, (turn.startMs - samplesStartMs) * Self.samplesPerMs)
    let to = min(samples.count, (turn.endMs - samplesStartMs) * Self.samplesPerMs)
    defer { trim(keepFrom: turn.endMs) }
    guard to > from else { return }
    let idx = nextIdx
    nextIdx += 1
    let url = directory.appendingPathComponent("\(track.rawValue)-\(idx).m4a")
    do {
      try Self.write(samples[from..<to], to: url)
    } catch {
      return
    }
    let offset = offsetMs ?? 0
    onTurn?(RecordedTurn(
      track: track,
      idx: idx,
      startMs: turn.startMs + offset,
      durationMs: (to - from) / Self.samplesPerMs,
      speechMs: turn.speechMs,
      url: url
    ))
  }

  static func write(_ samples: ArraySlice<Float>, to url: URL) throws {
    let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)!
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
          let channel = buffer.floatChannelData?[0]
    else { throw CocoaError(.fileWriteUnknown) }
    buffer.frameLength = AVAudioFrameCount(samples.count)
    samples.withUnsafeBufferPointer { src in
      if let base = src.baseAddress { channel.update(from: base, count: samples.count) }
    }
    // Soubor se zavře, až `file` zanikne na konci téhle funkce.
    let file = try AVAudioFile(forWriting: url, settings: fileSettings, commonFormat: .pcmFormatFloat32, interleaved: false)
    try file.write(from: buffer)
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
  }
}
