import AppKit
import AVFoundation
import Combine
import QuartzCore
import ZakazIQVoiceCore

/// Schůzka s klientem (R-151): nahrává mikrofon (Kryštof) a zvuk počítače (druhá strana)
/// zvlášť, dělí je na promluvy, posílá je na server už během hovoru a po konci ukáže
/// přepis v okně. Nejvýš 2 hodiny. Během schůzky se nediktuje.
@MainActor
final class MeetingController: ObservableObject {
  enum Phase: Equatable {
    case idle
    case recording
    case finishing
  }

  @Published private(set) var phase: Phase = .idle
  @Published private(set) var elapsed: TimeInterval = 0
  /// Po konci: id schůzky k otevření v okně.
  @Published private(set) var lastMeetingId: String?

  /// Otevřít okno na schůzce (`AppDelegate`).
  var onShowMeeting: ((String?) -> Void)?

  private let prefs: Preferences
  private let store: SecretStore
  private let dictation: DictationController
  private lazy var uploader = MeetingUploader { [weak self] in self?.makeAPI() }

  private var meetingId: UUID?
  private var startedAt = Date()
  private var startMedia: CFTimeInterval = 0
  private var mic: MicCapture?
  private var system: AnyObject?
  private var recorders: [TrackRecorder] = []
  private var timer: Timer?
  private var warned = false
  private var createTask: Task<Void, Never>?

  static let blockedText = "Probíhá schůzka, diktovat můžete po jejím konci"

  init(dictation: DictationController, prefs: Preferences = Preferences(), store: SecretStore = KeychainSecretStore()) {
    self.dictation = dictation
    self.prefs = prefs
    self.store = store
    dictation.bar.onStopMeeting = { [weak self] in self?.stop() }
  }

  var isActive: Bool { phase != .idle }

  private func makeAPI() -> VoiceAPI? {
    guard let key = (try? store.read()) ?? nil else { return nil }
    return VoiceAPI(base: prefs.serverAddress, key: key)
  }

