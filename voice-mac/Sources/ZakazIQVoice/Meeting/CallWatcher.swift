import AppKit
import Combine
import ZakazIQVoiceCore

/// Hlídá hovory (R-152): každé 2 s zjistí, které aplikace na hovory (Zoom, Teams, WhatsApp,
/// prohlížeč s Meetem) berou zvuk z mikrofonu, a podle `CallDetector` nabídne nahrání schůzky,
/// nebo se po konci hovoru zeptá, jestli nahrávání ukončit. Sám nikdy nic nenahrává.
@MainActor
final class CallWatcher {
  let prompt = CallPromptModel()
  /// Když se nabídka ukáže (schovat kartu s přepisem diktátu na stejném místě).
  var onPromptShown: (() -> Void)?

  nonisolated static let interval: TimeInterval = 2
  /// Nabídka nahrání po minutě zmizí (jako „Teď ne").
  nonisolated static let offerTimeout: TimeInterval = 60
  /// Otázka „Hovor skončil?" bez odpovědi nahrávání po 2 minutách ukončí.
  nonisolated static let endTimeout: TimeInterval = 120

  private let meeting: MeetingController
  private let dictation: DictationController
  private let prefs: Preferences
  private let queue = DispatchQueue(label: "cz.zakaziq.voice.calls", qos: .utility)
  private var detector = CallDetector()
  private var timer: Timer?
  private var scanning = false
  private var enabled = true
  private var wasRecording = false
  /// Služba poznaná z názvu okna prohlížeče, ať se okna nečtou každé 2 s.
  private var services: [String: String] = [:]
  /// Hovor z nabídky, kterou uživatel vidí.
  private var offered: DetectedCall?
  /// Hovor, ze kterého se právě spouští nahrávání.
  private var pendingCall: DetectedCall?
  private var timeout: Task<Void, Never>?
  private var subscriptions = Set<AnyCancellable>()

  init(meeting: MeetingController, dictation: DictationController, prefs: Preferences = Preferences()) {
    self.meeting = meeting
    self.dictation = dictation
    self.prefs = prefs
    prompt.onRecord = { [weak self] in self?.record() }
    prompt.onNotNow = { [weak self] in self?.notNow() }
    prompt.onStop = { [weak self] in self?.stopRecording() }
    prompt.onKeep = { [weak self] in self?.keepRecording() }
    prompt.onOpenSettings = { [weak self] in
      SystemSettingsLink.openSystemAudio()
      self?.hidePrompt()
    }
    prompt.onDismiss = { [weak self] in self?.hidePrompt() }
    meeting.$phase
      .removeDuplicates()
      .receive(on: RunLoop.main)
      .sink { [weak self] phase in self?.meetingPhase(phase) }
      .store(in: &subscriptions)
  }

