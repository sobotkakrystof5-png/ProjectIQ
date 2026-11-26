import AppKit
import SwiftUI
import ZakazIQVoiceCore

/// Okno ZakazIQ Voice (VO11). Jedno na celou aplikaci; otevře ho „Otevřít ZakazIQ Voice…"
/// v menu a dvojklik na lištu. Pamatuje si polohu a velikost.
@MainActor
final class HubWindowController: NSObject, NSWindowDelegate {
  let hub: HubModel
  private let app: AppModel
  private var window: NSWindow?
  private var permissionTimer: Timer?

  init(app: AppModel, history: DictationHistorySource? = nil) {
    self.app = app
    hub = HubModel(app: app, history: history)
    super.init()
  }

  var isVisible: Bool { window?.isVisible == true }

  /// Otevře okno (volitelně na dané záložce) a dá ho dopředu.
  func show(tab: HubTab? = nil) {
    if let tab { hub.tab = tab }
    if window == nil { window = makeWindow() }
    app.refreshPermissions()
    startPermissionTimer()
    NSApp.activate()
    window?.makeKeyAndOrderFront(nil)
    Task { await hub.refresh() }
    #if DEBUG
    snapshotIfRequested()
    #endif
  }

  private func makeWindow() -> NSWindow {
    let hosting = NSHostingView(rootView: HubRootView(hub: hub, app: app))
    let win = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 980, height: 680),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    win.title = "ZakazIQ Voice"
    win.titlebarAppearsTransparent = true
    win.titleVisibility = .hidden
    win.backgroundColor = Dilky.groundNS
    // Dílky v aplikaci zatím jen ve světlé podobě.
    win.appearance = NSAppearance(named: .aqua)
    win.isReleasedWhenClosed = false
    win.contentMinSize = NSSize(width: 860, height: 560)
    win.contentView = hosting
    win.delegate = self
    if !win.setFrameUsingName("ZakazIQVoiceHub") { win.center() }
    win.setFrameAutosaveName("ZakazIQVoiceHub")
    return win
  }

  /// Oprávnění se mění v Nastavení systému bez zprávy aplikaci — dokud je okno otevřené,
  /// stav se kontroluje každou vteřinu a půl.
  private func startPermissionTimer() {
    permissionTimer?.invalidate()
    permissionTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
      Task { @MainActor in
        self?.app.refreshPermissions()
        self?.hub.reloadHistory()
      }
    }
  }

  func windowWillClose(_ notification: Notification) {
    permissionTimer?.invalidate()
    permissionTimer = nil
  }

  #if DEBUG
  /// Jen ladicí sestavení: `ZAKAZIQ_VOICE_SNAPSHOT=/cesta.png` (a volitelně
  /// `ZAKAZIQ_VOICE_TAB=history`) vykreslí obsah okna do PNG bez oprávnění Nahrávání obrazovky.
  private func snapshotIfRequested() {
    let env = ProcessInfo.processInfo.environment
    guard let path = env["ZAKAZIQ_VOICE_SNAPSHOT"], !path.isEmpty else { return }
    if let raw = env["ZAKAZIQ_VOICE_TAB"], let tab = HubTab(rawValue: raw) { hub.tab = tab }
    if env["ZAKAZIQ_VOICE_ONBOARDING"] == "0" { hub.showOnboarding = false }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
      guard let view = self?.window?.contentView,
            let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds)
      else { return }
      view.cacheDisplay(in: view.bounds, to: rep)
      try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    }
  }
  #endif
}
