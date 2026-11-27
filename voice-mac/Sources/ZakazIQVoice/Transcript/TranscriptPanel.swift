import AppKit
import Combine
import SwiftUI
import ZakazIQVoiceCore

/// Okno karty s přepisem nad lištou. Jako lišta **nikdy nebere focus**: kurzor zůstane
/// v Claude Code (nebo kdekoli jinde), takže po „Zkopírovat" stačí ⌘V.
@MainActor
final class TranscriptPanel: NSPanel {
  private let model: TranscriptModel
  private var subscriptions = Set<AnyCancellable>()

  init(model: TranscriptModel) {
    self.model = model
    let size = TranscriptLayout.panelSize(textHeight: TranscriptLayout.minTextHeight)
    super.init(
      contentRect: NSRect(origin: .zero, size: size),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    level = .statusBar
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    isOpaque = false
    backgroundColor = .clear
    hasShadow = false
    hidesOnDeactivate = false
    isMovable = false
    isReleasedWhenClosed = false
    becomesKeyOnlyIfNeeded = true
    animationBehavior = .none

    let hosting = FirstClickHostingView(rootView: TranscriptView(model: model))
    hosting.frame = NSRect(origin: .zero, size: size)
    hosting.autoresizingMask = [.width, .height]
    contentView = hosting

    model.$item
      .combineLatest(model.$textHeight)
      .receive(on: RunLoop.main)
      .sink { [weak self] item, height in self?.update(visible: item != nil, textHeight: height) }
      .store(in: &subscriptions)

    NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
      .sink { [weak self] _ in
        guard let self, self.isVisible else { return }
        self.place(textHeight: self.model.textHeight)
      }
      .store(in: &subscriptions)
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  private func update(visible: Bool, textHeight: CGFloat) {
    if visible {
      place(textHeight: textHeight)
      orderFrontRegardless()
    } else if isVisible {
      orderOut(nil)
    }
  }

  /// Na obrazovku s kurzorem (tam, kde je i lišta), nad lištu.
  private func place(textHeight: CGFloat) {
    let screens = NSScreen.screens
    guard !screens.isEmpty else { return }
    let index = BarLayout.screenIndex(containing: NSEvent.mouseLocation, frames: screens.map(\.frame))
    let size = TranscriptLayout.panelSize(textHeight: textHeight)
    let origin = TranscriptLayout.panelOrigin(panelSize: size, visibleFrame: screens[index].visibleFrame)
    setFrame(NSRect(origin: origin, size: size), display: true)
  }
}

/// Hostitel SwiftUI, který přijme první klik (okno nikdy není klíčové, aplikace v liště
/// není aktivní): bez toho by první klik na „Zkopírovat" jen probudil okno.
private final class FirstClickHostingView: NSHostingView<TranscriptView> {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
