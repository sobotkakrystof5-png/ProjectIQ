import Foundation
import ZakazIQVoiceCore

/// Místní historie (`LocalDB`, VO06) pro záložku Historie v okně (VO11).
@MainActor
final class LocalHistorySource: DictationHistorySource {
  private let dictation: DictationController

  init(dictation: DictationController) {
    self.dictation = dictation
  }

  func recent(limit: Int) -> [HistoryRow] {
    ((try? dictation.history?.recent(limit: limit)) ?? []).map(Self.row)
  }

  func delete(id: UUID) {
    try? dictation.history?.delete(id: id)
  }

  func deleteAll() {
    try? dictation.history?.deleteAllHistory()
  }

  func retry(id: UUID) {
    dictation.retryQueued(id: id)
  }

  static func row(_ e: HistoryEntry) -> HistoryRow {
    HistoryRow(
      id: e.id,
      startedAt: e.startedAt,
      appName: e.appName,
      status: status(e.status),
      words: e.words,
      text: e.text.isEmpty ? nil : e.text,
      corrected: e.userEdited
    )
  }

  static func status(_ s: HistoryStatus) -> HistoryRowStatus {
    switch s {
    case .pending: return .queued
    case .ok: return .ok
    case .raw: return .raw
    case .snippet: return .snippet
    case .empty: return .empty
    case .blocked: return .blocked
    case .cancelled: return .cancelled
    case .failed: return .failed
    }
  }
}
