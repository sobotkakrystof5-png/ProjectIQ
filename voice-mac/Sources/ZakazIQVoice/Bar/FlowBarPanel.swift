import AppKit
import Combine
import SwiftUI
import ZakazIQVoiceCore

/// Okno lišty (VO05). **Nikdy nebere focus**: bez toho by se text nevložil do aplikace,
/// ve které Kryštof píše. Je na všech plochách i nad aplikací na celé obrazovce.
@MainActor
final class FlowBarPanel: NSPanel {
  private let model: BarModel
  private var subscriptions = Set<AnyCancellable>()

  init(model: BarModel) {
    self.model = model
    super.init(
      contentRect: NSRect(origin: .zero, size: BarLayout.panelSize),
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

    let hosting = BarHostingView(rootView: FlowBarView(model: model), model: model)
    hosting.frame = NSRect(origin: .zero, size: BarLayout.panelSize)
    contentView = hosting

    model.$stage
      .combineLatest(model.$showWhenIdle)
      .receive(on: RunLoop.main)
      .sink { [weak self] _, _ in self?.updateVisibility() }
      .store(in: &subscriptions)

    NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
      .sink { [weak self] _ in self?.placeOnCursorScreen() }
      .store(in: &subscriptions)
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  /// Na obrazovku s kurzorem, 12 px nad Dockem, vodorovně uprostřed.
  func placeOnCursorScreen() {
    let screens = NSScreen.screens
    guard !screens.isEmpty else { return }
    let index = BarLayout.screenIndex(containing: NSEvent.mouseLocation, frames: screens.map(\.frame))
    let origin = BarLayout.panelOrigin(visibleFrame: screens[index].visibleFrame)
    setFrameOrigin(origin)
  }

  private func updateVisibility() {
    if model.isVisible {
      if !isVisible {
        placeOnCursorScreen()
        orderFrontRegardless()
      }
    } else if isVisible {
      orderOut(nil)
    }
  }
}

/// Hostitel SwiftUI, který přijme první klik (okno nikdy není klíčové) a najetí myši
/// hlásí jen nad plochou pilulky (`.activeAlways`: aplikace v liště není nikdy aktivní).
private final class BarHostingView: NSHostingView<FlowBarView> {
  private let model: BarModel
  private var area: NSTrackingArea?

  init(rootView: FlowBarView, model: BarModel) {
    self.model = model
    super.init(rootView: rootView)
  }

  @available(*, unavailable)
  required init(rootView: FlowBarView) { fatalError("init(rootView:) není podporovaný") }

  @MainActor @preconcurrency required dynamic init?(coder: NSCoder) { fatalError("init(coder:) není podporovaný") }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let area { removeTrackingArea(area) }
    let area = NSTrackingArea(
      rect: bounds,
      options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(area)
    self.area = area
  }

  override func mouseMoved(with event: NSEvent) { updateHover(event) }
  override func mouseEntered(with event: NSEvent) { updateHover(event) }

  override func mouseExited(with event: NSEvent) {
    if model.hovering { model.hovering = false }
  }

  private func updateHover(_ event: NSEvent) {
    let point = convert(event.locationInWindow, from: nil)
    // Kolem malé pilulky v klidu je rezerva, ať se na ni dá trefit (14 px je málo).
    var pill = BarLayout.pillRect(pill: model.pillSize)
    // Pilulka je dole; NSHostingView má osu y dolů (flipped), BarLayout ji počítá zdola.
    if isFlipped { pill.origin.y = bounds.height - pill.height }
    pill = pill.insetBy(dx: -8, dy: -8)
    let inside = pill.contains(point)
    if inside != model.hovering { model.hovering = inside }
  }
}
