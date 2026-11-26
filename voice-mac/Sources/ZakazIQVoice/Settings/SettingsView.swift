import SwiftUI
import ZakazIQVoiceCore

/// Okno Nastavení (VO03). Jedna hlavní akce: Vyzkoušet připojení.
struct SettingsView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      header
      connectionCard
      dictationCard
      permissionsCard
    }
    .padding(.horizontal, 24)
    .padding(.top, 40)
    .padding(.bottom, 24)
    .frame(width: 520)
    .fixedSize(horizontal: false, vertical: true)
    .background(Dilky.ground)
    .foregroundStyle(Dilky.navy950)
  }

  // MARK: Hlavička

  private var header: some View {
    HStack(spacing: 12) {
      LogoMark(size: 36)
      VStack(alignment: .leading, spacing: 2) {
        Text("ZakazIQ Voice")
          .font(DilkyFont.sans(20, weight: 600))
          .kerning(-0.4)
        Text("Diktování do jakékoli aplikace na Macu.")
          .font(DilkyFont.sans(13))
          .foregroundStyle(Dilky.quiet)
      }
    }
    .padding(.horizontal, 4)
  }

  // MARK: Připojení

  private var connectionCard: some View {
    Card(title: "Připojení") {
      VStack(alignment: .leading, spacing: 8) {
        FieldLabel("Adresa serveru")
        HStack(spacing: 8) {
          DilkyTextField(placeholder: "https://www.zakaziq.cz", text: $model.serverText, mono: true)
            .onSubmit { model.saveServer() }
          Button("Uložit") { model.saveServer() }
            .buttonStyle(SecondaryButton())
        }
        HStack(spacing: 4) {
          Text("Rychle:")
            .foregroundStyle(Dilky.quiet)
          // `verbatim`: jinak by SwiftUI z „www.…" udělal webový odkaz v systémové modré.
          Button { model.useServer(ServerAddress.production) } label: { Text(verbatim: "www.zakaziq.cz") }
            .buttonStyle(LinkButton())
          Text(verbatim: "·").foregroundStyle(Dilky.quiet)
          Button { model.useServer(ServerAddress.development) } label: { Text(verbatim: "localhost:3000 (vývoj)") }
            .buttonStyle(LinkButton())
        }
        .font(DilkyFont.sans(12))
        if let error = model.serverError {
          Message(text: error, tone: .danger)
        }
      }

      Divider().overlay(Dilky.navy100)

      VStack(alignment: .leading, spacing: 8) {
        FieldLabel("Klíč zařízení")
        if let masked = model.maskedKey {
          HStack(spacing: 8) {
            Text(verbatim: masked)
              .font(DilkyFont.mono(13))
              .accessibilityLabel("Klíč je uložený v Klíčence")
            Text("v Klíčence")
              .font(DilkyFont.sans(12))
              .foregroundStyle(Dilky.quiet)
            Spacer()
            Button("Smazat") { model.deleteKey() }
              .buttonStyle(LinkButton(tone: .danger))
          }
          .frame(minHeight: 40)
        } else {
          HStack(spacing: 8) {
            DilkyTextField(placeholder: "zk_voice_…", text: $model.keyInput, mono: true, secure: true)
              .onSubmit { model.saveKey() }
            Button("Uložit") { model.saveKey() }
              .buttonStyle(SecondaryButton())
          }
          Text("Klíč vytvoříte v adminu v části ZakazIQ Voice › Zařízení. Uloží se jen do Klíčenky.")
            .font(DilkyFont.sans(12))
            .foregroundStyle(Dilky.quiet)
            .fixedSize(horizontal: false, vertical: true)
        }
        if model.canRestoreKey {
          HStack(spacing: 6) {
            Text("Klíč smazaný.")
            Button("Vrátit") { model.restoreKey() }
              .buttonStyle(LinkButton())
          }
          .font(DilkyFont.sans(13))
        }
        if let error = model.keyError {
          Message(text: error, tone: .danger)
        }
      }

      Divider().overlay(Dilky.navy100)

      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 12) {
          Button("Vyzkoušet připojení") { Task { await model.testConnection() } }
            .buttonStyle(PrimaryButton())
            .disabled(!model.hasKey || model.connection == .checking)
          if model.connection == .checking {
            ProgressView().controlSize(.small)
            Text("Ověřuji…")
              .font(DilkyFont.sans(13))
              .foregroundStyle(Dilky.quiet)
          }
        }
        connectionResult
      }
    }
  }

  @ViewBuilder
  private var connectionResult: some View {
    switch model.connection {
    case .connected(let device, let warning):
      VStack(alignment: .leading, spacing: 4) {
        Message(text: VoiceMessages.connected(to: device), tone: .ok)
        if let warning {
          Message(text: warning, tone: .quiet)
        }
      }
    case .failed(let text):
      Message(text: text, tone: .danger)
    case .unknown, .checking:
      EmptyView()
    }
  }

  // MARK: Diktování

  private var dictationCard: some View {
    Card(title: "Diktování") {
      VStack(alignment: .leading, spacing: 8) {
        FieldLabel("Klávesa")
        HStack(spacing: 8) {
          ForEach(DictationShortcut.allCases) { shortcut in
            Button { model.setShortcut(shortcut) } label: { Text(verbatim: shortcut.title) }
              .buttonStyle(ChoiceButton(selected: model.shortcut == shortcut))
              .accessibilityAddTraits(model.shortcut == shortcut ? .isSelected : [])
          }
        }
        Text("Podržte klávesu a mluvte, po puštění se text vloží. Dvojím klepnutím diktujete bez držení, Esc diktát zruší.")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
          .fixedSize(horizontal: false, vertical: true)
      }
      Divider().overlay(Dilky.navy100)
      ToggleRow(
        title: "Ukazovat lištu v klidu",
        detail: "Malá lišta dole uprostřed obrazovky. Když ji vypnete, objeví se jen při diktování.",
        isOn: $model.showBarWhenIdle
      )
      ToggleRow(
        title: "Zvuk při diktování",
        detail: "Krátký tón na začátku a na konci nahrávání.",
        isOn: $model.sounds
      )
      if model.shortcut == .fn, let advice = model.fnUsage.advice {
        Divider().overlay(Dilky.navy100)
        VStack(alignment: .leading, spacing: 8) {
          Message(text: advice, tone: .quiet)
          Button("Otevřít Nastavení klávesnice") { model.openKeyboardSettings() }
            .buttonStyle(SecondaryButton())
        }
      }
    }
  }

  // MARK: Oprávnění

  private var permissionsCard: some View {
    Card(title: "Oprávnění") {
      Text("Diktování potřebuje tři povolení. Stačí je dát jednou.")
        .font(DilkyFont.sans(13))
        .foregroundStyle(Dilky.quiet)
      VStack(spacing: 0) {
        ForEach(Array(PermissionKind.allCases.enumerated()), id: \.element) { index, kind in
          if index > 0 { Divider().overlay(Dilky.navy100) }
          PermissionRow(kind: kind, state: model.permissions[kind] ?? .notAsked) {
            Task { await model.request(kind) }
          }
        }
      }
    }
  }
}

