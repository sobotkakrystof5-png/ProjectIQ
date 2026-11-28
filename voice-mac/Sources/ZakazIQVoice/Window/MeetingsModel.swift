import AppKit
import Combine
import ZakazIQVoiceCore

/// Záložka Schůzky v okně (R-151): seznam schůzek ze serveru, přepis, shrnutí od AI,
/// kontrola obou stran a přiřazení ke kontaktu (průvodce první schůzkou).
@MainActor
final class MeetingsModel: ObservableObject {
  @Published private(set) var list: [MeetingListItemDTO] = []
  @Published private(set) var selected: MeetingDetailDTO?
  @Published private(set) var selectedId: String?
  @Published private(set) var loading = false
  @Published private(set) var summarizing = false
  @Published private(set) var error: String?
  /// Stav nahrávání (zrcadlí `MeetingController`).
  @Published var recording = false
  @Published var finishing = false
  @Published var elapsed: TimeInterval = 0
  /// Kam hraje zvuk běžící schůzky (zrcadlí `MeetingController.route`).
  @Published var route: OutputRoute = .unknown
  /// Kontrola před schůzkou: kam to hraje teď a co víme o nahrávání zvuku systému.
  @Published private(set) var idleRoute: OutputRoute = .unknown
  @Published private(set) var systemAudio: SystemAudioCheck?

  /// Přiřazení ke kontaktu: návrh z kalendáře a výsledky hledání.
  @Published private(set) var contacts: MeetingContactsDTO?
  @Published private(set) var assigning = false
  /// Starší server přiřazení z Macu neumí: zbude odkaz do adminu.
  @Published private(set) var contactsUnavailable = false
  /// Na co odpověděl poslední výsledek hledání (prázdný výsledek ukázat až k aktuálnímu dotazu).
  @Published private(set) var searchedQuery = ""
  /// Pole hledání. Hledá se jen při psaní, ne když dotaz vynuluje kód (`setQueryQuietly`).
  @Published var contactQuery = "" {
    didSet { if contactQuery != oldValue, !quietQuery { scheduleContactSearch() } }
  }
  private var searchTask: Task<Void, Never>?
  private var quietQuery = false

  private func setQueryQuietly(_ value: String) {
    searchTask?.cancel()
    quietQuery = true
    contactQuery = value
    quietQuery = false
  }

  var startMeeting: (() -> Void)?
  var stopMeeting: (() -> Void)?
  /// Krátká hláška dole v okně.
  var toast: ((String) -> Void)?

  private let prefs: Preferences
  private let store: SecretStore

  init(prefs: Preferences = Preferences(), store: SecretStore = KeychainSecretStore()) {
    self.prefs = prefs
    self.store = store
  }

  private func api() -> VoiceAPI? {
    guard let key = (try? store.read()) ?? nil else { return nil }
    return VoiceAPI(base: prefs.serverAddress, key: key)
  }

  func refresh() async {
    if isDemo { return }
    updatePreflight()
    guard let api = api() else {
      error = "Chybí klíč zařízení. Vložte ho v Nastavení."
      return
    }
    loading = true
    defer { loading = false }
    switch await api.meetings() {
    case .success(let items):
      list = items
      error = nil
      if let id = selectedId ?? items.first?.id { await select(id) }
    case .failure(let err):
      error = VoiceMessages.text(for: err)
    }
  }

  func select(_ id: String) async {
    if isDemo { return }
    let changed = id != selected?.id
    selectedId = id
    if changed {
      contacts = nil
      setQueryQuietly("")
    }
    guard let api = api() else { return }
    switch await api.meeting(id: id) {
    case .success(let detail):
      selected = detail
      error = nil
      if changed || contacts == nil { await loadContacts(query: "") }
    case .failure(let err):
      error = VoiceMessages.text(for: err)
    }
  }

  // MARK: Kontrola

  func updatePreflight() {
    idleRoute = AudioOutput.currentRoute()
    systemAudio = prefs.systemAudioCheck
  }

  /// Věty pod „Začít schůzku": sluchátka a povolení zvuku systému (průvodce první schůzkou).
  var preflight: [(text: String, action: MeetingCheck.Action?)] {
    var notes: [(String, MeetingCheck.Action?)] = []
    if idleRoute == .speakers {
      notes.append(("Teď to hraje z reproduktorů. Se sluchátky bude přepis přesnější.", nil))
    }
    switch systemAudio?.heard {
    case .none:
      notes.append(("Při první schůzce se macOS zeptá na nahrávání zvuku systému. Povolte ho, jinak se druhá strana nenahraje.", nil))
    case .some(false):
      notes.append(("Při poslední schůzce byl zvuk počítače potichu. Povolte ZakazIQ Voice nahrávání zvuku systému.", .openSystemAudioSettings))
    case .some(true):
      break
    }
    return notes
  }

