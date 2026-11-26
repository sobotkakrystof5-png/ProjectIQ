import AppKit
import AVFoundation
import Combine
import Network
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

/// Řadič diktátu (VO04–VO06): zkratka → `DictationTrigger` → nahrávání → lišta →
/// odeslání → vložení → historie; bez sítě fronta (D-V10).
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
  /// Kolik diktátů čeká ve frontě.
  @Published private(set) var queueCount = 0
  /// Změní se po každém zápisu do historie (okno VO11 si podle toho znovu načte data).
  @Published private(set) var historyRevision = 0

  let bar = BarModel()
  /// Místní historie a fronta; `nil`, když se databázi nepodařilo otevřít (diktát jde dál,
  /// jen bez historie a fronty).
  let history: LocalDB?

  private let prefs: Preferences
  private let store: SecretStore
  private let monitor = FnMonitor()
  private let recorder = Recorder()
  private let paster = Paster()
  private var trigger = DictationTrigger()
  private var context: DictationContext?
  private var abandoned = false
  private var noticeTask: Task<Void, Never>?
  private var pathMonitor: NWPathMonitor?
  private var queueTimer: Timer?
  private var queueRunning = false

  init(prefs: Preferences = Preferences(), store: SecretStore = KeychainSecretStore()) {
    self.prefs = prefs
    self.store = store
    history = try? LocalDB()
    monitor.shortcut = prefs.shortcut
    monitor.onSignal = { [weak self] signal in self?.handle(signal) }
    recorder.onTick = { [weak self] in self?.send(.tick) }
    recorder.onLevel = { [weak self] level in self?.pushLevel(level) }
    bar.shortcut = prefs.shortcut
    bar.showWhenIdle = prefs.showBarWhenIdle
    bar.onClick = { [weak self] in self?.toggleFromMenu() }
    bar.onCancel = { [weak self] in self?.send(.barCancel) }
    bar.onCopy = { [weak self] text in self?.copy(text) }
  }

  var shortcut: DictationShortcut { prefs.shortcut }
  var showBarWhenIdle: Bool { prefs.showBarWhenIdle }
  var sounds: Bool { prefs.sounds }

  func setShortcut(_ shortcut: DictationShortcut) {
    prefs.shortcut = shortcut
    monitor.shortcut = shortcut
    bar.shortcut = shortcut
  }

  func setShowBarWhenIdle(_ value: Bool) {
    prefs.showBarWhenIdle = value
    bar.showWhenIdle = value
  }

  func setSounds(_ value: Bool) { prefs.sounds = value }

  /// Spustí frontu (síť + každou minutu), uklidí staré nahrávky a historii.
  func startBackground() {
    housekeeping()
    let monitor = NWPathMonitor()
    monitor.pathUpdateHandler = { [weak self] path in
      guard path.status == .satisfied else { return }
      Task { @MainActor in await self?.processQueue() }
    }
    monitor.start(queue: DispatchQueue(label: "cz.zakaziq.voice.network"))
    pathMonitor = monitor
    let timer = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
      Task { @MainActor in await self?.processQueue() }
    }
    RunLoop.main.add(timer, forMode: .common)
    queueTimer = timer
    Task { await processQueue() }
  }

  /// Zkusí zapnout zachytávání zkratky; volá se při startu a po změně oprávnění.
  func startHotkey() {
    hotkeyReady = monitor.start()
  }

  /// Položka menu Diktovat a klik na lištu.
  func toggleFromMenu() {
    send(.barClick(secureInput: FnMonitor.secureInputActive))
  }

  /// Menu „Zkopírovat poslední diktát".
  func copyLastDictation() {
    guard let text = try? history?.latestText(), !text.isEmpty else {
      bar.show(BarMessage("Zatím tu žádný diktát není"))
      return
    }
    copy(text)
  }

  /// „Zkusit znovu" u diktátu ve frontě (okno VO11).
  func retryQueued(id: UUID) {
    try? history.map { db in
      if let item = try db.allQueue().first(where: { $0.id == id }) {
        try db.reschedule(id: item.id, attempts: item.attempts, next: Date())
      }
    }
    Task { await processQueue() }
  }

  func copy(_ text: String) {
    paster.copy(text)
    bar.show(BarMessage(VoiceMessages.copied))
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
      playSound("Tink")
    case .finish(let mode):
      context?.mode = mode
      finish()
    case .discard:
      recorder.discard()
      context = nil
      phase = .idle
      bar.idle()
    case .cancel:
      cancelRecording()
    case .abandon:
      abandoned = true
    case .refuseSecureInput:
      show(BarMessage(VoiceMessages.secureInput))
    case .warnLong:
      if case .listening(let mode) = bar.stage {
        bar.flash(BarMessage(VoiceMessages.longRecording), returningTo: .listening(mode))
      }
    }
  }

  // MARK: Nahrávání

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
    abandoned = false
    context = DictationContext(id: id, startedAt: Date(), startedUptime: ProcessInfo.processInfo.systemUptime, app: FrontApp.current())
  }

  private func pushLevel(_ level: Double) {
    guard let context else { return }
    bar.push(level: level, elapsed: ProcessInfo.processInfo.systemUptime - context.startedUptime)
  }

  /// Esc nebo Zrušit: nahrávku smazat, serveru jen „zrušeno" (statistika, bez zvuku).
  private func cancelRecording() {
    recorder.discard()
    phase = .idle
    bar.idle()
    guard let ctx = context else { return }
    context = nil
    let meta = makeMeta(ctx, durationMs: Int(((ProcessInfo.processInfo.systemUptime - ctx.startedUptime) * 1000).rounded()), speechMs: nil, cancelled: true)
    guard let client = makeClient() else { return }
    Task { _ = await client.dictate(meta: meta, audio: nil) }
  }

  // MARK: Odeslání a vložení

  private func finish() {
    guard let ctx = context, let take = recorder.stop() else {
      context = nil
      phase = .idle
      bar.idle()
      send(.processingDone)
      return
    }
    context = nil
    phase = .processing
    let released = ProcessInfo.processInfo.systemUptime
    playSound("Pop")

    // G1 na Macu: skoro žádná řeč = nic neposílat.
    if take.speechMs < PastePlan.minSpeechMs {
      try? FileManager.default.removeItem(at: take.url)
      record(HistoryEntry(id: ctx.id, startedAt: ctx.startedAt, appName: ctx.app?.name, appBundleId: ctx.app?.bundleId, mode: ctx.mode, status: .empty))
      complete(BarMessage(VoiceMessages.nothingHeard))
      return
    }

    let meta = makeMeta(ctx, durationMs: take.durationMs, speechMs: take.speechMs, cancelled: false)
    record(HistoryEntry(id: ctx.id, startedAt: ctx.startedAt, appName: ctx.app?.name, appBundleId: ctx.app?.bundleId, mode: ctx.mode, status: .pending))
    bar.processing()

    guard let client = makeClient() else {
      enqueue(meta: meta, take: take, attempts: 0, retryAfter: nil)
      complete(BarMessage(VoiceMessages.noKeyQueued, tone: .error))
      return
    }

    Task { [weak self] in
      let audio = try? Data(contentsOf: take.url)
      let outcome = await client.dictate(meta: meta, audio: audio)
      self?.handleLive(outcome, ctx: ctx, meta: meta, take: take, released: released)
    }
  }

  private func handleLive(_ outcome: DictateOutcome, ctx: DictationContext, meta: DictationMeta, take: Recorder.Take, released: TimeInterval) {
    switch outcome {
    case .success(let response):
      try? FileManager.default.removeItem(at: take.url)
      let decision = PastePlan.decide(
        response: response,
        startPid: ctx.app?.pid,
        frontPid: FrontApp.current()?.pid,
        canPostEvents: Paster.canPostEvents,
        abandoned: abandoned
      )
      let message: BarMessage?
      switch decision {
      case .paste:
        paster.paste(response.text)
        message = nil
      case .clipboardOnly(.abandoned):
        message = nil
      case .clipboardOnly(.appChanged):
        paster.copy(response.text)
        message = BarMessage(VoiceMessages.inClipboard)
      case .clipboardOnly(.noAccessibility):
        paster.copy(response.text)
        message = BarMessage(VoiceMessages.inClipboardNoAccess, tone: .error)
      case .nothing:
        message = BarMessage(VoiceMessages.nothingHeard)
      }
      let totalMs = Int(((ProcessInfo.processInfo.systemUptime - released) * 1000).rounded())
      record(HistoryEntry(
        id: ctx.id, startedAt: ctx.startedAt, appName: ctx.app?.name, appBundleId: ctx.app?.bundleId, mode: ctx.mode,
        status: HistoryStatus(server: response.status), text: response.text, words: response.words,
        totalMs: totalMs, synced: true
      ))
      if let message {
        complete(message)
      } else if abandoned {
        complete(nil)
      } else {
        complete(nil, done: true)
      }
    case .failure(let error, let retryAfter):
      if error.isRetryable {
        enqueue(meta: meta, take: take, attempts: 1, retryAfter: retryAfter)
        complete(BarMessage(VoiceMessages.barText(for: error), tone: .error))
      } else {
        try? FileManager.default.removeItem(at: take.url)
        record(HistoryEntry(
          id: ctx.id, startedAt: ctx.startedAt, appName: ctx.app?.name, appBundleId: ctx.app?.bundleId, mode: ctx.mode,
          status: .failed, error: VoiceMessages.text(for: error)
        ))
        complete(BarMessage(VoiceMessages.barText(for: error), tone: .error))
      }
    }
  }

  /// Konec zpracování: hláška, nebo bliknutí „hotovo", nebo klid.
  private func complete(_ message: BarMessage?, done: Bool = false) {
    phase = .idle
    abandoned = false
    if let message {
      show(message)
    } else if done {
      bar.done()
    } else {
      bar.idle()
    }
    send(.processingDone)
  }

  private func makeMeta(_ ctx: DictationContext, durationMs: Int, speechMs: Int?, cancelled: Bool) -> DictationMeta {
    DictationMeta(
      id: ctx.id,
      startedAt: ctx.startedAt,
      durationMs: durationMs,
      speechMs: speechMs,
      mode: ctx.mode,
      cancelled: cancelled,
      app: .init(bundleId: ctx.app?.bundleId, name: ctx.app?.name)
    )
  }

  private func makeClient() -> VoiceClient? {
    guard let key = (try? store.read()) ?? nil else { return nil }
    return VoiceClient(base: prefs.serverAddress, key: key)
  }

  // MARK: Fronta (D-V10)

  private func enqueue(meta: DictationMeta, take: Recorder.Take, attempts: Int, retryAfter: TimeInterval?) {
    let now = Date()
    let item = QueueItem(
      id: meta.id,
      audioPath: take.url.path,
      meta: meta,
      attempts: attempts,
      nextAttempt: now.addingTimeInterval(attempts == 0 ? 0 : RetryPolicy.delay(attempts: attempts, retryAfter: retryAfter)),
      createdAt: now
    )
    try? history?.enqueue(item)
    refreshQueueCount()
  }

  /// Projde frontu: staré vyřadí, na řadě odešle. Přepsaný diktát se **sám nevkládá**,
  /// jde do historie a lišta nabídne zkopírování.
  func processQueue() async {
    guard let db = history, !queueRunning else { return }
    queueRunning = true
    defer {
      queueRunning = false
      refreshQueueCount()
    }

    for item in (try? db.expiredQueue()) ?? [] {
      try? FileManager.default.removeItem(atPath: item.audioPath)
      try? db.removeFromQueue(id: item.id)
      updateHistory(item.id) { $0.status = .failed; $0.error = VoiceMessages.queueExpired }
    }

    let due = (try? db.dueQueue()) ?? []
    guard !due.isEmpty, let client = makeClient() else { return }
    for item in due {
      guard let audio = try? Data(contentsOf: URL(fileURLWithPath: item.audioPath)) else {
        try? db.removeFromQueue(id: item.id)
        updateHistory(item.id) { $0.status = .failed; $0.error = VoiceMessages.queueExpired }
        continue
      }
      let outcome = await client.dictate(meta: item.meta, audio: audio)
      switch outcome {
      case .success(let response):
        try? FileManager.default.removeItem(atPath: item.audioPath)
        try? db.removeFromQueue(id: item.id)
        updateHistory(item.id) {
          $0.status = HistoryStatus(server: response.status)
          $0.text = response.text
          $0.words = response.words
          $0.error = nil
          $0.synced = true
        }
        if response.hasText, phase == .idle {
          bar.show(BarMessage(VoiceMessages.queueDone, copyText: response.text))
        }
      case .failure(let error, let retryAfter):
        if error.isRetryable {
          let attempts = item.attempts + 1
          try? db.reschedule(id: item.id, attempts: attempts, next: Date().addingTimeInterval(RetryPolicy.delay(attempts: attempts, retryAfter: retryAfter)))
          // Bez sítě nemá smysl zkoušet další, počkají na příští kolo.
          if case .server = error {} else { return }
        } else {
          try? FileManager.default.removeItem(atPath: item.audioPath)
          try? db.removeFromQueue(id: item.id)
          updateHistory(item.id) { $0.status = .failed; $0.error = VoiceMessages.text(for: error) }
        }
      }
    }
  }

  private func refreshQueueCount() {
    queueCount = (try? history?.queueCount()) ?? 0
  }

  private func housekeeping() {
    guard let db = history else { return }
    let keep = Set(((try? db.allQueue()) ?? []).map(\.audioPath))
    Recorder.removeStale(olderThan: RetryPolicy.maxAge, keeping: keep)
    _ = try? db.purgeHistory(olderThan: Date().addingTimeInterval(-Double(prefs.historyDays) * 86_400))
    refreshQueueCount()
  }

  // MARK: Historie

  private func record(_ entry: HistoryEntry) {
    try? history?.save(entry)
    historyRevision += 1
  }

  private func updateHistory(_ id: UUID, _ change: (inout HistoryEntry) -> Void) {
    guard let db = history, var entry = try? db.entry(id: id) else { return }
    change(&entry)
    record(entry)
  }

  // MARK: Drobnosti

  private func playSound(_ name: String) {
    guard prefs.sounds else { return }
    NSSound(named: NSSound.Name(name))?.play()
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
}
