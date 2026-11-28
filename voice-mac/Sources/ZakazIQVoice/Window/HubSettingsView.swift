import AVFoundation
import SwiftUI
import ZakazIQVoiceCore

/// Nastavení v okně: diktování, mikrofon, připojení, soukromí, oprávnění, spuštění, o aplikaci.
struct HubSettingsView: View {
  @ObservedObject var hub: HubModel
  @ObservedObject var app: AppModel

  var body: some View {
    HubPage {
      HubPageHeader(title: "Nastavení")
      dictationCard
      meetingsCard
      connectionCard
      privacyCard
      permissionsCard
      systemCard
      aboutCard
    }
  }

  // MARK: Diktování

  private var dictationCard: some View {
    HubCard(title: "Diktování") {
      VStack(alignment: .leading, spacing: 8) {
        Text("Klávesa").font(DilkyFont.sans(13, weight: 500))
        HStack(spacing: 8) {
          ForEach(DictationShortcut.allCases) { shortcut in
            Button { app.setShortcut(shortcut) } label: { Text(verbatim: shortcut.title) }
              .buttonStyle(HubChoiceButton(selected: app.shortcut == shortcut))
              .accessibilityAddTraits(app.shortcut == shortcut ? .isSelected : [])
          }
        }
        Text("Podržte klávesu a mluvte, puštěním diktát skončí. Dvojím klepnutím diktujete bez držení: skončíte klávesou, Enterem, nebo tím, že 10 sekund nemluvíte. Esc diktát zruší.")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
          .fixedSize(horizontal: false, vertical: true)
        if app.shortcut == .fn, let advice = app.fnUsage.advice {
          HubMessage(text: advice)
          Button("Otevřít Nastavení klávesnice") { app.openKeyboardSettings() }
            .buttonStyle(HubSecondaryButton(compact: true))
        }
      }
      Divider().overlay(Dilky.navy100)
      VStack(alignment: .leading, spacing: 8) {
        Text("Po diktátu").font(DilkyFont.sans(13, weight: 500))
        HStack(spacing: 8) {
          ForEach(AfterDictation.allCases) { choice in
            Button { hub.afterDictation = choice } label: { Text(verbatim: choice.title) }
              .buttonStyle(HubChoiceButton(selected: hub.afterDictation == choice))
              .accessibilityAddTraits(hub.afterDictation == choice ? .isSelected : [])
          }
        }
        Text(hub.afterDictation.detail)
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
          .fixedSize(horizontal: false, vertical: true)
      }
      Divider().overlay(Dilky.navy100)
      HubToggleRow(title: "Zvuky", detail: "Krátký zvuk při začátku a konci diktátu.", isOn: $hub.sounds)
      Divider().overlay(Dilky.navy100)
      HubToggleRow(title: "Lišta v klidu", detail: "Malá lišta dole na obrazovce, i když nediktujete. Vypnutá se ukáže jen při diktátu.", isOn: $hub.showBarWhenIdle)
      Divider().overlay(Dilky.navy100)
      microphoneRow
    }
  }

  // MARK: Schůzky

  private var meetingsCard: some View {
    HubCard(title: "Schůzky") {
      HubToggleRow(
        title: "Nabízet nahrání hovoru",
        detail: "Když začne hovor v Meetu, Teams, Zoomu nebo WhatsAppu, nabídne nahrání a přepis. Po konci hovoru nabídne nahrávání ukončit.",
        isOn: $hub.watchCalls
      )
      Divider().overlay(Dilky.navy100)
      systemAudioRow
    }
  }

