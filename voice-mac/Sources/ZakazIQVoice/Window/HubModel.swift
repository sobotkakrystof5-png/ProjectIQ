import AppKit
import ServiceManagement
import SwiftUI
import ZakazIQVoiceCore

/// Záložky okna (⌘1–⌘5).
enum HubTab: String, CaseIterable, Identifiable {
  case home, history, meetings, dictionary, style, settings

  var id: String { rawValue }

  var title: String {
    switch self {
    case .home: return "Domů"
    case .history: return "Historie"
    case .meetings: return "Schůzky"
    case .dictionary: return "Slovník"
    case .style: return "Styl"
    case .settings: return "Nastavení"
    }
  }

  var symbol: String {
    switch self {
    case .home: return "house"
    case .history: return "clock.arrow.circlepath"
    case .meetings: return "person.2.wave.2"
    case .dictionary: return "character.book.closed"
    case .style: return "textformat"
    case .settings: return "gearshape"
    }
  }

  var shortcut: KeyEquivalent {
    KeyEquivalent(Character(String(HubTab.allCases.firstIndex(of: self)! + 1)))
  }
}

/// Stav okna ZakazIQ Voice (VO11): čísla ze serveru, místní historie, slovník a nastavení.
/// Klíč se čte z Klíčenky až pro konkrétní požadavek, jako v `AppModel`.
@MainActor
final class HubModel: ObservableObject {
  @Published var tab: HubTab {
    didSet { hubPrefs.lastTab = tab.rawValue }
  }

  // Domů
  @Published private(set) var numbers: HomeNumbers = .loading
  @Published private(set) var recent: [HistoryRow] = []

  // Historie
  @Published var search = ""
  @Published var filter: HistoryFilter = .all
  @Published private(set) var history: [HistoryRow] = []
  @Published private(set) var historyAvailable: Bool
  /// Smazaný řádek jde 8 s vrátit jen opticky; ze schránky historie se maže hned
  /// až po uplynutí (Dílky: Zpět místo potvrzování).
  @Published private(set) var pendingDelete: HistoryRow?

  // Slovník
  @Published private(set) var dictionary: DictionaryResponse?
  @Published private(set) var dictionaryError: String?
  @Published private(set) var dictionaryLoading = false

  // Styl a soukromí na serveru
  @Published private(set) var remote: RemoteSettings?
  @Published private(set) var remoteError: String?
  @Published private(set) var savingRemote = false

  // Místní volby
  @Published var sounds: Bool { didSet { prefs.sounds = sounds } }
  @Published var showBarWhenIdle: Bool { didSet { prefs.showBarWhenIdle = showBarWhenIdle } }
  @Published var historyDays: Int { didSet { prefs.historyDays = historyDays } }
  /// Číst pole po vložení a posílat opravy (VO09). Vypnuté = nic se nečte.
  @Published var learnFromEdits: Bool { didSet { prefs.learnFromEdits = learnFromEdits } }
  /// Nabízet nahrání schůzky, když začne hovor (R-152).
  @Published var watchCalls: Bool { didSet { prefs.watchCalls = watchCalls } }
  /// Po diktátu ukázat přepis ke zkopírování, nebo ho vložit.
  @Published var afterDictation: AfterDictation { didSet { prefs.afterDictation = afterDictation } }
  /// Kde se pole po vložení nepodařilo přečíst (jen čísla, O aplikaci).
  @Published private(set) var unreadable: [(app: String, count: Int)] = []
  @Published private(set) var launchAtLogin: LaunchAtLogin.State = LaunchAtLogin.state
  @Published private(set) var launchError: String?

  // Úvod
  @Published var showOnboarding: Bool

  /// Toast dole v okně („Zkopírováno", „Slovo uložené").
  @Published private(set) var toast: String?

  let app: AppModel
  /// Záložka Schůzky (R-151).
  let meetings = MeetingsModel()
  private let prefs: Preferences
  private let hubPrefs: HubPreferences
  private let cache: StatsCache
  private let store: SecretStore
  private weak var historySource: DictationHistorySource?
  private var toastTask: Task<Void, Never>?
  private var deleteTask: Task<Void, Never>?

