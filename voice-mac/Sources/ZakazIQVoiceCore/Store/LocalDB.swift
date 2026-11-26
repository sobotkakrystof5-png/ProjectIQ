import Foundation
import SQLite3

/// Stav diktátu v místní historii.
public enum HistoryStatus: String, Codable, CaseIterable, Sendable {
  /// Čeká ve frontě na přepis (bez sítě, 502, 429).
  case pending
  case ok
  case raw
  case snippet
  case empty
  case blocked
  case cancelled
  /// Nepodařilo se přepsat (chyba, která se neopakuje, nebo 24 h ve frontě).
  case failed

  /// Stav ze serveru (`ok`, `raw`, `snippet`, `empty`, `blocked`, `cancelled`, `error`).
  public init(server status: String) {
    self = HistoryStatus(rawValue: status) ?? .failed
  }

  /// Má text, který jde zkopírovat a počítá se do slov.
  public var hasText: Bool { self == .ok || self == .raw || self == .snippet }
}

/// Jeden diktát v místní historii (okno VO11 ho čte přes `LocalDB.recent`).
public struct HistoryEntry: Identifiable, Equatable, Sendable {
  public let id: UUID
  public let startedAt: Date
  public let appName: String?
  public let appBundleId: String?
  public let mode: DictationMode
  public var status: HistoryStatus
  public var text: String
  public var words: Int
  /// Česká hláška pro člověka, když se diktát nepovedl.
  public var error: String?
  /// Od puštění klávesy po vložení (měřítko rychlosti), ms.
  public var totalMs: Int?
  /// Server o diktátu ví (přepsáno nebo zrušeno se zápisem).
  public var synced: Bool

  public init(
    id: UUID,
    startedAt: Date,
    appName: String?,
    appBundleId: String?,
    mode: DictationMode,
    status: HistoryStatus,
    text: String = "",
    words: Int = 0,
    error: String? = nil,
    totalMs: Int? = nil,
    synced: Bool = false
  ) {
    self.id = id
    self.startedAt = startedAt
    self.appName = appName
    self.appBundleId = appBundleId
    self.mode = mode
    self.status = status
    self.text = text
    self.words = words
    self.error = error
    self.totalMs = totalMs
    self.synced = synced
  }
}

/// Diktát čekající ve frontě na odeslání (D-V10).
public struct QueueItem: Equatable, Sendable {
  public let id: UUID
  public let audioPath: String
  public let meta: DictationMeta
  public var attempts: Int
  public var nextAttempt: Date
  public let createdAt: Date

  public init(id: UUID, audioPath: String, meta: DictationMeta, attempts: Int = 0, nextAttempt: Date, createdAt: Date) {
    self.id = id
    self.audioPath = audioPath
    self.meta = meta
    self.attempts = attempts
    self.nextAttempt = nextAttempt
    self.createdAt = createdAt
  }
}

public enum LocalDBError: Error, Equatable {
  case open(String)
  case statement(String)
}

/// Místní úložiště historie a fronty: systémové SQLite (bez balíčků), soubor 0600
/// v Application Support. Volá se jen z hlavního vlákna aplikace.
public final class LocalDB: @unchecked Sendable {
  private var db: OpaquePointer?
  public let path: String

  /// Výchozí umístění: `~/Library/Application Support/ZakazIQ Voice/voice.sqlite`.
  public static var defaultPath: String {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("ZakazIQ Voice", isDirectory: true).appendingPathComponent("voice.sqlite").path
  }

  public init(path: String = LocalDB.defaultPath) throws {
    self.path = path
    let dir = (path as NSString).deletingLastPathComponent
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
    guard sqlite3_open_v2(path, &db, flags, nil) == SQLITE_OK else {
      let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "open"
      sqlite3_close(db)
      db = nil
      throw LocalDBError.open(message)
    }
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
    sqlite3_busy_timeout(db, 2000)
    try migrate()
  }

  deinit { sqlite3_close(db) }

  private func migrate() throws {
    try exec("""
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        started_at REAL NOT NULL,
        app_name TEXT,
        app_bundle_id TEXT,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        words INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        total_ms INTEGER,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS history_started ON history(started_at DESC);
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY,
        audio_path TEXT NOT NULL,
        meta TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt REAL NOT NULL,
        created_at REAL NOT NULL
      );
      PRAGMA user_version = 1;
      """)
  }

  // MARK: Historie

