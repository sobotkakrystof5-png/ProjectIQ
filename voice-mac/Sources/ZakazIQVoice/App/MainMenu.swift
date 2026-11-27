import AppKit

/// Skryté hlavní menu. Aplikace běží jen v liště menu (`.accessory`), takže horní lišta
/// s menu se nikdy neukáže. Klávesové zkratky v textových polích (⌘V, ⌘C, ⌘X, ⌘A, ⌘Z)
/// ale AppKit hledá právě v hlavním menu: bez položek Úpravy do pole klíče nešlo nic vložit.
/// Položky nemají cíl, akce jde přes responder chain do pole, které má zrovna focus.
enum MainMenu {
  static func make() -> NSMenu {
    let main = NSMenu()

    // První položka hlavního menu je vždy menu aplikace.
    let appMenu = NSMenu()
    appMenu.addItem(item("Zavřít okno", #selector(NSWindow.performClose(_:)), "w"))
    main.addItem(submenu(appMenu, "ZakazIQ Voice"))

    let edit = NSMenu(title: "Úpravy")
    edit.addItem(item("Odvolat", Selector(("undo:")), "z"))
    edit.addItem(item("Znovu", Selector(("redo:")), "z", [.command, .shift]))
    edit.addItem(.separator())
    edit.addItem(item("Vyjmout", #selector(NSText.cut(_:)), "x"))
    edit.addItem(item("Kopírovat", #selector(NSText.copy(_:)), "c"))
    edit.addItem(item("Vložit", #selector(NSText.paste(_:)), "v"))
    edit.addItem(item("Vybrat vše", #selector(NSText.selectAll(_:)), "a"))
    main.addItem(submenu(edit, "Úpravy"))

    return main
  }

  private static func item(
    _ title: String,
    _ action: Selector,
    _ key: String,
    _ modifiers: NSEvent.ModifierFlags = .command
  ) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.keyEquivalentModifierMask = modifiers
    return item
  }

  private static func submenu(_ menu: NSMenu, _ title: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.submenu = menu
    return item
  }
}