  init(
    app: AppModel,
    history: DictationHistorySource? = nil,
    prefs: Preferences = Preferences(),
    hubPrefs: HubPreferences = HubPreferences(),
    cache: StatsCache = StatsCache(),
    store: SecretStore = KeychainSecretStore()
  ) {
    self.app = app
    self.prefs = prefs
    self.hubPrefs = hubPrefs
    self.cache = cache
    self.store = store
    historySource = history
    historyAvailable = history != nil
    tab = hubPrefs.lastTab.flatMap(HubTab.init(rawValue:)) ?? .home
    sounds = prefs.sounds
    showBarWhenIdle = prefs.showBarWhenIdle
    historyDays = prefs.historyDays
    learnFromEdits = prefs.learnFromEdits
    watchCalls = prefs.watchCalls
    afterDictation = prefs.afterDictation
    showOnboarding = !hubPrefs.onboardingDone
    meetings.toast = { [weak self] text in self?.show(text) }
    if let cached = cache.load() {
      numbers = .cached(cached.stats, fetchedAt: cached.fetchedAt, reason: "")
    }
  }

  /// Připojí místní historii, až ji aplikace má (VO06).
  func attachHistory(_ source: DictationHistorySource) {
    historySource = source
    historyAvailable = true
    reloadHistory()
  }

  private func api() -> VoiceAPI? {
    guard let key = try? store.read() else { return nil }
    return VoiceAPI(base: prefs.serverAddress, key: key)
  }

  var hasKey: Bool { (try? store.read()) != nil }

  #if DEBUG
  /// Ukázková historie drží silný odkaz (`historySource` je slabý).
  var historySourceForDemo: DictationHistorySource?

  func applyDemoData(numbers: HomeNumbers, dictionary: DictionaryResponse, remote: RemoteSettings) {
    self.numbers = numbers
    self.dictionary = dictionary
    self.remote = remote
  }
  #endif

  // MARK: Načtení

  /// Při otevření okna a při přepnutí záložky: čísla, historie, a co záložka potřebuje.
  func refresh() async {
    #if DEBUG
    if HubDemo.isOn {
      applyDemo()
      return
    }
    #endif
    reloadHistory()
    launchAtLogin = LaunchAtLogin.state
    unreadable = UnreadableFields().sorted
    switch tab {
    case .home: await loadNumbers()
    case .dictionary: await loadDictionary()
    case .style, .settings: await loadRemote()
    case .history: break
    case .meetings: await meetings.refresh()
    }
  }

  func loadNumbers() async {
    guard let api = api() else {
      numbers = .unavailable(VoiceMessages.text(for: .noKey))
      return
    }
    let result = await api.stats(range: .week)
    if case .success(let stats) = result {
      cache.save(.init(stats: stats, fetchedAt: Date()))
    }
    numbers = HomeNumbers.resolve(result, cache: cache.load())
  }

  func reloadHistory() {
    guard let source = historySource else {
      recent = []
      history = []
      return
    }
    let all = source.recent(limit: 500).filter { $0.id != pendingDelete?.id }
    history = all
    recent = Array(all.prefix(10))
  }

  var visibleHistory: [HistoryRow] {
    HistorySearch.filter(history, query: search, filter: filter)
  }

  // MARK: Historie

  func copy(_ row: HistoryRow) {
    guard let text = row.text, !text.isEmpty else { return }
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setString(text, forType: .string)
    show("Zkopírováno")
  }

  func retry(_ row: HistoryRow) {
    historySource?.retry(id: row.id)
    show("Zkouším diktát znovu. Až bude hotový, najdete ho tady.")
    Task {
      try? await Task.sleep(for: .seconds(3))
      reloadHistory()
    }
  }

