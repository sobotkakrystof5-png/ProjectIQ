import AppKit
import Combine
import ZakazIQVoiceCore

/// Stav lišty pro `FlowBarView`. Plní ho `DictationController`, kreslí `FlowBarPanel`.
@MainActor
final class BarModel: ObservableObject {
  @Published private(set) var stage: BarStage = .idle
  @Published var hovering = false
  /// Posledních 16 úrovní hlasitosti (0…1) pro vlnky, nejnovější vpravo.
  @Published private(set) var levels: [Double] = Array(repeating: 0, count: BarModel.waveCount)
  @Published private(set) var elapsed: TimeInterval = 0
  @Published private(set) var reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
  @Published var shortcut: DictationShortcut = .fn
  @Published var showWhenIdle = true
  /// Probíhá schůzka (R-151): lišta se v klidu vrací do stavu schůzky, ne do klidu.
  @Published private(set) var meetingActive = false
  @Published private(set) var meetingElapsed: TimeInterval = 0
  @Published private(set) var meetingLevel: Double = 0

  static let waveCount = 16

  /// Klik na pilulku (klid = diktát bez držení, během něj = Hotovo, hláška = zkopírovat).
  var onClick: (() -> Void)?
  var onCancel: (() -> Void)?
  var onCopy: ((String) -> Void)?
  /// Klik na hlášku bez nabídky kopírování (plán: „klik otevře Historii").
  var onOpenHistory: (() -> Void)?
  /// Tlačítko Ukončit na liště během schůzky.
  var onStopMeeting: (() -> Void)?

  private var messageTask: Task<Void, Never>?
  private var observer: NSObjectProtocol?

  init() {
    observer = NotificationCenter.default.addObserver(
      forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        self?.reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
      }
    }
  }

  var level: Double { levels.last ?? 0 }

  /// Velikost pilulky teď (kvůli najetí myší a umístění).
  var pillSize: CGSize { BarLayout.pillSize(for: stage, hovering: hovering) }

  /// Je lišta vidět? V klidu podle volby „Ukazovat lištu v klidu".
  var isVisible: Bool {
    switch stage {
    case .hidden: return false
    case .idle: return showWhenIdle
    default: return true
    }
  }

  // MARK: Přechody

  func listening(_ mode: DictationMode) {
    cancelMessage()
    stage = .listening(mode)
  }

  func processing() {
    cancelMessage()
    stage = .processing
  }

  func idle() {
    cancelMessage()
    stage = rest
    resetLevels()
  }

  /// Kam se lišta vrací po hlášce: do klidu, nebo do schůzky.
  private var rest: BarStage { meetingActive ? .meeting : .idle }

  func startMeeting() {
    meetingActive = true
    meetingElapsed = 0
    cancelMessage()
    stage = .meeting
  }

  func meetingTick(elapsed: TimeInterval) {
    meetingElapsed = elapsed
  }

  func meetingLevel(_ level: Double) {
    meetingLevel = level
  }

  func endMeeting() {
    meetingActive = false
    meetingLevel = 0
    if stage == .meeting { stage = .idle }
  }

  func stopMeeting() { onStopMeeting?() }

  /// Hotovo: dílky bliknou a lišta se vrátí do klidu.
  func done() {
    cancelMessage()
    stage = .done
    resetLevels()
    messageTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled, let self else { return }
      self.stage = self.rest
    }
  }

  func show(_ message: BarMessage) {
    cancelMessage()
    stage = .message(message)
    resetLevels()
    messageTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(message.duration))
      guard !Task.isCancelled, let self else { return }
      self.stage = self.rest
    }
  }

  /// Hláška během nahrávání (9:30): ukáže se a nahrávání pokračuje.
  func flash(_ message: BarMessage, returningTo stage: BarStage) {
    cancelMessage()
    self.stage = .message(message)
    messageTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(message.duration))
      guard !Task.isCancelled, let self, case .message = self.stage else { return }
      self.stage = stage
    }
  }

  func push(level: Double, elapsed: TimeInterval) {
    levels.removeFirst()
    levels.append(level)
    self.elapsed = elapsed
  }

  func click() {
    if stage == .meeting { return }
    if case .message(let message) = stage {
      if let text = message.copyText {
        onCopy?(text)
      } else {
        idle()
        onOpenHistory?()
      }
      return
    }
    onClick?()
  }

  func cancel() { onCancel?() }

  private func resetLevels() {
    levels = Array(repeating: 0, count: Self.waveCount)
    elapsed = 0
  }

  private func cancelMessage() {
    messageTask?.cancel()
    messageTask = nil
  }
}
