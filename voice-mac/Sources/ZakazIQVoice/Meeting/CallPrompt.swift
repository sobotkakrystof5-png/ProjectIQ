import AppKit
import Combine
import SwiftUI
import ZakazIQVoiceCore

/// Nabídka u hovoru nad lištou (R-152): „Nahrát a přepsat schůzku?" na začátku hovoru,
/// „Hovor skončil?" po jeho konci a během schůzky „Druhou stranu zatím neslyším", když
/// zvuk počítače zůstává potichu. Plní ji `CallWatcher`, kreslí `CallPromptPanel`.
@MainActor
final class CallPromptModel: ObservableObject {
  enum Kind: Equatable {
    case start
    case end
    /// Během schůzky: zvuk počítače je potichu, nejspíš chybí povolení Nahrávání zvuku systému.
    case silentOther
  }

  struct Prompt: Equatable {
    let kind: Kind
    /// „Google Meet", „Zoom", u prohlížeče bez poznané služby „Chrome".
    let label: String
    /// Věta navíc pod vysvětlením (třeba „Hraje to z reproduktorů…").
    var note: String?

    var title: String {
      switch kind {
      case .start: return "Nahrát a přepsat schůzku?"
      case .end: return "Hovor skončil?"
      case .silentOther: return "Druhou stranu zatím neslyším"
      }
    }

    var detail: String {
      switch kind {
      case .start:
        return "Nahraje se váš hlas i druhá strana a po konci uvidíte přepis. Řekněte druhé straně, že nahráváte."
      case .end:
        let minutes = Int(CallWatcher.endTimeout / 60)
        return "\(label) už nepoužívá mikrofon. Když nic nezvolíte, nahrávání za \(minutes) minuty skončí."
      case .silentOther:
        return "Zvuk počítače je potichu, v přepisu by byl jen váš hlas. Povolte ZakazIQ Voice nahrávání zvuku systému a hovor pusťte přes tento Mac."
      }
    }

    var primaryTitle: String {
      switch kind {
      case .start: return "Nahrát schůzku"
      case .end: return "Ukončit"
      case .silentOther: return "Otevřít Nastavení"
      }
    }

    var secondaryTitle: String {
      switch kind {
      case .start: return "Teď ne"
      case .end: return "Nahrávat dál"
      case .silentOther: return "V pořádku"
      }
    }
  }

  @Published private(set) var prompt: Prompt?

  var onRecord: (() -> Void)?
  var onNotNow: (() -> Void)?
  var onStop: (() -> Void)?
  var onKeep: (() -> Void)?
  var onOpenSettings: (() -> Void)?
  var onDismiss: (() -> Void)?

  func show(_ prompt: Prompt) { self.prompt = prompt }
  func hide() { prompt = nil }

  func primary() {
    guard let prompt else { return }
    switch prompt.kind {
    case .start: onRecord?()
    case .end: onStop?()
    case .silentOther: onOpenSettings?()
    }
  }

  /// Druhé tlačítko i křížek: nic nezačne ani neskončí.
  func secondary() {
    guard let prompt else { return }
    switch prompt.kind {
    case .start: onNotNow?()
    case .end: onKeep?()
    case .silentOther: onDismiss?()
    }
  }
}

/// Okno nabídky. Jako lišta a karta s přepisem **nikdy nebere focus**: kurzor zůstane
/// v Meetu nebo Zoomu.
@MainActor
final class CallPromptPanel: NSPanel {
  private let model: CallPromptModel
  private var subscriptions = Set<AnyCancellable>()