  /// Uloží nový diktát, nebo přepíše existující se stejným `id`.
  public func save(_ e: HistoryEntry) throws {
    try run(
      """
      INSERT OR REPLACE INTO history (id, started_at, app_name, app_bundle_id, mode, status, text, words, error, total_ms, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      [.text(e.id.uuidString.lowercased()), .real(e.startedAt.timeIntervalSince1970), .text(e.appName), .text(e.appBundleId),
       .text(e.mode.rawValue), .text(e.status.rawValue), .text(e.text), .int(e.words), .text(e.error),
       .int(e.totalMs), .int(e.synced ? 1 : 0)]
    )
  }

  public func entry(id: UUID) throws -> HistoryEntry? {
    try query("SELECT \(Self.columns) FROM history WHERE id = ?", [.text(id.uuidString.lowercased())], Self.readEntry).first
  }

  /// Nejnovější diktáty; `search` hledá v textu a názvu aplikace (velikost písmen se
  /// nerozlišuje jen u písmen bez diakritiky, tak umí SQLite bez rozšíření).
  public func recent(limit: Int, search: String? = nil, status: HistoryStatus? = nil) throws -> [HistoryEntry] {
    var sql = "SELECT \(Self.columns) FROM history WHERE 1 = 1"
    var params: [SQLValue] = []
    if let search, !search.trimmingCharacters(in: .whitespaces).isEmpty {
      sql += " AND (text LIKE ? ESCAPE '\\' OR app_name LIKE ? ESCAPE '\\')"
      let pattern = "%" + Self.escapeLike(search.trimmingCharacters(in: .whitespaces)) + "%"
      params += [.text(pattern), .text(pattern)]
    }
    if let status {
      sql += " AND status = ?"
      params.append(.text(status.rawValue))
    }
    sql += " ORDER BY started_at DESC LIMIT ?"
    params.append(.int(max(1, min(limit, 5000))))
    return try query(sql, params, Self.readEntry)
  }

  /// Text posledního diktátu, který nějaký text má (menu „Zkopírovat poslední diktát").
  public func latestText() throws -> String? {
    try query(
      "SELECT text FROM history WHERE status IN ('ok','raw','snippet') AND text <> '' ORDER BY started_at DESC LIMIT 1",
      [],
      { stmt in Self.string(stmt, 0) ?? "" }
    ).first
  }

  public func delete(id: UUID) throws {
    try run("DELETE FROM history WHERE id = ?", [.text(id.uuidString.lowercased())])
  }

  /// Smaže historii starší než `date` (kromě diktátů, které ještě čekají ve frontě). Vrátí počet.
  @discardableResult
  public func purgeHistory(olderThan date: Date) throws -> Int {
    try run(
      "DELETE FROM history WHERE started_at < ? AND id NOT IN (SELECT id FROM queue)",
      [.real(date.timeIntervalSince1970)]
    )
    return Int(sqlite3_changes(db))
  }

  // MARK: Fronta

  public func enqueue(_ item: QueueItem) throws {
    let meta = String(decoding: try item.meta.json(), as: UTF8.self)
    try run(
      "INSERT OR REPLACE INTO queue (id, audio_path, meta, attempts, next_attempt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [.text(item.id.uuidString.lowercased()), .text(item.audioPath), .text(meta), .int(item.attempts),
       .real(item.nextAttempt.timeIntervalSince1970), .real(item.createdAt.timeIntervalSince1970)]
    )
  }

  /// Diktáty, na které už přišla řada (nejstarší první).
  public func dueQueue(now: Date = Date()) throws -> [QueueItem] {
    try query(
      "SELECT id, audio_path, meta, attempts, next_attempt, created_at FROM queue WHERE next_attempt <= ? ORDER BY created_at",
      [.real(now.timeIntervalSince1970)],
      Self.readQueue
    ).compactMap { $0 }
  }

  /// Diktáty, které ve frontě čekají déle než 24 h (k vyřazení).
  public func expiredQueue(now: Date = Date()) throws -> [QueueItem] {
    try query(
      "SELECT id, audio_path, meta, attempts, next_attempt, created_at FROM queue WHERE created_at <= ? ORDER BY created_at",
      [.real(now.addingTimeInterval(-RetryPolicy.maxAge).timeIntervalSince1970)],
      Self.readQueue
    ).compactMap { $0 }
  }

  public func allQueue() throws -> [QueueItem] {
    try query("SELECT id, audio_path, meta, attempts, next_attempt, created_at FROM queue ORDER BY created_at", [], Self.readQueue)
      .compactMap { $0 }
  }

  public func reschedule(id: UUID, attempts: Int, next: Date) throws {
    try run(
      "UPDATE queue SET attempts = ?, next_attempt = ? WHERE id = ?",
      [.int(attempts), .real(next.timeIntervalSince1970), .text(id.uuidString.lowercased())]
    )
  }

  public func removeFromQueue(id: UUID) throws {
    try run("DELETE FROM queue WHERE id = ?", [.text(id.uuidString.lowercased())])
  }

  public func queueCount() throws -> Int {
    try query("SELECT COUNT(*) FROM queue", [], { stmt in Int(sqlite3_column_int64(stmt, 0)) }).first ?? 0
  }

  // MARK: SQLite

  enum SQLValue {
    case text(String?)
    case int(Int?)
    case real(Double)
  }

  private static let columns = "id, started_at, app_name, app_bundle_id, mode, status, text, words, error, total_ms, synced"
  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  private func exec(_ sql: String) throws {
    var error: UnsafeMutablePointer<CChar>?
    guard sqlite3_exec(db, sql, nil, nil, &error) == SQLITE_OK else {
      let message = error.map { String(cString: $0) } ?? "exec"
      sqlite3_free(error)
      throw LocalDBError.statement(message)
    }
  }

  private func prepare(_ sql: String, _ params: [SQLValue]) throws -> OpaquePointer {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
      throw LocalDBError.statement(String(cString: sqlite3_errmsg(db)))
    }
    for (offset, value) in params.enumerated() {
      let index = Int32(offset + 1)
      switch value {
      case .text(let text?): sqlite3_bind_text(stmt, index, text, -1, Self.transient)
      case .int(let int?): sqlite3_bind_int64(stmt, index, Int64(int))
      case .real(let real): sqlite3_bind_double(stmt, index, real)
      case .text(nil), .int(nil): sqlite3_bind_null(stmt, index)
      }
    }
    return stmt
  }

  private func run(_ sql: String, _ params: [SQLValue]) throws {
    let stmt = try prepare(sql, params)
    defer { sqlite3_finalize(stmt) }
    guard sqlite3_step(stmt) == SQLITE_DONE else { throw LocalDBError.statement(String(cString: sqlite3_errmsg(db))) }
  }

  private func query<T>(_ sql: String, _ params: [SQLValue], _ read: (OpaquePointer) -> T) throws -> [T] {
    let stmt = try prepare(sql, params)
    defer { sqlite3_finalize(stmt) }
    var rows: [T] = []
    while true {
      let step = sqlite3_step(stmt)
      if step == SQLITE_DONE { break }
      guard step == SQLITE_ROW else { throw LocalDBError.statement(String(cString: sqlite3_errmsg(db))) }
      rows.append(read(stmt))
    }
    return rows
  }

  private static func string(_ stmt: OpaquePointer, _ column: Int32) -> String? {
    guard sqlite3_column_type(stmt, column) != SQLITE_NULL, let raw = sqlite3_column_text(stmt, column) else { return nil }
    return String(cString: raw)
  }

  private static func readEntry(_ stmt: OpaquePointer) -> HistoryEntry {
    HistoryEntry(
      id: UUID(uuidString: string(stmt, 0) ?? "") ?? UUID(),
      startedAt: Date(timeIntervalSince1970: sqlite3_column_double(stmt, 1)),
      appName: string(stmt, 2),
      appBundleId: string(stmt, 3),
      mode: DictationMode(rawValue: string(stmt, 4) ?? "") ?? .hold,
      status: HistoryStatus(rawValue: string(stmt, 5) ?? "") ?? .failed,
      text: string(stmt, 6) ?? "",
      words: Int(sqlite3_column_int64(stmt, 7)),
      error: string(stmt, 8),
      totalMs: sqlite3_column_type(stmt, 9) == SQLITE_NULL ? nil : Int(sqlite3_column_int64(stmt, 9)),
      synced: sqlite3_column_int64(stmt, 10) != 0
    )
  }

  private static func readQueue(_ stmt: OpaquePointer) -> QueueItem? {
    guard let id = UUID(uuidString: string(stmt, 0) ?? ""),
          let path = string(stmt, 1),
          let raw = string(stmt, 2),
          let meta = try? JSONDecoder().decode(DictationMeta.self, from: Data(raw.utf8))
    else { return nil }
    return QueueItem(
      id: id,
      audioPath: path,
      meta: meta,
      attempts: Int(sqlite3_column_int64(stmt, 3)),
      nextAttempt: Date(timeIntervalSince1970: sqlite3_column_double(stmt, 4)),
      createdAt: Date(timeIntervalSince1970: sqlite3_column_double(stmt, 5))
    )
  }

  static func escapeLike(_ text: String) -> String {
    text.replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "%", with: "\\%")
      .replacingOccurrences(of: "_", with: "\\_")
  }
}