  /// Slyšel Mac obě strany? U schůzek nahraných tímhle Macem ví i výstup a zvuk počítače.
  func check(for meeting: MeetingDetailDTO) -> MeetingCheck {
    meeting.evaluateCheck(note: isDemo ? demoNote : prefs.meetingNote(id: meeting.id))
  }

  // Ladicí snímek okna (`BarSnapshot`): bez sítě a bez zápisu do nastavení.
  private(set) var isDemo = false
  private var demoNote: MeetingRecordingNote?

  #if DEBUG
  func applyDemo(
    detail: MeetingDetailDTO, contacts: MeetingContactsDTO, note: MeetingRecordingNote?, query: String = "",
    idleRoute: OutputRoute = .unknown, systemAudio: SystemAudioCheck? = nil
  ) {
    isDemo = true
    self.idleRoute = idleRoute
    self.systemAudio = systemAudio
    demoNote = note
    selected = detail
    selectedId = detail.id
    self.contacts = contacts
    setQueryQuietly(query)
    searchedQuery = query
  }
  #endif

  func open(_ action: MeetingCheck.Action) {
    SystemSettingsLink.open(action)
  }

  // MARK: Kontakt

  private func loadContacts(query: String) async {
    guard let id = selectedId, let api = api() else { return }
    switch await api.meetingContacts(id: id, query: query) {
    case .success(let value):
      guard id == selectedId else { return }
      contacts = value
      searchedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
      contactsUnavailable = false
    case .failure(let err):
      // 404 bez kódu ZakazIQ = server ten vstup ještě nemá.
      if case .unexpectedResponse = err { contactsUnavailable = true }
    }
  }

  private func scheduleContactSearch() {
    searchTask?.cancel()
    let query = contactQuery
    searchTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled else { return }
      await self?.loadContacts(query: query)
    }
  }

  /// Přiřadí schůzku ke kontaktu, `nil` ji odpojí. Druhá strana se pak v přepisu jmenuje podle kontaktu.
  func assign(_ contact: MeetingContactDTO?) async {
    guard let id = selectedId, let api = api() else { return }
    assigning = true
    defer { assigning = false }
    switch await api.setMeetingContact(id: id, contactId: contact?.id) {
    case .success(let detail):
      selected = detail
      error = nil
      setQueryQuietly("")
      toast?(contact.map { "Schůzka patří ke kontaktu \($0.name)" } ?? "Schůzka je bez kontaktu")
      if case .success(let items) = await api.meetings() { list = items }
    case .failure(let err):
      if case .server("CONTACT_NOT_FOUND", _) = err {
        error = "Kontakt se nenašel, zkuste ho vyhledat znovu."
      } else {
        error = VoiceMessages.text(for: err)
      }
    }
  }

  /// Po konci schůzky: otevřít ji a načíst seznam znovu.
  func show(_ id: String) {
    selectedId = id
    Task { await refresh() }
  }

  func summarize() async {
    guard let id = selectedId, let api = api() else { return }
    summarizing = true
    defer { summarizing = false }
    switch await api.summarizeMeeting(id: id) {
    case .success(let detail):
      selected = detail
      error = nil
      if let index = list.firstIndex(where: { $0.id == id }) {
        Task { await refreshListOnly(keep: index) }
      }
    case .failure(let err):
      error = Self.summaryError(err)
    }
  }

  private func refreshListOnly(keep _: Int) async {
    if case .success(let items) = await api()?.meetings() { list = items }
  }

  static func summaryError(_ error: VoiceError) -> String {
    if case .server(let code, _) = error {
      switch code {
      case "SUMMARY_NOT_CONFIGURED": return "Na serveru chybí nastavení AI."
      case "SUMMARY_EMPTY": return "Schůzka zatím nemá přepis, není co shrnout."
      case "SUMMARY_REFUSED": return "Model shrnutí odmítl. Zkuste to znovu, nebo přepis zkopírujte."
      case "SUMMARY_TRUNCATED", "SUMMARY_FAILED": return "Shrnutí se nepodařilo. Zkuste to prosím znovu."
      default: break
      }
    }
    return VoiceMessages.text(for: error)
  }

  func copy(_ text: String) {
    let board = NSPasteboard.general
    board.clearContents()
    board.setString(text, forType: .string)
    toast?(VoiceMessages.copied)
  }

  func openInAdmin() {
    guard let id = selectedId else { return }
    var components = URLComponents(url: prefs.serverAddress.appendingPathComponent("dashboard/voice"), resolvingAgainstBaseURL: false)
    components?.queryItems = [URLQueryItem(name: "tab", value: "schuzky"), URLQueryItem(name: "schuzka", value: id)]
    if let url = components?.url { NSWorkspace.shared.open(url) }
  }
}