  init(model: CallPromptModel) {
    self.model = model
    super.init(
      contentRect: NSRect(x: 0, y: 0, width: 10, height: 10),
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

    let hosting = FirstClickPromptHost(rootView: CallPromptRoot(model: model))
    hosting.autoresizingMask = [.width, .height]
    contentView = hosting

    model.$prompt
      .receive(on: RunLoop.main)
      .sink { [weak self] prompt in self?.update(prompt) }
      .store(in: &subscriptions)

    NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
      .sink { [weak self] _ in
        guard let self, let prompt = self.model.prompt else { return }
        self.update(prompt)
      }
      .store(in: &subscriptions)
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  private func update(_ prompt: CallPromptModel.Prompt?) {
    guard let prompt else {
      if isVisible { orderOut(nil) }
      return
    }
    // Velikost karty pro tenhle text (změřená stejným kreslením, jakým se ukáže).
    let size = NSHostingView(rootView: CallPromptCard(prompt: prompt, primary: {}, secondary: {})).fittingSize
    let screens = NSScreen.screens
    guard !screens.isEmpty else { return }
    let index = BarLayout.screenIndex(containing: NSEvent.mouseLocation, frames: screens.map(\.frame))
    let origin = TranscriptLayout.panelOrigin(panelSize: size, visibleFrame: screens[index].visibleFrame)
    setFrame(NSRect(origin: origin, size: size), display: true)
    orderFrontRegardless()
  }
}

private struct CallPromptRoot: View {
  @ObservedObject var model: CallPromptModel

  var body: some View {
    if let prompt = model.prompt {
      CallPromptCard(prompt: prompt, primary: model.primary, secondary: model.secondary)
    } else {
      Color.clear
    }
  }
}

/// Karta: hlavička s aplikací, otázka, jedna věta vysvětlení, dvě tlačítka. Tmavá jako lišta.
struct CallPromptCard: View {
  static let width: CGFloat = 420

  let prompt: CallPromptModel.Prompt
  let primary: () -> Void
  let secondary: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header.frame(height: 28)
      Spacer().frame(height: 6)
      Text(prompt.title)
        .font(DilkyFont.sans(16, weight: 600))
        .foregroundStyle(Color.white)
        .fixedSize(horizontal: false, vertical: true)
      Spacer().frame(height: 4)
      Text(verbatim: prompt.detail)
        .font(DilkyFont.sans(13))
        .lineSpacing(2)
        .foregroundStyle(Dilky.navy200)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
      if let note = prompt.note {
        Spacer().frame(height: 6)
        Text(verbatim: note)
          .font(DilkyFont.sans(13, weight: 500))
          .lineSpacing(2)
          .foregroundStyle(Color.white)
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer().frame(height: 14)
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        Button(prompt.secondaryTitle, action: secondary).buttonStyle(CallSecondaryButton())
        Button(prompt.primaryTitle, action: primary).buttonStyle(CallPrimaryButton())
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 14)
    .padding(.bottom, 14)
    .frame(width: Self.width, alignment: .topLeading)
    .background(Dilky.navy950.opacity(0.96), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
    .shadow(color: Dilky.navy950.opacity(0.30), radius: 10, y: 6)
    .padding(TranscriptLayout.shadowInset)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Self.accessibilityLabel(prompt.kind))
  }

  static func accessibilityLabel(_ kind: CallPromptModel.Kind) -> String {
    switch kind {
    case .start: return "Nabídka nahrát schůzku"
    case .end: return "Hovor skončil"
    case .silentOther: return "Druhou stranu zatím neslyším"
    }
  }

  private var header: some View {
    HStack(spacing: 8) {
      DilkyMark(tile: 6, mode: .solid, reduceMotion: true)
      Text(prompt.kind == .silentOther ? "Schůzka" : "Hovor")
        .font(DilkyFont.sans(12, weight: 500))
        .foregroundStyle(Dilky.navy200)
      if !prompt.label.isEmpty {
        Text(verbatim: "· \(prompt.label)")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.navy300)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Button(action: secondary) {
        Text(verbatim: "×")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.white)
          .frame(width: 28, height: 28)
          .background(Color.white.opacity(0.10), in: Circle())
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Zavřít")
    }
  }
}

/// Hlavní akce: světlé tlačítko na tmavé ploše, 40 px vysoké.
private struct CallPrimaryButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 600))
      .foregroundStyle(Dilky.navy950)
      .padding(.horizontal, 18)
      .frame(minHeight: 40)
      .background(configuration.isPressed ? Dilky.navy100 : Color.white, in: Capsule())
      .contentShape(Capsule())
  }
}

/// Vedlejší akce: průhledné tlačítko s bílým textem.
private struct CallSecondaryButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 500))
      .foregroundStyle(Color.white)
      .padding(.horizontal, 16)
      .frame(minHeight: 40)
      .background(Color.white.opacity(configuration.isPressed ? 0.18 : 0.10), in: Capsule())
      .contentShape(Capsule())
  }
}

/// Přijme první klik, i když okno není klíčové (jako u karty s přepisem).
private final class FirstClickPromptHost: NSHostingView<CallPromptRoot> {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
