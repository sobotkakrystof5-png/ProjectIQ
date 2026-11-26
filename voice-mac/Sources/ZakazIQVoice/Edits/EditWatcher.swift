import AppKit
import ZakazIQVoiceCore

/// Hlídá vložený diktát a pozná, když ho člověk opraví (VO09, plán oddíl 3 bod 6 a 5).
///
/// Po vložení si zapamatuje pole, jeho obsah a kotvy kolem vloženého textu. Pole čte znovu
/// každých 1,5 s, po Enteru, při přechodu jinam a nejpozději za 60 s. Najde-li vložený úsek
/// a ten se změnil, pošle `POST /feedback`. Když kotvy zmizí (zpráva odešla, pole se
/// vymazalo), použije poslední čtení, kde ještě byly; jinak nepošle nic — nehádá.
///
/// Napojení: po úspěšném vložení `watch(id:insertedText:pid:)` (jen když je zapnuté
/// „Učit se z mých oprav"), Enter z `FnMonitor` → `enterPressed()`, nový diktát →
/// `flush()`. Výsledek `onEdited(id)` = diktát byl opravený (příznak v historii).
@MainActor
final class EditWatcher {
  /// Diktát `id` byl po vložení opravený (server potvrdil změněná slova).
  var onEdited: ((UUID) -> Void)?

  static let watchFor: TimeInterval = 60
  static let sampleEvery: TimeInterval = 1.5
  static let queueEvery: TimeInterval = 60

  private struct Pending {
    let id: UUID
    let element: AXUIElement
    let pid: pid_t
    let appName: String?
    let snapshot: PasteSnapshot
    let deadline: Date
    /// Poslední čtení, kde se úsek ještě našel.
    var lastFound: EditLocator.Outcome?
  }

  private let apiFactory: () -> VoiceAPI?
  private let queue: FeedbackQueue
  private let unreadable: UnreadableFields
  private var pending: Pending?
  private var sampleTimer: Timer?
  private var queueTimer: Timer?
  private var activationObserver: NSObjectProtocol?

  init(
    api: @escaping () -> VoiceAPI? = EditWatcher.defaultAPI,
    queue: FeedbackQueue = FeedbackQueue(),
    unreadable: UnreadableFields = UnreadableFields()
  ) {
    apiFactory = api
    self.queue = queue
    self.unreadable = unreadable
    activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { [weak self] note in
      let pid = (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.processIdentifier
      MainActor.assumeIsolated {
        guard let self, let p = self.pending, pid != p.pid else { return }
        self.flush()
      }
    }
    let timer = Timer(timeInterval: Self.queueEvery, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.retryQueue() }
    }
    RunLoop.main.add(timer, forMode: .common)
    queueTimer = timer
  }

  deinit {
    if let activationObserver { NSWorkspace.shared.notificationCenter.removeObserver(activationObserver) }
    queueTimer?.invalidate()
    sampleTimer?.invalidate()
  }

  /// Klíč z Klíčenky a adresa z voleb, stejně jako u diktátu.
  nonisolated static func defaultAPI() -> VoiceAPI? {
    guard let key = try? KeychainSecretStore().read() else { return nil }
    return VoiceAPI(base: Preferences().serverAddress, key: key)
  }

  // MARK: Vstupy

  /// Začne hlídat právě vložený diktát. Aplikace vloží text až po ⌘V, proto se pole
  /// čte s malým zpožděním a jednou se to zkusí znovu.
  func watch(id: UUID, insertedText: String, pid: pid_t) {
    flush()
    let text = insertedText
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    capture(id: id, inserted: text, pid: pid, attempt: 0)
  }

  /// Enter v aplikaci: přečíst pole hned, než zpráva odejde a pole se vymaže.
  func enterPressed() {
    guard pending != nil else { return }
    sample()
  }

  /// Ukončí hlídání a pošle opravu, je-li nějaká (nový diktát, konec aplikace).
  func flush() {
    guard var p = pending else { return }
    pending = nil
    sampleTimer?.invalidate()
    sampleTimer = nil

    var outcome: EditLocator.Outcome = .lost
    if case .success(let field) = FocusReader.read(p.element) {
      outcome = EditLocator.locate(p.snapshot, now: field.value)
    }
    if outcome == .lost, let last = p.lastFound { outcome = last }
    p.lastFound = nil
    if case .edited(let text) = outcome {
      send(id: p.id, editedText: text)
    }
  }

  // MARK: Hlídání

  private func capture(id: UUID, inserted: String, pid: pid_t, attempt: Int) {
    let delay = attempt == 0 ? 0.25 : 0.6
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      MainActor.assumeIsolated {
        guard let self else { return }
        // Mezitím začal další diktát nebo se hlídá něco jiného.
        if let p = self.pending, p.id != id { return }
        let appName = NSRunningApplication(processIdentifier: pid)?.localizedName
        switch FocusReader.focusedField() {
        case .failure(.secure), .failure(.notTrusted):
          return
        case .failure:
          self.unreadable.record(app: appName)
        case .success(let field):
          guard field.pid == pid else { return }  // kurzor už je v jiné aplikaci
          guard let snapshot = EditLocator.snapshot(field: field.value, inserted: inserted, caret: field.caret ?? (field.value as NSString).length) else {
            if attempt == 0 { return self.capture(id: id, inserted: inserted, pid: pid, attempt: 1) }
            // Aplikace hlásí obsah, ve kterém vložený text není (často Electron a web).
            self.unreadable.record(app: appName)
            return
          }
          self.pending = Pending(
            id: id, element: field.element, pid: pid, appName: appName, snapshot: snapshot,
            deadline: Date().addingTimeInterval(Self.watchFor), lastFound: nil
          )
          self.startSampling()
        }
      }
    }
  }

  private func startSampling() {
    sampleTimer?.invalidate()
    let timer = Timer(timeInterval: Self.sampleEvery, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.sample() }
    }
    RunLoop.main.add(timer, forMode: .common)
    sampleTimer = timer
  }

  private func sample() {
    guard var p = pending else { return }
    if Date() >= p.deadline { return flush() }
    // Kurzor odešel do jiného pole = hotovo.
    if !FocusReader.isFocused(p.element) { return flush() }
    guard case .success(let field) = FocusReader.read(p.element) else { return }
    let outcome = EditLocator.locate(p.snapshot, now: field.value)
    if outcome != .lost {
      p.lastFound = outcome
      pending = p
    }
  }

  // MARK: Odeslání

  private func send(id: UUID, editedText: String) {
    queue.add(.init(id: id, editedText: editedText, createdAt: Date()))
    retryQueue()
  }

  private var sending = false

  /// Pošle, co čeká ve frontě. Volá se po každé opravě, každou minutu a po návratu sítě.
  func retryQueue() {
    guard !sending else { return }
    let items = queue.pending()
    guard !items.isEmpty, let api = apiFactory() else { return }
    sending = true
    Task { [weak self] in
      send: for item in items {
        let result = await api.feedback(id: item.id, editedText: item.editedText)
        guard let self else { return }
        switch result {
        case .success(let r):
          self.queue.remove(id: item.id)
          if r.userEdits > 0 { self.onEdited?(item.id) }
        case .failure(let error):
          if FeedbackResult.isFinal(error) {
            self.queue.remove(id: item.id)
          } else {
            self.queue.bumpAttempts(id: item.id)
            // Bez sítě nemá smysl zkoušet další položky hned.
            if error.isRetryable { break send }
          }
        }
      }
      self?.sending = false
    }
  }
}
