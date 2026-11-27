import SwiftUI
import ZakazIQVoiceCore

/// Okno ZakazIQ Voice jako Wispr Flow: vlevo pruh se záložkami, vpravo obsah (VO11).
struct HubRootView: View {
  @ObservedObject var hub: HubModel
  @ObservedObject var app: AppModel

  var body: some View {
    HStack(spacing: 0) {
      sidebar
      Rectangle().fill(Dilky.navy100).frame(width: 1)
      content
    }
    .background(Dilky.ground)
    .foregroundStyle(Dilky.navy950)
    .overlay(alignment: .bottom) { toast }
    .overlay { onboarding }
    .task(id: hub.tab) { await hub.refresh() }
  }

  // MARK: Levý pruh

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 10) {
        LogoMark(size: 28)
        Text("ZakazIQ Voice")
          .font(DilkyFont.sans(15, weight: 600))
          .kerning(-0.3)
      }
      .padding(.horizontal, 10)
      .padding(.top, 44)
      .padding(.bottom, 20)

      ForEach(HubTab.allCases) { tab in
        SidebarItem(tab: tab, selected: hub.tab == tab) { hub.tab = tab }
          .keyboardShortcut(tab.shortcut, modifiers: .command)
      }

      Spacer()
      connectionFooter
    }
    .padding(.horizontal, 12)
    .padding(.bottom, 16)
    .frame(width: 220)
    .background(Dilky.navy50.opacity(0.6))
  }

  private var connectionFooter: some View {
    Button { hub.tab = .settings } label: {
      HStack(spacing: 8) {
        Circle().fill(connectionColor).frame(width: 7, height: 7)
        Text(app.connection.menuLine)
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 10)
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .help("Otevřít Nastavení připojení")
  }

  private var connectionColor: Color {
    switch app.connection {
    case .connected: return Dilky.navy700
    case .failed: return Dilky.danger
    case .unknown, .checking: return Dilky.navy200
    }
  }

  // MARK: Obsah

  @ViewBuilder
  private var content: some View {
    switch hub.tab {
    case .home: HomeView(hub: hub, app: app)
    case .history: HistoryView(hub: hub)
    case .meetings: MeetingsView(model: hub.meetings)
    case .dictionary: DictionaryView(hub: hub)
    case .style: StyleView(hub: hub)
    case .settings: HubSettingsView(hub: hub, app: app)
    }
  }

  // MARK: Toast a úvod

  @ViewBuilder
  private var toast: some View {
    if let text = hub.toast {
      Text(text)
        .font(DilkyFont.sans(13, weight: 500))
        .foregroundStyle(Color.white)
        .padding(.horizontal, 18)
        .frame(minHeight: 40)
        .background(Dilky.navy950.opacity(0.92), in: Capsule())
        .padding(.bottom, 20)
        .transition(.opacity)
        .accessibilityAddTraits(.isStaticText)
    }
  }

  @ViewBuilder
  private var onboarding: some View {
    if hub.showOnboarding {
      ZStack {
        Dilky.navy950.opacity(0.28).ignoresSafeArea()
        OnboardingView(hub: hub, app: app)
      }
    }
  }
}

private struct SidebarItem: View {
  let tab: HubTab
  let selected: Bool
  let action: () -> Void
  @State private var hover = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: tab.symbol)
          .font(.system(size: 14, weight: selected ? .semibold : .regular))
          .frame(width: 20)
        Text(tab.title)
          .font(DilkyFont.sans(14, weight: selected ? 600 : 500))
        Spacer(minLength: 0)
      }
      .foregroundStyle(selected ? Dilky.navy700 : Dilky.navy950)
      .padding(.horizontal, 10)
      .frame(height: 40)
      .background(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(selected ? Dilky.surface : (hover ? Dilky.surface.opacity(0.6) : Color.clear))
      )
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(selected ? Dilky.navy100 : Color.clear, lineWidth: 1)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hover = $0 }
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// Obal obsahu záložky: rolování, šířka a okraje stejné všude.
struct HubPage<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        content
      }
      .frame(maxWidth: 760, alignment: .leading)
      .padding(.horizontal, 36)
      .padding(.top, 44)
      .padding(.bottom, 32)
      .frame(maxWidth: .infinity)
    }
    .scrollIndicators(.automatic)
  }
}
