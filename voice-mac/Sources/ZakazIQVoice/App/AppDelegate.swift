import AppKit
import Combine
import SwiftUI
import ZakazIQVoiceCore

/// Aplikace v liště menu (bez ikony v Docku, `LSUIElement`). Menu: stav připojení,
/// Diktovat, Zkopírovat poslední diktát, Otevřít ZakazIQ Voice (okno VO11),
/// Vyzkoušet připojení, Ukončit. Dole na obrazovce lišta (VO05).
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private let dictation = DictationController()
  private lazy var model = AppModel(dictation: dictation)
  private var statusItem: NSStatusItem?
  private var statusLine: NSMenuItem?
  private var noticeLine: NSMenuItem?
  private var dictateItem: NSMenuItem?
  private var queueLine: NSMenuItem?
  /// Místní historie pro okno; okno ji drží slabě, proto tady.
  private lazy var historySource = LocalHistorySource(dictation: dictation)
  private lazy var hub = HubWindowController(app: model, history: dictation.history == nil ? nil : historySource)
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

    // Hláška na liště bez nabídky kopírování (chyba, fronta) otevře Historii.
    dictation.bar.onOpenHistory = { [weak self] in self?.hub.show(tab: .history) }
    dictation.$historyRevision
      .dropFirst()
      .receive(on: RunLoop.main)
      .sink { [weak self] _ in
        guard let self, self.hub.isVisible else { return }
        self.hub.hub.reloadHistory()
      }
      .store(in: &subscriptions)

    startHotkey()
    dictation.startBackground()

    if model.hasKey {
      Task { await model.testConnection() }
    } else {
      // Bez klíče okno samo ukáže úvod (oprávnění, klíč, zkouška).
      hub.show()
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

  @objc private func openWindow() { hub.show() }

  /// Otevře okno na Nastavení, ať je výsledek vidět, a ověří připojení.
  @objc private func testConnection() {
    hub.show(tab: .settings)
    Task { await model.testConnection() }
  }

  @objc private func quit() { NSApp.terminate(nil) }
}
