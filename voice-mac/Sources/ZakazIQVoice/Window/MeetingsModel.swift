import AppKit
import Combine
import ZakazIQVoiceCore

/// Záložka Schůzky v okně (R-151): seznam schůzek ze serveru, přepis, shrnutí od AI.
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
    selectedId = id
    guard let api = api() else { return }
    switch await api.meeting(id: id) {
    case .success(let detail):
      selected = detail
      error = nil
    case .failure(let err):
      error = VoiceMessages.text(for: err)
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