  /// Nahrávání zvuku systému nemá veřejný dotaz na stav; ví se až ze schůzky (přinesl tap zvuk?).
  private var systemAudioRow: some View {
    let check = Preferences().systemAudioCheck
    return HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Nahrávání zvuku systému").font(DilkyFont.sans(14, weight: 500))
        Text(Self.systemAudioDetail(check)).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet).fixedSize(horizontal: false, vertical: true)
      }
      Spacer()
      if check?.heard == true {
        HStack(spacing: 6) {
          Circle().fill(Dilky.navy700).frame(width: 7, height: 7)
          Text("Funguje").font(DilkyFont.sans(13, weight: 500)).foregroundStyle(Dilky.navy700)
        }
      } else {
        Button("Otevřít Nastavení") { SystemSettingsLink.openSystemAudio() }.buttonStyle(HubSecondaryButton(compact: true))
      }
    }
    .frame(minHeight: 52)
  }

  static func systemAudioDetail(_ check: SystemAudioCheck?) -> String {
    guard let check else { return "Aby šla nahrát druhá strana schůzky. macOS se zeptá při první schůzce." }
    return check.heard
      ? "Druhá strana schůzky se nahrává."
      : "Při poslední schůzce byl zvuk počítače potichu. Povolte ZakazIQ Voice nahrávání zvuku systému."
  }

  private var microphoneRow: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Mikrofon").font(DilkyFont.sans(14, weight: 500))
        Text(AVCaptureDevice.default(for: .audio)?.localizedName ?? "Žádný mikrofon není připojený.")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
        Text("Diktuje se do vstupu, který je vybraný v systému.")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
      }
      Spacer()
      Button("Změnit vstup") {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Sound-Settings.extension?input")!)
      }
      .buttonStyle(HubSecondaryButton(compact: true))
    }
    .frame(minHeight: 48)
  }

  // MARK: Připojení

  private var connectionCard: some View {
    HubCard(title: "Připojení") {
      VStack(alignment: .leading, spacing: 8) {
        Text("Adresa serveru").font(DilkyFont.sans(13, weight: 500))
        HStack(spacing: 8) {
          HubTextField(placeholder: "https://www.zakaziq.cz", text: $app.serverText, mono: true)
            .onSubmit { app.saveServer() }
          Button("Uložit") { app.saveServer() }.buttonStyle(HubSecondaryButton())
        }
        HStack(spacing: 4) {
          Text("Rychle:").foregroundStyle(Dilky.quiet)
          Button { app.useServer(ServerAddress.production) } label: { Text(verbatim: "www.zakaziq.cz") }
            .buttonStyle(HubLinkButton())
          Text(verbatim: "·").foregroundStyle(Dilky.quiet)
          Button { app.useServer(ServerAddress.development) } label: { Text(verbatim: "localhost:3000 (vývoj)") }
            .buttonStyle(HubLinkButton())
        }
        .font(DilkyFont.sans(12))
        if let error = app.serverError { HubMessage(text: error, tone: .danger) }
      }
      Divider().overlay(Dilky.navy100)
      VStack(alignment: .leading, spacing: 8) {
        Text("Klíč zařízení").font(DilkyFont.sans(13, weight: 500))
        if let masked = app.maskedKey {
          HStack(spacing: 8) {
            Text(verbatim: masked).font(DilkyFont.mono(13))
            Text("v Klíčence").font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
            Spacer()
            Button("Smazat") { app.deleteKey() }.buttonStyle(HubLinkButton(tone: .danger))
          }
          .frame(minHeight: 40)
        } else {
          HStack(spacing: 8) {
            HubTextField(placeholder: "zk_voice_…", text: $app.keyInput, mono: true, secure: true)
              .onSubmit { app.saveKey() }
            Button("Uložit") { app.saveKey() }.buttonStyle(HubSecondaryButton())
          }
          Text("Klíč vytvoříte v adminu v části ZakazIQ Voice › Zařízení. Uloží se jen do Klíčenky.")
            .font(DilkyFont.sans(12))
            .foregroundStyle(Dilky.quiet)
        }
        if app.canRestoreKey {
          HStack(spacing: 6) {
            Text("Klíč smazaný.")
            Button("Vrátit") { app.restoreKey() }.buttonStyle(HubLinkButton())
          }
          .font(DilkyFont.sans(13))
        }
        if let error = app.keyError { HubMessage(text: error, tone: .danger) }
      }
      Divider().overlay(Dilky.navy100)
      HStack(spacing: 12) {
        Button("Vyzkoušet připojení") {
          Task {
            await app.testConnection()
            await hub.refresh()
          }
        }
        .buttonStyle(HubPrimaryButton())
        .disabled(!app.hasKey || app.connection == .checking)
        if app.connection == .checking {
          ProgressView().controlSize(.small)
        }
      }
      ConnectionResult(state: app.connection)
    }
  }

  // MARK: Soukromí

  private var privacyCard: some View {
    HubCard(title: "Soukromí a čištění", subtitle: "Tyhle volby platí na serveru, stejně jako v adminu.") {
      if let error = hub.remoteError { HubMessage(text: error, tone: .danger) }
      if let remote = hub.remote {
        HubToggleRow(
          title: "Ukládat text diktátů",
          detail: remote.storeText
            ? "Text zůstává v historii na serveru, dokud ho nesmažete v adminu."
            : "Jen čísla: na serveru se počítají slova a čas, text diktátu se neukládá.",
          isOn: Binding(get: { remote.storeText }, set: { v in Task { await hub.setStoreText(v) } }),
          disabled: hub.savingRemote
        )
        Divider().overlay(Dilky.navy100)
        HubToggleRow(
          title: "Učit se nová slova z oprav",
          detail: "Když stejné slovo opravíte ve třech diktátech, samo se přidá do slovníku.",
          isOn: Binding(get: { remote.autoLearnTerms }, set: { v in Task { await hub.setAutoLearn(v) } }),
          disabled: hub.savingRemote
        )
        Divider().overlay(Dilky.navy100)
        HubToggleRow(
          title: "Učesat text",
          detail: "Doplní interpunkci a vypustí výplňová slova podle stylu. Vypnuté = vkládá se přepis beze změn.",
          isOn: Binding(get: { remote.cleanupEnabled }, set: { v in Task { await hub.setCleanup(v) } }),
          disabled: hub.savingRemote
        )
      } else if hub.remoteError == nil {
        ProgressView().controlSize(.small)
      }
      Divider().overlay(Dilky.navy100)
      HubToggleRow(
        title: "Učit se z mých oprav",
        detail: "Když vložený text v aplikaci opravíte, ZakazIQ Voice opravu pošle a přepis se zlepší. Pole pro heslo se nečte nikdy.",
        isOn: $hub.learnFromEdits
      )
      Divider().overlay(Dilky.navy100)
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Místní historie").font(DilkyFont.sans(14, weight: 500))
          Text("Kolik dní si tenhle Mac pamatuje diktáty.").font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
        }
        Spacer()
        ForEach([30, 90, 365], id: \.self) { days in
          Button(HubFormat.days(days)) { hub.historyDays = days }
            .buttonStyle(HubChoiceButton(selected: hub.historyDays == days))
        }
      }
      .frame(minHeight: 48)
      if hub.historyAvailable {
        Button("Smazat místní historii") { hub.deleteAllHistory() }.buttonStyle(HubLinkButton(tone: .danger))
      }
    }
  }

  // MARK: Oprávnění

  private var permissionsCard: some View {
    HubCard(title: "Oprávnění", subtitle: "Diktování potřebuje tři povolení. Stačí je dát jednou.") {
      VStack(spacing: 0) {
        ForEach(Array(PermissionKind.allCases.enumerated()), id: \.element) { index, kind in
          if index > 0 { Divider().overlay(Dilky.navy100) }
          HubPermissionRow(kind: kind, state: app.permissions[kind] ?? .notAsked) {
            Task { await app.request(kind) }
          }
        }
      }
    }
  }

  // MARK: Systém

  private var systemCard: some View {
    HubCard(title: "Spuštění") {
      HubToggleRow(
        title: "Spustit po přihlášení",
        detail: hub.launchAtLogin == .needsApproval
          ? "macOS čeká na váš souhlas v Nastavení systému › Obecné › Položky při přihlášení."
          : "ZakazIQ Voice poběží v liště menu hned po zapnutí Macu.",
        isOn: Binding(get: { hub.launchAtLogin != .off }, set: { hub.setLaunchAtLogin($0) })
      )
      if hub.launchAtLogin == .needsApproval {
        Button("Otevřít Položky při přihlášení") { hub.openLoginItems() }.buttonStyle(HubSecondaryButton(compact: true))
      }
      if let error = hub.launchError { HubMessage(text: error, tone: .danger) }
    }
  }

  private var aboutCard: some View {
    HubCard(title: "O aplikaci") {
      HStack(spacing: 12) {
        LogoMark(size: 32)
        VStack(alignment: .leading, spacing: 2) {
          Text("ZakazIQ Voice \(Self.version)").font(DilkyFont.sans(14, weight: 500))
          Text("Zvuk se neukládá, posílá se jen k přepisu.").font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
        }
        Spacer()
        Button("Ukázat úvod") { hub.reopenOnboarding() }.buttonStyle(HubSecondaryButton(compact: true))
      }
      if !hub.unreadable.isEmpty {
        Divider().overlay(Dilky.navy100)
        VStack(alignment: .leading, spacing: 6) {
          Text("Kde se opravy nedají zachytit").font(DilkyFont.sans(13, weight: 500))
          Text("Tyhle aplikace nedovolí přečíst pole po vložení, opravy z nich se neučí. Diktování v nich funguje normálně.")
            .font(DilkyFont.sans(12))
            .foregroundStyle(Dilky.quiet)
            .fixedSize(horizontal: false, vertical: true)
          ForEach(hub.unreadable.prefix(8), id: \.app) { item in
            HStack {
              Text(item.app).font(DilkyFont.sans(13))
              Spacer()
              Text("\(HubFormat.number(item.count))×").font(DilkyFont.mono(12)).foregroundStyle(Dilky.quiet)
            }
          }
        }
      }
    }
  }

  static var version: String {
    let info = Bundle.main.infoDictionary
    let short = info?["CFBundleShortVersionString"] as? String ?? "vývoj"
    let build = info?["CFBundleVersion"] as? String
    return build.map { "\(short) (\($0))" } ?? short
  }
}

