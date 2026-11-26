import AppKit
import AVFoundation
import Combine
import ZakazIQVoiceCore

/// Aplikace vpředu ve chvíli stisku (kam se bude vkládat).
struct FrontApp: Equatable {
  let bundleId: String?
  let name: String?
  let pid: pid_t

  static func current() -> FrontApp? {
    guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
    return FrontApp(bundleId: app.bundleIdentifier, name: app.localizedName, pid: app.processIdentifier)
  }
}

/// Jeden diktát od stisku po vložení.
struct DictationContext {
  let id: UUID
  let startedAt: Date
  let startedUptime: TimeInterval
  let app: FrontApp?
  var mode: DictationMode = .hold
}

/// Řadič diktátu: zkratka → `DictationTrigger` → nahrávání → lišta (VO04, VO05).
@MainActor
final class DictationController: ObservableObject {
  enum Phase: Equatable {
    case idle
    case recording
    case processing
  }

  @Published private(set) var phase: Phase = .idle
  /// Poslední hláška (i do menu).
  @Published private(set) var notice: String?
  /// Zkratka běží (jsou oprávnění)?
  @Published private(set) var hotkeyReady = false
  /// Poslední hotová nahrávka (odeslání přidá VO06).
  @Published private(set) var lastTake: Recorder.Take?

  let bar = BarModel()

  private let prefs: Preferences
  private let monitor = FnMonitor()
  private let recorder = Recorder()
  private var trigger = DictationTrigger()
  private var context: DictationContext?
  private var noticeTask: Task<Void, Never>?

  init(prefs: Preferences = Preferences()) {
    self.prefs = prefs
    monitor.shortcut = prefs.shortcut
    monitor.onSignal = { [weak self] signal in self?.handle(signal) }
    recorder.onTick = { [weak self] in self?.send(.tick) }
    recorder.onLevel = { [weak self] level in self?.pushLevel(level) }
    bar.shortcut = prefs.shortcut
    bar.showWhenIdle = prefs.showBarWhenIdle
    bar.onClick = { [weak self] in self?.toggleFromMenu() }
    bar.onCancel = { [weak self] in self?.send(.barCancel) }
    bar.onCopy = { text in Self.copyToPasteboard(text) }
  }

  var shortcut: DictationShortcut { prefs.shortcut }
  var showBarWhenIdle: Bool { prefs.showBarWhenIdle }

  func setShortcut(_ shortcut: DictationShortcut) {
    prefs.shortcut = shortcut
    monitor.shortcut = shortcut
    bar.shortcut = shortcut
  }

  func setShowBarWhenIdle(_ value: Bool) {
    prefs.showBarWhenIdle = value
    bar.showWhenIdle = value
  }

  /// Zkusí zapnout zachytávání zkratky; volá se při startu a po změně oprávnění.
  func startHotkey() {
    hotkeyReady = monitor.start()
  }

  /// Položka menu Diktovat a klik na lištu.
  func toggleFromMenu() {
    send(.barClick(secureInput: FnMonitor.secureInputActive))
  }

  #if DEBUG
  /// Jen ladění vzhledu lišty: stav zpracování na 3 s.
  func debugShowProcessing() {
    bar.processing()
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(3))
      self?.bar.done()
    }
  }
  #endif

  // MARK: Události

  private func handle(_ signal: FnMonitor.Signal) {
    switch signal {
    case .down: send(.keyDown(secureInput: FnMonitor.secureInputActive))
    case .up: send(.keyUp)
    case .otherKey: send(.otherKey)
    case .escape: send(.escape)
    }
  }

  private func send(_ event: TriggerEvent) {
    let now = ProcessInfo.processInfo.systemUptime
    let actions = trigger.handle(event, at: now)
    for action in actions { perform(action) }
    monitor.capturesEscape = trigger.capturesEscape
  }

  private func perform(_ action: TriggerAction) {
    switch action {
    case .startRecording:
      startRecording()
    case .showListening(let mode):
      context?.mode = mode
      phase = .recording
      bar.listening(mode)
    case .finish(let mode):
      context?.mode = mode
      finish()
    case .discard:
      recorder.discard()
      context = nil
      phase = .idle
      bar.idle()
    case .cancel:
      recorder.discard()
      context = nil
      phase = .idle
      bar.idle()
    case .abandon:
      break
    case .refuseSecureInput:
      show(BarMessage(VoiceMessages.secureInput))
    case .warnLong:
      if case .listening(let mode) = bar.stage {
        bar.flash(BarMessage(VoiceMessages.longRecording), returningTo: .listening(mode))
      }
    }
  }

  private func startRecording() {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      break
    case .notDetermined:
      trigger.reset()
      Task { _ = await AVCaptureDevice.requestAccess(for: .audio) }
      show(BarMessage(VoiceMessages.microphoneAsk))
      return
    default:
      trigger.reset()
      show(BarMessage(VoiceMessages.microphoneDenied, tone: .error))
      return
    }
    let id = UUID()
    guard recorder.start(id: id) else {
      trigger.reset()
      show(BarMessage(VoiceMessages.microphoneFailed, tone: .error))
      return
    }
    context = DictationContext(id: id, startedAt: Date(), startedUptime: ProcessInfo.processInfo.systemUptime, app: FrontApp.current())
  }

  private func pushLevel(_ level: Double) {
    guard let context else { return }
    bar.push(level: level, elapsed: ProcessInfo.processInfo.systemUptime - context.startedUptime)
  }

  private func finish() {
    lastTake = recorder.stop()
    context = nil
    phase = .idle
    bar.done()
    send(.processingDone)
  }

  private func show(_ message: BarMessage) {
    bar.show(message)
    notice = message.text
    noticeTask?.cancel()
    noticeTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(message.duration))
      guard !Task.isCancelled else { return }
      self?.notice = nil
    }
  }

  static func copyToPasteboard(_ text: String) {
    let board = NSPasteboard.general
    board.clearContents()
    board.setString(text, forType: .string)
  }
}
