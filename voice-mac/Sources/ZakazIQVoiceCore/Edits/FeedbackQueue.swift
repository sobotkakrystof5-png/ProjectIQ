import Foundation

/// Opravy, které se nepodařilo poslat (bez sítě, 502, 429). Drží se nejvýš 24 h
/// (server opravu starší diktátu stejně nepřijme), soubor v Application Support s právy 0600.
public final class FeedbackQueue: @unchecked Sendable {
  public struct Item: Codable, Equatable, Sendable {
    public let id: UUID
    public let editedText: String
    public let createdAt: Date
    public var attempts: Int

    public init(id: UUID, editedText: String, createdAt: Date, attempts: Int = 0) {
      self.id = id
      self.editedText = editedText
      self.createdAt = createdAt
      self.attempts = attempts
    }
  }

  public static let maxAge: TimeInterval = 24 * 3600
  public static let maxItems = 200

  public let url: URL
  private let lock = NSLock()

  public init(url: URL = FeedbackQueue.defaultURL) {
    self.url = url
  }

  public static var defaultURL: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("ZakazIQ Voice", isDirectory: true).appendingPathComponent("feedback-queue.json")
  }

  /// Přidá opravu; stejné `id` nahradí starší (platí poslední stav pole).
  public func add(_ item: Item, now: Date = Date()) {
    lock.lock(); defer { lock.unlock() }
    var items = Self.prune(read(), now: now).filter { $0.id != item.id }
    items.append(item)
    write(Array(items.suffix(Self.maxItems)))
  }

  /// Položky k odeslání (staré nad 24 h se zahodí).
  public func pending(now: Date = Date()) -> [Item] {
    lock.lock(); defer { lock.unlock() }
    let items = Self.prune(read(), now: now)
    write(items)
    return items
  }

  public func remove(id: UUID) {
    lock.lock(); defer { lock.unlock() }
    write(read().filter { $0.id != id })
  }

  public func bumpAttempts(id: UUID) {
    lock.lock(); defer { lock.unlock() }
    write(read().map { $0.id == id ? Item(id: $0.id, editedText: $0.editedText, createdAt: $0.createdAt, attempts: $0.attempts + 1) : $0 })
  }

  public func clear() {
    lock.lock(); defer { lock.unlock() }
    try? FileManager.default.removeItem(at: url)
  }

  static func prune(_ items: [Item], now: Date) -> [Item] {
    items.filter { now.timeIntervalSince($0.createdAt) < maxAge && $0.createdAt <= now.addingTimeInterval(300) }
  }

  private func read() -> [Item] {
    guard let data = try? Data(contentsOf: url) else { return [] }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return (try? decoder.decode([Item].self, from: data)) ?? []
  }

  private func write(_ items: [Item]) {
    let fm = FileManager.default
    if items.isEmpty {
      try? fm.removeItem(at: url)
      return
    }
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    guard let data = try? encoder.encode(items) else { return }
    try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    try? data.write(to: url, options: .atomic)
    try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
  }
}

/// Kolikrát se v které aplikaci nepodařilo přečíst pole (jen čísla, pro ladění v O aplikaci).
public struct UnreadableFields: @unchecked Sendable {
  static let key = "edits.unreadable"
  private let defaults: UserDefaults

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  public var counts: [String: Int] {
    (defaults.dictionary(forKey: Self.key) as? [String: Int]) ?? [:]
  }

  public func record(app: String?) {
    let name = (app?.isEmpty == false ? app! : "Neznámá aplikace")
    var all = counts
    all[name, default: 0] += 1
    // Nejvýš 30 aplikací, ať soubor neroste.
    if all.count > 30, let smallest = all.min(by: { $0.value < $1.value })?.key, smallest != name {
      all.removeValue(forKey: smallest)
    }
    defaults.set(all, forKey: Self.key)
  }

  /// Seřazeno od nejčastější, pro výpis.
  public var sorted: [(app: String, count: Int)] {
    counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.map { ($0.key, $0.value) }
  }

  public func reset() {
    defaults.removeObject(forKey: Self.key)
  }
}
