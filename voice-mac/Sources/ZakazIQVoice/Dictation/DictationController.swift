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
  let app: FrontApp?
  var mode: DictationMode = .hold
}

/// Řadič diktátu (VO04): zkratka → `DictationTrigger` → nahrávání.
@MainActor
final class DictationController: ObservableObject {
  enum Phase: Equatable {
    case idle
    case recording
    case processing
  }

  @Published private(set) var phase: Phase = .idle
  /// Hláška pro člověka (lišta ji ukáže ve VO05; zatím menu).
  @Published private(set) var notice: String?
  /// Zkratka běží (jsou oprávnění)?
  @Published private(set) var hotkeyReady = false
  /// Poslední hotová nahrávka (VO04: leží na disku, odeslání přidá VO06).
  @Published private(set) var lastTake: Recorder.Take?

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
  }

  var shortcut: DictationShortcut { prefs.shortcut }

  func setShortcut(_ shortcut: DictationShortcut) {
    prefs.shortcut = shortcut
    monitor.shortcut = shortcut
  }

  /// Zkusí zapnout zachytávání zkratky; volá se při startu a po změně oprávnění.
  func startHotkey() {
    hotkeyReady = monitor.start()
  }

  /// Položka menu Diktovat a klik na lištu.
  func toggleFromMenu() {
    send(.barClick(secureInput: FnMonitor.secureInputActive))
  }

  func cancelFromBar() {
    send(.barCancel)
  }

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
    case .finish(let mode):
      context?.mode = mode
      finish()
    case .discard:
      recorder.discard()
      context = nil
      phase = .idle
    case .cancel:
      recorder.discard()
      context = nil
      phase = .idle
    case .abandon:
      break
    case .refuseSecureInput:
      show(VoiceMessages.secureInput)
    case .warnLong:
      show(VoiceMessages.longRecording)
    }
  }

  private func startRecording() {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      break
    case .notDetermined:
      trigger.reset()
      Task { _ = await AVCaptureDevice.requestAccess(for: .audio) }
      show(VoiceMessages.microphoneAsk)
      return
    default:
      trigger.reset()
      show(VoiceMessages.microphoneDenied)
      return
    }
    let id = UUID()
    guard recorder.start(id: id) else {
      trigger.reset()
      show(VoiceMessages.microphoneFailed)
      return
    }
    context = DictationContext(id: id, startedAt: Date(), app: FrontApp.current())
  }

  private func finish() {
    lastTake = recorder.stop()
    context = nil
    phase = .idle
    send(.processingDone)
  }

  private func show(_ text: String) {
    notice = text
    noticeTask?.cancel()
    noticeTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(4))
      guard !Task.isCancelled else { return }
      self?.notice = nil
    }
  }
}
