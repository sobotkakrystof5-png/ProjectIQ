import Foundation
import Security

/// Kde leží klíč zařízení. Aplikace používá Klíčenku, testy paměť.
public protocol SecretStore: Sendable {
  func read() throws -> String?
  func save(_ value: String) throws
  func delete() throws
}

public struct KeychainError: Error, Equatable, Sendable {
  public let status: OSStatus
}

/// Klíčenka (`kSecClassGenericPassword`, služba `cz.zakaziq.voice`).
///
/// Klasická klíčenka v přihlášení, ne „data protection": ta chce podpis s týmem Apple,
/// který vlastní certifikát nemá. Přístup k položce má aplikace podle svého podpisu,
/// takže se stálou identitou (`SIGN_ID`) se po novém sestavení na nic neptá.
public struct KeychainSecretStore: SecretStore {
  public static let service = "cz.zakaziq.voice"
  public static let deviceKeyAccount = "device-key"

  public let service: String
  public let account: String

  public init(service: String = KeychainSecretStore.service, account: String = KeychainSecretStore.deviceKeyAccount) {
    self.service = service
    self.account = account
  }

  private var base: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  public func read() throws -> String? {
    var query = base
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw KeychainError(status: status) }
    guard let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  public func save(_ value: String) throws {
    let data = Data(value.utf8)
    let update = SecItemUpdate(base as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if update == errSecSuccess { return }
    guard update == errSecItemNotFound else { throw KeychainError(status: update) }

    var add = base
    add[kSecValueData as String] = data
    add[kSecAttrLabel as String] = "ZakazIQ Voice – klíč zařízení"
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError(status: status) }
  }

  public func delete() throws {
    let status = SecItemDelete(base as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
  }
}

/// Pro testy a náhledy: nic neopustí paměť procesu.
public final class MemorySecretStore: SecretStore, @unchecked Sendable {
  private let lock = NSLock()
  private var value: String?

  public init(_ value: String? = nil) { self.value = value }

  public func read() throws -> String? { lock.withLock { value } }
  public func save(_ value: String) throws { lock.withLock { self.value = value } }
  public func delete() throws { lock.withLock { value = nil } }
}