  func delete(_ row: HistoryRow) {
    commitPendingDelete()
    pendingDelete = row
    reloadHistory()
    deleteTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(8))
      guard !Task.isCancelled else { return }
      self?.commitPendingDelete()
    }
  }

  func undoDelete() {
    deleteTask?.cancel()
    deleteTask = nil
    pendingDelete = nil
    reloadHistory()
  }

  private func commitPendingDelete() {
    deleteTask?.cancel()
    deleteTask = nil
    guard let row = pendingDelete else { return }
    pendingDelete = nil
    historySource?.delete(id: row.id)
    reloadHistory()
  }

  func deleteAllHistory() {
    commitPendingDelete()
    historySource?.deleteAll()
    reloadHistory()
    show("Místní historie je smazaná. Na serveru zůstala, mažete ji v adminu.")
  }

  // MARK: Slovník

  func loadDictionary() async {
    guard let api = api() else {
      dictionaryError = VoiceMessages.text(for: .noKey)
      return
    }
    dictionaryLoading = true
    defer { dictionaryLoading = false }
    switch await api.dictionary() {
    case .success(let value):
      dictionary = value
      dictionaryError = nil
    case .failure(let error):
      dictionaryError = VoiceMessages.text(for: error)
    }
  }

  /// Uloží slovo nebo zkratku. Vrátí chybu pro formulář, `nil` = uloženo.
  func save(_ edit: DictionaryEdit) async -> String? {
    guard let api = api() else { return VoiceMessages.text(for: .noKey) }
    switch await api.save(edit) {
    case .success:
      await loadDictionary()
      if case .snippet = edit { show("Zkratka uložená") } else { show("Slovo uložené") }
      return nil
    case .failure(let error):
      return HubMessages.dictionaryError(error)
    }
  }

  func deleteWord(id: String, label: String) async {
    guard let api = api() else { return }
    switch await api.deleteWord(id: id) {
    case .success:
      await loadDictionary()
      show("„\(label)“ je ze slovníku pryč.")
    case .failure(let error):
      dictionaryError = HubMessages.dictionaryError(error)
    }
  }

  // MARK: Styl a soukromí

  func loadRemote() async {
    guard let api = api() else {
      remoteError = VoiceMessages.text(for: .noKey)
      return
    }
    switch await api.settings() {
    case .success(let value):
      remote = value
      remoteError = nil
    case .failure(let error):
      remoteError = VoiceMessages.text(for: error)
    }
  }

  func setStyle(_ style: VoiceStyle, for category: VoiceCategory) async {
    await patch(SettingsPatch(styles: [category: style])) { $0.styles[category] = style }
  }

  func setStoreText(_ value: Bool) async {
    await patch(SettingsPatch(storeText: value)) { $0.storeText = value }
  }

  func setAutoLearn(_ value: Bool) async {
    await patch(SettingsPatch(autoLearnTerms: value)) { $0.autoLearnTerms = value }
  }

  func setCleanup(_ value: Bool) async {
    await patch(SettingsPatch(cleanupEnabled: value)) { $0.cleanupEnabled = value }
  }

  /// Změna se ukáže hned; když ji server nepřijme, vrátí se a ukáže důvod.
  private func patch(_ patch: SettingsPatch, optimistic: (inout RemoteSettings) -> Void) async {
    guard let api = api(), let before = remote else { return }
    var next = before
    optimistic(&next)
    remote = next
    savingRemote = true
    defer { savingRemote = false }
    switch await api.update(patch) {
    case .success(let saved):
      remote = saved
      remoteError = nil
    case .failure(let error):
      remote = before
      remoteError = "Změnu se nepodařilo uložit. \(VoiceMessages.text(for: error))"
    }
  }

  // MARK: Spustit po přihlášení

  func setLaunchAtLogin(_ on: Bool) {
    launchError = LaunchAtLogin.set(on)
    launchAtLogin = LaunchAtLogin.state
  }

  func openLoginItems() {
    SMAppService.openSystemSettingsLoginItems()
  }

  // MARK: Úvod

  func finishOnboarding() {
    hubPrefs.onboardingDone = true
    showOnboarding = false
  }

  func reopenOnboarding() {
    showOnboarding = true
  }

  // MARK: Toast

  func show(_ text: String) {
    toast = text
    toastTask?.cancel()
    toastTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(3))
      guard !Task.isCancelled else { return }
      self?.toast = nil
    }
  }
}

/// Spustit po přihlášení (`SMAppService.mainApp`, macOS 13+).
enum LaunchAtLogin {
  enum State: Equatable {
    case on
    case off
    /// Zapnuto, ale macOS chce souhlas v Nastavení systému › Obecné › Položky při přihlášení.
    case needsApproval
  }

  static var state: State {
    switch SMAppService.mainApp.status {
    case .enabled: return .on
    case .requiresApproval: return .needsApproval
    default: return .off
    }
  }

  /// `nil` = povedlo se, jinak věta pro člověka.
  static func set(_ on: Bool) -> String? {
    do {
      if on {
        try SMAppService.mainApp.register()
      } else {
        try SMAppService.mainApp.unregister()
      }
      return nil
    } catch {
      return on
        ? "Spuštění po přihlášení se nepodařilo zapnout. Přidejte ZakazIQ Voice v Nastavení systému › Obecné › Položky při přihlášení."
        : "Spuštění po přihlášení se nepodařilo vypnout. Odeberte ZakazIQ Voice v Nastavení systému › Obecné › Položky při přihlášení."
    }
  }
}