  static var meetingsDirectory: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("ZakazIQ Voice", isDirectory: true).appendingPathComponent("meet", isDirectory: true)
  }

  // MARK: Začátek

  func start() {
    guard phase == .idle else { return }
    let bar = dictation.bar
    guard dictation.phase == .idle else {
      return bar.show(BarMessage("Nejdřív dokončete diktát"))
    }
    guard makeAPI() != nil else {
      bar.show(BarMessage(VoiceMessages.noKeyQueued.replacingOccurrences(of: ", diktát počká", with: ""), tone: .error))
      onShowMeeting?(nil)
      return
    }
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      break
    case .notDetermined:
      Task { _ = await AVCaptureDevice.requestAccess(for: .audio) }
      return bar.show(BarMessage(VoiceMessages.microphoneAsk))
    default:
      return bar.show(BarMessage(VoiceMessages.microphoneDenied, tone: .error))
    }
    guard #available(macOS 14.2, *) else {
      return bar.show(BarMessage("Schůzky potřebují macOS 14.2 nebo novější", tone: .error))
    }

    let id = UUID()
    let dir = Self.meetingsDirectory.appendingPathComponent(id.uuidString.lowercased(), isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    } catch {
      return bar.show(BarMessage("Schůzku se nepodařilo začít", tone: .error))
    }

    startedAt = Date()
    startMedia = CACurrentMediaTime()
    let me = TrackRecorder(track: .me, directory: dir, meetingStart: startMedia)
    let other = TrackRecorder(track: .other, directory: dir, meetingStart: startMedia)
    for recorder in [me, other] {
      recorder.onTurn = { [weak self] turn in
        DispatchQueue.main.async { self?.uploader.enqueue(turn, meetingId: id) }
      }
    }
    me.onLevel = { [weak self] level in
      DispatchQueue.main.async { self?.dictation.bar.meetingLevel(level) }
    }

    let systemCapture = SystemAudioCapture()
    do {
      try systemCapture.start { buffer in other.append(buffer) }
    } catch {
      try? FileManager.default.removeItem(at: dir)
      bar.show(BarMessage("Povolte nahrávání zvuku systému a zkuste to znovu", tone: .error))
      NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
      return
    }
    let micCapture = MicCapture()
    do {
      try micCapture.start { buffer in me.append(buffer) }
    } catch {
      systemCapture.stop()
      try? FileManager.default.removeItem(at: dir)
      return bar.show(BarMessage(VoiceMessages.microphoneFailed, tone: .error))
    }

    meetingId = id
    system = systemCapture
    mic = micCapture
    recorders = [me, other]
    warned = false
    elapsed = 0
    phase = .recording
    dictation.blockedMessage = Self.blockedText
    bar.startMeeting()
    if prefs.sounds { NSSound(named: NSSound.Name("Tink"))?.play() }

    let app = FrontApp.current()
    let startedAt = startedAt
    createTask = Task { [weak self] in
      // Bez sítě se schůzka nahrává dál; založí se, až to půjde, a pak odejdou promluvy.
      var attempts = 0
      while !Task.isCancelled {
        guard let api = self?.makeAPI() else { return }
        switch await api.createMeeting(id: id, startedAt: startedAt, appBundleId: app?.bundleId, appName: app?.name) {
        case .success:
          self?.uploader.markCreated(id)
          return
        case .failure(let error):
          attempts += 1
          if !error.isRetryable, attempts > 2 { return }
          try? await Task.sleep(for: .seconds(RetryPolicy.delay(attempts: attempts)))
        }
      }
    }

    let tick = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.tick() }
    }
    RunLoop.main.add(tick, forMode: .common)
    timer = tick
  }

  private func tick() {
    guard phase == .recording else { return }
    elapsed = CACurrentMediaTime() - startMedia
    dictation.bar.meetingTick(elapsed: elapsed)
    if elapsed >= MeetingLimits.maxDuration {
      stop()
    } else if !warned, elapsed >= MeetingLimits.maxDuration - MeetingLimits.warnBefore {
      warned = true
      dictation.bar.show(BarMessage("Za 5 minut schůzka skončí (nejvýš 2 hodiny)"))
    }
  }

  // MARK: Konec

  func stop() {
    guard phase == .recording, let id = meetingId else { return }
    phase = .finishing
    timer?.invalidate()
    timer = nil
    let duration = CACurrentMediaTime() - startMedia
    let endedAt = Date()
    mic?.stop()
    if #available(macOS 14.2, *) { (system as? SystemAudioCapture)?.stop() }
    mic = nil
    system = nil
    if prefs.sounds { NSSound(named: NSSound.Name("Pop"))?.play() }
    let bar = dictation.bar
    bar.endMeeting()
    bar.processing()

    let recorders = self.recorders
    self.recorders = []
    Task { [weak self] in
      // Dopsat rozpracované promluvy obou stop.
      for recorder in recorders {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in recorder.finish { done.resume() } }
      }
      await self?.complete(id: id, endedAt: endedAt, durationMs: Int((duration * 1000).rounded()))
    }
  }

  private func complete(id: UUID, endedAt: Date, durationMs: Int) async {
    let bar = dictation.bar
    let sent = await uploader.drain(timeout: 90)
    var detail: MeetingDetailDTO?
    if let api = makeAPI() {
      for attempt in 1...3 {
        if case .success(let value) = await api.finishMeeting(id: id, endedAt: endedAt, durationMs: durationMs) {
          detail = value
          break
        }
        try? await Task.sleep(for: .seconds(Double(attempt) * 3))
      }
    }
    createTask?.cancel()
    createTask = nil
    meetingId = nil
    phase = .idle
    dictation.blockedMessage = nil
    lastMeetingId = id.uuidString.lowercased()

    if detail == nil {
      bar.show(BarMessage("Přepis schůzky dorazí, až bude připojení", tone: .error))
    } else if !sent {
      bar.show(BarMessage("Část přepisu se ještě posílá"))
    } else {
      bar.show(BarMessage("Přepis schůzky je hotový"))
    }
    onShowMeeting?(lastMeetingId)
    if sent { try? FileManager.default.removeItem(at: Self.meetingsDirectory.appendingPathComponent(id.uuidString.lowercased())) }
  }

  /// Ukončení aplikace během schůzky: zastavit zachytávání, ať zvuk systému neběží dál.
  func shutdown() {
    timer?.invalidate()
    mic?.stop()
    if #available(macOS 14.2, *) { (system as? SystemAudioCapture)?.stop() }
  }
}
