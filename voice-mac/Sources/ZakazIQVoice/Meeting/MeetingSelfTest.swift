#if DEBUG
import AppKit
import QuartzCore
import ZakazIQVoiceCore

/// Jen ladicí sestavení: `ZAKAZIQ_VOICE_MEETING_TEST=/složka` (a `ZAKAZIQ_VOICE_MEETING_SECONDS`)
/// nahraje zvuk počítače a mikrofon jako schůzku, hotové promluvy zapíše do složky
/// a do `vysledek.txt` (nic neposílá na server) a aplikace skončí.
@MainActor
enum MeetingSelfTest {
  static func runIfRequested() -> Bool {
    let env = ProcessInfo.processInfo.environment
    guard let path = env["ZAKAZIQ_VOICE_MEETING_TEST"], !path.isEmpty else { return false }
    let seconds = Double(env["ZAKAZIQ_VOICE_MEETING_SECONDS"] ?? "") ?? 8
    let dir = URL(fileURLWithPath: path, isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    final class Lines: @unchecked Sendable {
      var items: [String] = []
      let lock = NSLock()
      func add(_ line: String) { lock.lock(); items.append(line); lock.unlock() }
    }
    let lines = Lines()
    let log: @Sendable (String) -> Void = { lines.add($0) }

    let start = CACurrentMediaTime()
    let me = TrackRecorder(track: .me, directory: dir, meetingStart: start)
    let other = TrackRecorder(track: .other, directory: dir, meetingStart: start)
    var buffers = [MeetingTrack.me: 0, .other: 0]
    let counter = NSLock()
    for recorder in [me, other] {
      recorder.onTurn = { turn in log("promluva \(turn.track.rawValue) \(turn.idx) start \(turn.startMs) ms délka \(turn.durationMs) ms řeč \(turn.speechMs) ms") }
    }
    var mic: MicCapture?
    if #available(macOS 14.2, *) {
      let system = SystemAudioCapture()
      do {
        try system.start { buffer in
          counter.lock(); buffers[.other, default: 0] += 1; counter.unlock()
          other.append(buffer)
        }
        log("zvuk počítače: tap běží")
      } catch {
        log("zvuk počítače: chyba \(error)")
      }
      let capture = MicCapture()
      do {
        try capture.start { buffer in
          counter.lock(); buffers[.me, default: 0] += 1; counter.unlock()
          me.append(buffer)
        }
        mic = capture
        log("mikrofon: běží")
      } catch {
        log("mikrofon: chyba \(error)")
      }
      RunLoop.main.run(until: Date().addingTimeInterval(seconds))
      system.stop()
    } else {
      log("macOS pod 14.2")
    }
    mic?.stop()
    let group = DispatchGroup()
    for recorder in [me, other] {
      group.enter()
      recorder.finish { group.leave() }
    }
    while group.wait(timeout: .now()) == .timedOut { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    counter.lock()
    log("buffery mikrofon \(buffers[.me] ?? 0), zvuk počítače \(buffers[.other] ?? 0)")
    counter.unlock()
    lines.lock.lock()
    try? lines.items.joined(separator: "\n").write(to: dir.appendingPathComponent("vysledek.txt"), atomically: true, encoding: .utf8)
    lines.lock.unlock()
    return true
  }
}
#endif
