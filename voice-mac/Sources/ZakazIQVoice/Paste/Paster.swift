import AppKit
import ApplicationServices
import Carbon.HIToolbox
import CoreGraphics
import ZakazIQVoiceCore

/// Vložení textu tam, kde je kurzor (VO06, plán oddíl 3 bod 5).
///
/// 1. Uloží všechny položky schránky (všechny typy).
/// 2. Vloží text a pošle ⌘V do aplikace vpředu.
/// 3. Za 0,6 s schránku vrátí — **jen když `changeCount` je pořád ten náš**
///    (mezitím si mohl Kryštof sám něco zkopírovat).
@MainActor
final class Paster {
  /// Typ, podle kterého správci schránky (Maccy, Raycast…) položku nezapíšou do historie.
  static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")

  /// Smí aplikace posílat klávesy (Zpřístupnění)?
  static var canPostEvents: Bool { AXIsProcessTrusted() }

  func paste(_ text: String) {
    let board = NSPasteboard.general
    let saved = Self.snapshot(board)

    board.clearContents()
    let item = NSPasteboardItem()
    item.setString(text, forType: .string)
    item.setData(Data(), forType: Self.transientType)
    board.writeObjects([item])
    let ours = board.changeCount

    Self.postCommandV()

    DispatchQueue.main.asyncAfter(deadline: .now() + PastePlan.restoreDelay) {
      guard PastePlan.shouldRestoreClipboard(currentChangeCount: board.changeCount, ourChangeCount: ours) else { return }
      board.clearContents()
      if !saved.isEmpty { board.writeObjects(saved) }
    }
  }

  /// Text jen do schránky (nevkládá se). Bez příznaku „dočasné", ať ho správce schránky zná.
  func copy(_ text: String) {
    let board = NSPasteboard.general
    board.clearContents()
    board.setString(text, forType: .string)
  }

  /// Kopie všech položek a typů schránky (obrázky, soubory, formátovaný text).
  private static func snapshot(_ board: NSPasteboard) -> [NSPasteboardItem] {
    (board.pasteboardItems ?? []).map { original in
      let copy = NSPasteboardItem()
      for type in original.types {
        if let data = original.data(forType: type) { copy.setData(data, forType: type) }
      }
      return copy
    }
  }

  private static func postCommandV() {
    let source = CGEventSource(stateID: .combinedSessionState)
    let key = CGKeyCode(kVK_ANSI_V)
    let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false)
    down?.flags = .maskCommand
    up?.flags = .maskCommand
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
  }
}
