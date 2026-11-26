import AppKit

// Vstup aplikace. Bez SwiftUI `App`: lišta menu a okna řídí AppKit (VO04–VO06 přidají
// lištu dole a zachytávání Fn, na to je NSStatusItem a NSPanel pružnější).
MainActor.assumeIsolated {
  let app = NSApplication.shared
  let delegate = AppDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
}
