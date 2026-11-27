import Foundation
import ZakazIQVoiceCore

/// Fronta promluv ke schůzce (R-151): posílá je na server už během schůzky, dvě naráz,
/// po chybě sítě zkouší znovu (5, 10, 20… s). Promluvy čekají, dokud server schůzku
/// nezaložil. Odeslaný soubor se hned smaže.
@MainActor
final class MeetingUploader {
  struct Item {
    let meetingId: UUID
    let meta: MeetingTurnMeta
    let url: URL
    var attempts = 0
    var nextAttempt = Date()
  }

  static let maxParallel = 2

  private let api: () -> VoiceAPI?
  private var items: [Item] = []
  private var running = 0
  private var created: Set<UUID> = []
  private var wakeTask: Task<Void, Never>?
  /// Promluvy, které server odmítl natrvalo (vadný soubor, schůzka neexistuje).
  private(set) var dropped = 0
  var onChange: (() -> Void)?

  init(api: @escaping () -> VoiceAPI?) {
    self.api = api
  }

  var pendingCount: Int { items.count + running }

  func markCreated(_ id: UUID) {
    created.insert(id)
    pump()
  }

  func enqueue(_ turn: RecordedTurn, meetingId: UUID) {
    let meta = MeetingTurnMeta(track: turn.track, idx: turn.idx, startMs: turn.startMs, durationMs: turn.durationMs, speechMs: turn.speechMs)
    items.append(Item(meetingId: meetingId, meta: meta, url: turn.url))
    onChange?()
    pump()
  }

  /// Počká, až fronta odejde, nejdéle `timeout`. `true` = všechno odešlo.
  func drain(timeout: TimeInterval) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while pendingCount > 0, Date() < deadline {
      pump()
      try? await Task.sleep(for: .milliseconds(300))
    }
    return pendingCount == 0
  }

  private func pump() {
    let now = Date()
    while running < Self.maxParallel,
          let index = items.firstIndex(where: { created.contains($0.meetingId) && $0.nextAttempt <= now }) {
      let item = items.remove(at: index)
      running += 1
      Task { await self.send(item) }
    }
    scheduleWake()
  }

  private func scheduleWake() {
    wakeTask?.cancel()
    guard let next = items.filter({ created.contains($0.meetingId) }).map(\.nextAttempt).min() else { return }
    let delay = max(0.2, next.timeIntervalSinceNow)
    wakeTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(delay))
      guard !Task.isCancelled else { return }
      self?.pump()
    }
  }

  private func send(_ item: Item) async {
    defer {
      running -= 1
      onChange?()
      pump()
    }
    guard let audio = try? Data(contentsOf: item.url) else {
      dropped += 1
      return
    }
    guard let api = api() else { return retry(item, after: nil) }
    switch await api.sendTurn(meetingId: item.meetingId, meta: item.meta, audio: audio) {
    case .success:
      try? FileManager.default.removeItem(at: item.url)
    case .failure(let error):
      if error.isRetryable || { if case .server(_, 503) = error { return true }; return false }() {
        retry(item, after: nil)
      } else {
        try? FileManager.default.removeItem(at: item.url)
        dropped += 1
      }
    }
  }

  private func retry(_ item: Item, after: TimeInterval?) {
    var next = item
    next.attempts += 1
    next.nextAttempt = Date().addingTimeInterval(RetryPolicy.delay(attempts: next.attempts, retryAfter: after))
    items.append(next)
  }
}