  func start() {
    guard timer == nil else { return }
    let tick = Timer(timeInterval: Self.interval, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.poll() }
    }
    tick.tolerance = 0.5
    RunLoop.main.add(tick, forMode: .common)
    timer = tick
  }

  // MARK: Kolo

  private func poll() {
    guard prefs.watchCalls else {
      if enabled {
        enabled = false
        detector = CallDetector()
        services = [:]
        hidePrompt()
      }
      return
    }
    if !enabled {
      enabled = true
      if meeting.phase == .recording { _ = detector.recordingStarted(call: nil, now: Date()) }
    }
    guard !scanning else { return }
    scanning = true
    let known = Set(services.keys)
    let own = ProcessInfo.processInfo.processIdentifier
    queue.async { [weak self] in
      let calls = Self.scan(ownPid: own, skipTitlesFor: known)
      Task { @MainActor in self?.received(calls) }
    }
  }

  /// Hovorové aplikace, které teď drží mikrofon (bez nás). U prohlížeče přečte názvy oken,
  /// dokud v nich nenajde službu.
  nonisolated private static func scan(ownPid: pid_t, skipTitlesFor known: Set<String>) -> [DetectedCall] {
    var calls: [String: DetectedCall] = [:]
    for process in MicUsage.inputProcesses() where process.pid != ownPid {
      guard let app = CallCatalog.app(forProcess: process.bundleId), calls[app.bundleId] == nil else { continue }
      var call = DetectedCall(app: app)
      if app.isBrowser, !known.contains(app.bundleId),
         let main = NSRunningApplication.runningApplications(withBundleIdentifier: app.bundleId).first {
        call.service = WindowTitles.titles(pid: main.processIdentifier).lazy.compactMap(CallCatalog.service(inTitle:)).first
      }
      calls[app.bundleId] = call
    }
    return Array(calls.values)
  }

  private func received(_ found: [DetectedCall]) {
    scanning = false
    guard enabled else { return }
    var calls = found
    for index in calls.indices {
      let key = calls[index].app.bundleId
      if let service = calls[index].service {
        services[key] = service
      } else {
        calls[index].service = services[key]
      }
    }
    services = services.filter { key, _ in calls.contains { $0.app.bundleId == key } }
    let canOffer = dictation.phase == .idle && meeting.phase == .idle
    handle(detector.update(active: calls, now: Date(), canOffer: canOffer))
  }

  private func meetingPhase(_ phase: MeetingController.Phase) {
    if phase == .recording, !wasRecording {
      wasRecording = true
      let call = pendingCall
      pendingCall = nil
      handle(detector.recordingStarted(call: call, now: Date()))
    } else if phase != .recording, wasRecording {
      wasRecording = false
      handle(detector.recordingStopped())
    }
  }

  private func handle(_ events: [CallDetector.Event]) {
    for event in events {
      switch event {
      case .offerStart(let call):
        // Bez klíče zařízení nebo na starším macOS by nahrávání stejně nešlo začít.
        guard meeting.canRecord else {
          detector.dismissOffer()
          continue
        }
        offered = call
        // Bez sluchátek to radši říct hned, dokud se dá sáhnout po sluchátkách.
        let note = AudioOutput.currentRoute() == .speakers ? "Hraje to z reproduktorů. Se sluchátky bude přepis přesnější." : nil
        show(.init(kind: .start, label: call.label, note: note), after: Self.offerTimeout) { [weak self] in self?.notNow() }
      case .offerEnd(let call):
        show(.init(kind: .end, label: call.label), after: Self.endTimeout) { [weak self] in self?.stopRecording() }
      case .withdraw:
        hidePrompt()
      }
    }
  }

  private func show(_ value: CallPromptModel.Prompt, after seconds: TimeInterval, onTimeout: @escaping @MainActor () -> Void) {
    timeout?.cancel()
    prompt.show(value)
    onPromptShown?()
    timeout = Task { @MainActor in
      try? await Task.sleep(for: .seconds(seconds))
      guard !Task.isCancelled else { return }
      onTimeout()
    }
  }

  /// Během schůzky zvuk počítače mlčí (`MeetingController.onSilentOther`). Karta zmizí po minutě.
  func showSilentOther(app: String?) {
    // Otázku „Hovor skončil?" (s vlastním odpočtem) nepřebíjet.
    guard meeting.phase == .recording, prompt.prompt == nil else { return }
    show(.init(kind: .silentOther, label: app ?? ""), after: Self.offerTimeout) { [weak self] in self?.hidePrompt() }
  }

  private func hidePrompt() {
    timeout?.cancel()
    timeout = nil
    offered = nil
    prompt.hide()
  }

  // MARK: Tlačítka

  private func record() {
    guard let call = offered else { return hidePrompt() }
    detector.dismissOffer()
    hidePrompt()
    pendingCall = call
    meeting.start(app: FrontApp(bundleId: call.app.bundleId, name: call.label, pid: 0))
    if meeting.phase != .recording { pendingCall = nil }
  }

  private func notNow() {
    detector.dismissOffer()
    hidePrompt()
  }

  private func stopRecording() {
    hidePrompt()
    meeting.stop()
  }

  private func keepRecording() {
    detector.keepRecording()
    hidePrompt()
  }
}
