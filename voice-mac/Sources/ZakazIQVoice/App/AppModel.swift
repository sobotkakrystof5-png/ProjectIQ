import Foundation
import ZakazIQVoiceCore

/// Stav připojení, jak ho ukazuje okno i menu v liště.
enum ConnectionState: Equatable {
  case unknown
  case checking
  case connected(device: String, warning: String?)
  case failed(String)

  /// Krátký řádek nahoře v menu.
  var menuLine: String {
    switch self {
    case .unknown: return "Připojení neověřené"
    case .checking: return "Ověřuji připojení…"
    case .connected(let device, _): return VoiceMessages.connected(to: device)
    case .failed: return "Nepřipojeno"
    }
  }
}

/// Jeden zdroj pravdy pro okno Nastavení a menu. Klíč drží jen Klíčenka;
/// do paměti se načte až ve chvíli, kdy se posílá požadavek.
@MainActor
final class AppModel: ObservableObject {
  @Published var serverText: String
  @Published var serverError: String?
  @Published var serverSaved = false

  @Published private(set) var maskedKey: String?
  @Published var keyInput = ""
  @Published var keyError: String?
  /// Smazaný klíč jde 8 s vrátit (Dílky: Zpět místo potvrzování).
  @Published private(set) var canRestoreKey = false

  @Published private(set) var connection: ConnectionState = .unknown
  @Published private(set) var permissions: [PermissionKind: PermissionState] = Permissions.snapshot()

  private let store: SecretStore
  private let prefs: Preferences
  private var deletedKey: String?
  private var restoreTask: Task<Void, Never>?

  init(store: SecretStore = KeychainSecretStore(), prefs: Preferences = Preferences()) {
    self.store = store
    self.prefs = prefs
    serverText = ServerAddress.display(prefs.serverAddress)
    loadMaskedKey()
  }

  var hasKey: Bool { maskedKey != nil }

  // MARK: Adresa serveru

  func saveServer() {
    let before = prefs.serverAddress
    switch prefs.setServerAddress(serverText) {
    case .success(let url):
      serverText = ServerAddress.display(url)
      serverError = nil
      serverSaved = true
      if url != before { connection = .unknown }
    case .failure(let reason):
      serverError = VoiceMessages.text(for: reason)
      serverSaved = false
    }
  }

  func useServer(_ url: URL) {
    serverText = ServerAddress.display(url)
    saveServer()
  }

  // MARK: Klíč zařízení

  func saveKey() {
    guard let key = DeviceKey.normalize(keyInput) else {
      keyError = keyInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "Vložte klíč zařízení z adminu."
        : VoiceMessages.text(for: .invalidKey)
      return
    }
    do {
      try store.save(key)
      keyInput = ""
      keyError = nil
      dropRestore()
      loadMaskedKey()
      connection = .unknown
    } catch {
      keyError = "Klíč se do Klíčenky nepodařilo uložit. Zkuste to znovu."
    }
  }

  func deleteKey() {
    do {
      deletedKey = try store.read()
      try store.delete()
      maskedKey = nil
      connection = .unknown
      canRestoreKey = deletedKey != nil
      restoreTask?.cancel()
      restoreTask = Task { [weak self] in
        try? await Task.sleep(for: .seconds(8))
        guard !Task.isCancelled else { return }
        self?.dropRestore()
      }
    } catch {
      keyError = "Klíč se z Klíčenky nepodařilo smazat. Zkuste to znovu."
    }
  }

  func restoreKey() {
    guard let key = deletedKey else { return }
    try? store.save(key)
    dropRestore()
    loadMaskedKey()
  }

  private func dropRestore() {
    restoreTask?.cancel()
    restoreTask = nil
    deletedKey = nil
    canRestoreKey = false
  }

  private func loadMaskedKey() {
    if let key = try? store.read() {
      maskedKey = DeviceKey.masked(key)
    } else {
      maskedKey = nil
    }
  }

  // MARK: Připojení

  func testConnection() async {
    guard connection != .checking else { return }
    let key: String
    do {
      guard let stored = try store.read() else {
        connection = .failed(VoiceMessages.text(for: .noKey))
        return
      }
      key = stored
    } catch {
      connection = .failed("Klíčenka teď klíč nevydala. Zkuste to znovu.")
      return
    }

    connection = .checking
    let client = VoiceClient(base: prefs.serverAddress, key: key)
    switch await client.fetchConfig() {
    case .success(let config):
      connection = .connected(
        device: config.device.name,
        warning: config.transcriptionReady ? nil : VoiceMessages.transcriptionMissing
      )
    case .failure(let error):
      connection = .failed(VoiceMessages.text(for: error))
    }
  }

  // MARK: Oprávnění

  func refreshPermissions() {
    let now = Permissions.snapshot()
    if now != permissions { permissions = now }
  }

  func request(_ kind: PermissionKind) async {
    await Permissions.request(kind)
    refreshPermissions()
  }
}
