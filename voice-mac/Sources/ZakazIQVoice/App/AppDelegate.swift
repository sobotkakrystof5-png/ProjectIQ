import AppKit
import Combine
import SwiftUI
import ZakazIQVoiceCore

/// Aplikace v liště menu (bez ikony v Docku, `LSUIElement`). Menu: stav připojení,
/// Diktovat, Otevřít ZakazIQ Voice, Vyzkoušet připojení, Ukončit.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private let dictation = DictationController()
  private lazy var model = AppModel(dictation: dictation)
  private var statusItem: NSStatusItem?
  private var statusLine: NSMenuItem?
  private var noticeLine: NSMenuItem?
  private var dictateItem: NSMenuItem?
  private var queueLine: NSMenuItem?
  private var window: NSWindow?
  private var permissionTimer: Timer?
  private var hotkeyTimer: Timer?
  private var bar: FlowBarPanel?
  private var subscriptions = Set<AnyCancellable>()

  func applicationDidFinishLaunching(_ notification: Notification) {
    DilkyFont.register()
    setUpStatusItem()
    let bar = FlowBarPanel(model: dictation.bar)
    bar.placeOnCursorScreen()
    if dictation.bar.isVisible { bar.orderFrontRegardless() }
    self.bar = bar

    model.$connection
      .receive(on: RunLoop.main)
      .sink { [weak self] state in self?.statusLine?.title = state.menuLine }
      .store(in: &subscriptions)

    NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
      .sink { [weak self] _ in self?.model.refreshPermissions() }
      .store(in: &subscriptions)

    dictation.$phase
      .receive(on: RunLoop.main)
      .sink { [weak self] phase in self?.updateStatusIcon(phase) }
      .store(in: &subscriptions)

    dictation.$notice
      .receive(on: RunLoop.main)
      .sink { [weak self] text in
        self?.noticeLine?.title = text ?? ""
        self?.noticeLine?.isHidden = text == nil
      }
      .store(in: &subscriptions)

    startHotkey()
    dictation.startBackground()

    if model.hasKey {
      Task { await model.testConnection() }
    } else {
      showWindow()
    }
  }

  // MARK: Lišta menu

  private func setUpStatusItem() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = TileMark.menuBarImage()
    item.button?.toolTip = "ZakazIQ Voice"

    let menu = NSMenu()
    menu.delegate = self
    menu.autoenablesItems = false

    let line = NSMenuItem(title: model.connection.menuLine, action: nil, keyEquivalent: "")
    line.isEnabled = false
    menu.addItem(line)
    statusLine = line
    menu.addItem(.separator())

    let notice = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    notice.isEnabled = false
    notice.isHidden = true
    menu.addItem(notice)
    noticeLine = notice
    menu.addItem(.separator())

    let dictate = makeItem("Diktovat", #selector(toggleDictation), key: "")
    dictate.toolTip = "Diktát bez držení klávesy. Ukončíte ho dalším klepnutím nebo klávesou."
    menu.addItem(dictate)
    dictateItem = dictate
    menu.addItem(makeItem("Zkopírovat poslední diktát", #selector(copyLast), key: ""))
    let queue = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    queue.isEnabled = false
    queue.isHidden = true
    menu.addItem(queue)
    queueLine = queue
    menu.addItem(.separator())

    menu.addItem(makeItem("Otevřít ZakazIQ Voice…", #selector(openWindow), key: ","))
    menu.addItem(makeItem("Vyzkoušet připojení", #selector(testConnection), key: ""))
    #if DEBUG
    menu.addItem(makeItem("Ladění: lišta zpracovává", #selector(debugProcessing), key: ""))
    #endif
    menu.addItem(.separator())
    menu.addItem(makeItem("Ukončit ZakazIQ Voice", #selector(quit), key: "q"))

    item.menu = menu
    statusItem = item
  }

  private func makeItem(_ title: String, _ action: Selector, key: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.target = self
    return item
  }

  func menuWillOpen(_ menu: NSMenu) {
    statusLine?.title = model.connection.menuLine
    dictateItem?.title = dictation.phase == .recording ? "Dokončit diktát" : "Diktovat"
    dictateItem?.isEnabled = dictation.phase != .processing
    let waiting = dictation.queueCount
    queueLine?.isHidden = waiting == 0
    queueLine?.title = "Ve frontě: \(waiting) \(Self.dictationWord(waiting))"
  }

  @objc private func toggleDictation() { dictation.toggleFromMenu() }
  @objc private func copyLast() { dictation.copyLastDictation() }

  /// 1 diktát, 2–4 diktáty, 5 a víc diktátů.
  static func dictationWord(_ count: Int) -> String {
    switch count {
    case 1: return "diktát"
    case 2...4: return "diktáty"
    default: return "diktátů"
    }
  }

  #if DEBUG
  @objc private func debugProcessing() { dictation.debugShowProcessing() }
  #endif

  private func updateStatusIcon(_ phase: DictationController.Phase) {
    statusItem?.button?.image = TileMark.menuBarImage(active: phase == .recording)
  }

  // MARK: Zkratka

  /// Zachytávání zkratky potřebuje Sledování vstupu a Zpřístupnění. Dokud chybí,
  /// zkouší se znovu každé 3 s (oprávnění se mění v Nastavení systému bez zprávy aplikaci).
  private func startHotkey() {
    dictation.startHotkey()
    guard !dictation.hotkeyReady, hotkeyTimer == nil else { return }
    let timer = Timer(timeInterval: 3, repeats: true) { [weak self] timer in
      MainActor.assumeIsolated {
        guard let self else { return timer.invalidate() }
        self.dictation.startHotkey()
        if self.dictation.hotkeyReady {
          timer.invalidate()
          self.hotkeyTimer = nil
        }
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    hotkeyTimer = timer
  }

  @objc private func openWindow() { showWindow() }

  /// Otevře okno, ať je výsledek vidět, a ověří připojení.
  @objc private func testConnection() {
    showWindow()
    Task { await model.testConnection() }
  }

  @objc private func quit() { NSApp.terminate(nil) }

  // MARK: Okno

  private func showWindow() {
    if window == nil {
      let hosting = NSHostingView(rootView: SettingsView(model: model))
      let win = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 520, height: 640),
        styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
        backing: .buffered,
        defer: false
      )
      win.title = "ZakazIQ Voice"
      win.titlebarAppearsTransparent = true
      win.titleVisibility = .hidden
      win.isMovableByWindowBackground = true
      win.backgroundColor = Dilky.groundNS
      // Dílky v aplikaci zatím jen ve světlé podobě; tmavou dodá VO11 s velkým oknem.
      win.appearance = NSAppearance(named: .aqua)
      win.isReleasedWhenClosed = false
      win.contentView = hosting
      win.setContentSize(hosting.fittingSize)
      win.center()
      win.delegate = self
      window = win
    }
    model.refreshPermissions()
    startPermissionTimer()
    NSApp.activate()
    window?.makeKeyAndOrderFront(nil)
    #if DEBUG
    snapshotIfRequested()
    #endif
  }

  #if DEBUG
  /// Jen ladicí sestavení: `ZAKAZIQ_VOICE_SNAPSHOT=/cesta.png` vykreslí obsah okna do PNG
  /// (kontrola vzhledu bez oprávnění Nahrávání obrazovky).
  private func snapshotIfRequested() {
    guard let path = ProcessInfo.processInfo.environment["ZAKAZIQ_VOICE_SNAPSHOT"], !path.isEmpty else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      guard let view = self?.window?.contentView,
            let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds)
      else { return }
      view.cacheDisplay(in: view.bounds, to: rep)
      try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    }
  }
  #endif

  /// Zpřístupnění se mění v Nastavení systému, aniž by aplikace dostala zprávu —
  /// dokud je okno otevřené, stav se kontroluje každou vteřinu a půl.
  private func startPermissionTimer() {
    permissionTimer?.invalidate()
    permissionTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.model.refreshPermissions() }
    }
  }
}

extension AppDelegate: NSWindowDelegate {
  func windowWillClose(_ notification: Notification) {
    permissionTimer?.invalidate()
    permissionTimer = nil
  }
}