// MARK: - Části okna

private struct PermissionRow: View {
  let kind: PermissionKind
  let state: PermissionState
  let action: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(kind.title).font(DilkyFont.sans(14, weight: 500))
        Text(kind.reason).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
      }
      Spacer()
      if state == .granted {
        HStack(spacing: 6) {
          Circle().fill(Dilky.navy700).frame(width: 7, height: 7)
          Text(state.label).font(DilkyFont.sans(13, weight: 500)).foregroundStyle(Dilky.navy700)
        }
      } else {
        Text(state.label).font(DilkyFont.sans(13)).foregroundStyle(Dilky.quiet)
        Button(Permissions.shouldOpenSettings(kind) ? "Otevřít Nastavení" : "Povolit", action: action)
          .buttonStyle(SecondaryButton())
      }
    }
    .frame(minHeight: 56)
    .accessibilityElement(children: .combine)
  }
}

private struct Card<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(title)
        .font(DilkyFont.sans(15, weight: 600))
        .kerning(-0.2)
      content
    }
    .padding(20)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
  }
}

private struct FieldLabel: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text).font(DilkyFont.sans(13, weight: 500))
  }
}

private struct Message: View {
  enum Tone { case ok, danger, quiet }
  let text: String
  let tone: Tone

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      if tone != .quiet {
        Circle().fill(color).frame(width: 7, height: 7).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
      }
      Text(text)
        .font(DilkyFont.sans(13, weight: tone == .ok ? 500 : 400))
        .foregroundStyle(tone == .quiet ? Dilky.quiet : color)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
    }
  }

  private var color: Color {
    switch tone {
    case .ok: return Dilky.navy700
    case .danger: return Dilky.danger
    case .quiet: return Dilky.quiet
    }
  }
}