struct ConnectionResult: View {
  let state: ConnectionState

  var body: some View {
    switch state {
    case .connected(let device, let warning):
      VStack(alignment: .leading, spacing: 4) {
        HubMessage(text: VoiceMessages.connected(to: device), tone: .ok)
        if let warning { HubMessage(text: warning) }
      }
    case .failed(let text):
      HubMessage(text: text, tone: .danger)
    case .unknown, .checking:
      EmptyView()
    }
  }
}

struct HubPermissionRow: View {
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
          .buttonStyle(HubSecondaryButton(compact: true))
      }
    }
    .frame(minHeight: 52)
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Úvod

/// Úvod při prvním spuštění: oprávnění → klíč zařízení → první diktát.
struct OnboardingView: View {
  @ObservedObject var hub: HubModel
  @ObservedObject var app: AppModel
  @State private var step = 0
  @State private var tryText = ""

  private let titles = ["Povolte diktování", "Připojte Mac k ZakazIQ", "Zkuste to"]

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(spacing: 10) {
        LogoMark(size: 28)
        Text("Krok \(step + 1) ze 3").font(DilkyFont.sans(12, weight: 500)).foregroundStyle(Dilky.quiet)
        Spacer()
        Button("Přeskočit") { hub.finishOnboarding() }.buttonStyle(HubLinkButton(tone: .quiet))
      }
      Text(titles[step]).font(DilkyFont.sans(22, weight: 600)).kerning(-0.5)

