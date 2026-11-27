import AppKit
import Combine
import ZakazIQVoiceCore

/// Karta s přepisem nad lištou (volba „Po diktátu: Ukázat přepis"). Plní ji
/// `DictationController`, kreslí `TranscriptPanel`.
@MainActor
final class TranscriptModel: ObservableObject {
  struct Item: Equatable {
    let id: UUID
    let text: String
    let words: Int
    /// Aplikace, ve které se diktovalo (jen do hlavičky karty).
    let appName: String?
  }

  @Published private(set) var item: Item?
  @Published private(set) var copied = false
  /// Výška textu v kartě a jestli se posouvá (změřeno při `show`).
  @Published private(set) var textHeight: CGFloat = TranscriptLayout.minTextHeight
  @Published private(set) var scrollable = false

  /// Zkopírování textu (řadič ho dá do schránky).
  var onCopy: ((String) -> Void)?

  /// Jak dlouho po zkopírování karta ještě zůstane (potvrzení „Zkopírováno").
  static let hideAfterCopy: TimeInterval = 1.2

  private var hideTask: Task<Void, Never>?

  var isVisible: Bool { item != nil }

  func show(_ item: Item) {
    cancelHide()
    let measured = Self.measure(item.text)
    textHeight = TranscriptLayout.textHeight(measured: measured)
    scrollable = TranscriptLayout.isScrollable(measured: measured)
    copied = false
    self.item = item
  }

  func copy() {
    guard let item else { return }
    onCopy?(item.text)
    copied = true
    cancelHide()
    hideTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(Self.hideAfterCopy))
      guard !Task.isCancelled else { return }
      self?.hide()
    }
  }

  func hide() {
    cancelHide()
    item = nil
    copied = false
  }

  private func cancelHide() {
    hideTask?.cancel()
    hideTask = nil
  }

  /// Písmo a řádkování textu v kartě (stejné jako v `TranscriptView`).
  static let fontSize: CGFloat = 14
  static let lineSpacing: CGFloat = 3

  /// Výška textu při šířce karty, stejným písmem, jakým se kreslí.
  static func measure(_ text: String) -> CGFloat {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = lineSpacing
    let rect = (text as NSString).boundingRect(
      with: NSSize(width: TranscriptLayout.textWidth, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      attributes: [.font: DilkyFont.nsSans(fontSize), .paragraphStyle: paragraph]
    )
    // Rezerva: SwiftUI zalamuje o chlup jinak než AppKit.
    return rect.height + 4
  }
}