private struct DilkyTextField: View {
  let placeholder: String
  @Binding var text: String
  var mono = false
  var secure = false
  @FocusState private var focused: Bool

  var body: some View {
    Group {
      if secure {
        SecureField("", text: $text, prompt: prompt)
      } else {
        TextField("", text: $text, prompt: prompt)
      }
    }
    .textFieldStyle(.plain)
    .font(mono ? DilkyFont.mono(13) : DilkyFont.sans(14))
    .autocorrectionDisabled()
    .focused($focused)
    .padding(.horizontal, 12)
    .frame(height: 40)
    .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(focused ? Dilky.navy700 : Dilky.navy100, lineWidth: focused ? 2 : 1)
    )
  }

  private var prompt: Text {
    Text(placeholder).foregroundStyle(Dilky.quiet.opacity(0.7))
  }
}

// MARK: - Tlačítka (pilulky, Dílky §3)

private struct PrimaryButton: ButtonStyle {
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(14, weight: 600))
      .foregroundStyle(Color.white)
      .padding(.horizontal, 22)
      .frame(height: 44)
      .background(configuration.isPressed ? Dilky.navy800 : Dilky.navy700, in: Capsule())
      .opacity(enabled ? 1 : 0.4)
      .contentShape(Capsule())
  }
}

private struct SecondaryButton: ButtonStyle {
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 500))
      .foregroundStyle(Dilky.navy950)
      .padding(.horizontal, 16)
      .frame(height: 40)
      .background(configuration.isPressed ? Dilky.navy50 : Dilky.surface, in: Capsule())
      .overlay(Capsule().strokeBorder(Dilky.navy100, lineWidth: 1))
      .opacity(enabled ? 1 : 0.4)
      .contentShape(Capsule())
  }
}

/// Řádek s přepínačem (plocha 44 px, popis pod názvem).
private struct ToggleRow: View {
  let title: String
  let detail: String
  @Binding var isOn: Bool

  var body: some View {
    Toggle(isOn: $isOn) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(DilkyFont.sans(14, weight: 500))
        Text(detail)
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .toggleStyle(.switch)
    .tint(Dilky.navy700)
    .frame(minHeight: 44)
  }
}

/// Výběr z několika možností (zkratka): vybraná pilulka plná `navy-700`, ostatní obrys.
private struct ChoiceButton: ButtonStyle {
  let selected: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: selected ? 600 : 500))
      .foregroundStyle(selected ? Color.white : Dilky.navy950)
      .padding(.horizontal, 18)
      .frame(minWidth: 72, minHeight: 40)
      .background(selected ? Dilky.navy700 : (configuration.isPressed ? Dilky.navy50 : Dilky.surface), in: Capsule())
      .overlay(Capsule().strokeBorder(selected ? Dilky.navy700 : Dilky.navy100, lineWidth: 1))
      .contentShape(Capsule())
  }
}

private struct LinkButton: ButtonStyle {
  enum Tone { case normal, danger }
  var tone: Tone = .normal

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 500))
      .foregroundStyle(tone == .danger ? Dilky.danger : Dilky.navy700)
      .underline(configuration.isPressed)
      .contentShape(Rectangle())
  }
}