      switch step {
      case 0: permissions
      case 1: connection
      default: tryIt
      }

      HStack {
        if step > 0 {
          Button("Zpět") { step -= 1 }.buttonStyle(HubSecondaryButton())
        }
        Spacer()
        if step < 2 {
          Button("Pokračovat") { step += 1 }.buttonStyle(HubPrimaryButton())
        } else {
          Button("Hotovo") { hub.finishOnboarding() }.buttonStyle(HubPrimaryButton())
        }
      }
    }
    .padding(28)
    .frame(width: 520)
    .background(Dilky.ground, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
    .foregroundStyle(Dilky.navy950)
  }

  private var permissions: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Mikrofon kvůli nahrávání, Sledování vstupu kvůli klávese fn a Zpřístupnění kvůli vložení textu tam, kde píšete.")
        .font(DilkyFont.sans(13))
        .foregroundStyle(Dilky.quiet)
        .fixedSize(horizontal: false, vertical: true)
      VStack(spacing: 0) {
        ForEach(Array(PermissionKind.allCases.enumerated()), id: \.element) { index, kind in
          if index > 0 { Divider().overlay(Dilky.navy100) }
          HubPermissionRow(kind: kind, state: app.permissions[kind] ?? .notAsked) {
            Task { await app.request(kind) }
          }
        }
      }
      .padding(.horizontal, 16)
      .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
      if app.shortcut == .fn, let advice = app.fnUsage.advice {
        HubMessage(text: advice)
        Button("Otevřít Nastavení klávesnice") { app.openKeyboardSettings() }.buttonStyle(HubSecondaryButton(compact: true))
      }
    }
  }

  private var connection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("V adminu otevřete ZakazIQ Voice › Zařízení, vytvořte klíč a vložte ho sem. Uloží se jen do Klíčenky.")
        .font(DilkyFont.sans(13))
        .foregroundStyle(Dilky.quiet)
        .fixedSize(horizontal: false, vertical: true)
      if let masked = app.maskedKey {
        HStack(spacing: 8) {
          Text(verbatim: masked).font(DilkyFont.mono(13))
          Text("v Klíčence").font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
        }
      } else {
        HStack(spacing: 8) {
          HubTextField(placeholder: "zk_voice_…", text: $app.keyInput, mono: true, secure: true)
            .onSubmit { app.saveKey() }
          Button("Uložit") { app.saveKey() }.buttonStyle(HubSecondaryButton())
        }
        if let error = app.keyError { HubMessage(text: error, tone: .danger) }
      }
      HStack(spacing: 12) {
        Button("Vyzkoušet připojení") { Task { await app.testConnection() } }
          .buttonStyle(HubSecondaryButton())
          .disabled(!app.hasKey || app.connection == .checking)
        if app.connection == .checking { ProgressView().controlSize(.small) }
      }
      ConnectionResult(state: app.connection)
    }
  }

  private var tryIt: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Klikněte do pole, podržte \(app.shortcut.title), řekněte „Dobrý den, tohle je můj první diktát“ a klávesu pusťte.")
        .font(DilkyFont.sans(13))
        .foregroundStyle(Dilky.quiet)
        .fixedSize(horizontal: false, vertical: true)
      TextEditor(text: $tryText)
        .font(DilkyFont.sans(15))
        .scrollContentBackground(.hidden)
        .padding(10)
        .frame(height: 110)
        .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
      if !tryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        HubMessage(text: "Funguje to. Stejně diktujete do jakékoli aplikace.", tone: .ok)
      }
    }
  }
}
