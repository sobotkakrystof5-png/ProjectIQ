import SwiftUI

// Prvky okna ZakazIQ Voice v Dílkách (plán, oddíl 9). Karty bílé na `ground`, pilulková
// tlačítka, Instrument Sans, čísla JetBrains Mono. Barvy jen z `Dilky`.

struct HubCard<Content: View>: View {
  var title: String?
  var subtitle: String?
  var padding: CGFloat = 20
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if title != nil || subtitle != nil {
        VStack(alignment: .leading, spacing: 3) {
          if let title {
            Text(title).font(DilkyFont.sans(15, weight: 600)).kerning(-0.2)
          }
          if let subtitle {
            Text(subtitle).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet).fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      content
    }
    .padding(padding)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
  }
}

/// Nadpis obrazovky: velký název a jedna věta pod ním.
struct HubPageHeader: View {
  let title: String
  var subtitle: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(DilkyFont.sans(26, weight: 600)).kerning(-0.6)
      if let subtitle {
        Text(subtitle).font(DilkyFont.sans(13)).foregroundStyle(Dilky.quiet).fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct HubPrimaryButton: ButtonStyle {
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

struct HubSecondaryButton: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  var compact = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 500))
      .foregroundStyle(Dilky.navy950)
      .padding(.horizontal, compact ? 12 : 16)
      .frame(height: compact ? 32 : 40)
      .background(configuration.isPressed ? Dilky.navy50 : Dilky.surface, in: Capsule())
      .overlay(Capsule().strokeBorder(Dilky.navy100, lineWidth: 1))
      .opacity(enabled ? 1 : 0.4)
      .contentShape(Capsule())
  }
}

struct HubLinkButton: ButtonStyle {
  enum Tone { case normal, danger, quiet }
  var tone: Tone = .normal

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 500))
      .foregroundStyle(color)
      .underline(configuration.isPressed)
      .contentShape(Rectangle())
  }

  private var color: Color {
    switch tone {
    case .normal: return Dilky.navy700
    case .danger: return Dilky.danger
    case .quiet: return Dilky.quiet
    }
  }
}

/// Výběr z několika možností: vybraná pilulka plná `navy-700`, ostatní obrys.
struct HubChoiceButton: ButtonStyle {
  let selected: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: selected ? 600 : 500))
      .foregroundStyle(selected ? Color.white : Dilky.navy950)
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(selected ? Dilky.navy700 : (configuration.isPressed ? Dilky.navy50 : Dilky.surface), in: Capsule())
      .overlay(Capsule().strokeBorder(selected ? Dilky.navy700 : Dilky.navy100, lineWidth: 1))
      .contentShape(Capsule())
  }
}

struct HubTextField: View {
  let placeholder: String
  @Binding var text: String
  var mono = false
  var secure = false
  var focus: FocusState<Bool>.Binding?
  @FocusState private var ownFocus: Bool

  var body: some View {
    field
      .textFieldStyle(.plain)
      .font(mono ? DilkyFont.mono(13) : DilkyFont.sans(14))
      .autocorrectionDisabled()
      .padding(.horizontal, 12)
      .frame(height: 40)
      .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(isFocused ? Dilky.navy700 : Dilky.navy100, lineWidth: isFocused ? 2 : 1)
      )
  }

  private var isFocused: Bool { focus?.wrappedValue ?? ownFocus }

  @ViewBuilder
  private var field: some View {
    let prompt = Text(placeholder).foregroundStyle(Dilky.quiet.opacity(0.7))
    if let focus {
      if secure {
        SecureField("", text: $text, prompt: prompt).focused(focus)
      } else {
        TextField("", text: $text, prompt: prompt).focused(focus)
      }
    } else {
      if secure {
        SecureField("", text: $text, prompt: prompt).focused($ownFocus)
      } else {
        TextField("", text: $text, prompt: prompt).focused($ownFocus)
      }
    }
  }
}

/// Řádek s přepínačem: název, věta pod ním, vpravo přepínač v `navy-700`.
struct HubToggleRow: View {
  let title: String
  var detail: String?
  @Binding var isOn: Bool
  var disabled = false

  var body: some View {
    Toggle(isOn: $isOn) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(DilkyFont.sans(14, weight: 500))
        if let detail {
          Text(detail).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet).fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .toggleStyle(.switch)
    .tint(Dilky.navy700)
    .disabled(disabled)
    .frame(minHeight: 48)
  }
}

/// Krátká zpráva s tečkou: navy = v pořádku, danger = chyba, quiet = poznámka.
struct HubMessage: View {
  enum Tone { case ok, danger, quiet }
  let text: String
  var tone: Tone = .quiet

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

/// Prázdný stav: malé dílky, věta a volitelně akce (Dílky: užitečný prázdný stav).
struct HubEmptyState: View {
  let text: String
  var actionTitle: String?
  var action: (() -> Void)?

  var body: some View {
    VStack(spacing: 12) {
      TilesGlyph(size: 28, color: Dilky.navy200)
      Text(text)
        .font(DilkyFont.sans(13))
        .foregroundStyle(Dilky.quiet)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      if let actionTitle, let action {
        Button(actionTitle, action: action).buttonStyle(HubSecondaryButton())
      }
    }
    .frame(maxWidth: 360)
    .frame(maxWidth: .infinity)
    .padding(.vertical, 28)
  }
}

/// Mřížka 2×2 dílků jedné barvy (ikony v okně bez SF Symbols tam, kde nesou značku).
struct TilesGlyph: View {
  var size: CGFloat = 16
  var color: Color = Dilky.navy700
  var brightness: [Double] = [1, 1, 1, 1]

  var body: some View {
    let tile = size * 18 / 44
    let gap = size * 8 / 44
    VStack(spacing: gap) {
      HStack(spacing: gap) { cell(0, tile); cell(1, tile) }
      HStack(spacing: gap) { cell(3, tile); cell(2, tile) }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  private func cell(_ i: Int, _ tile: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: tile * 0.28, style: .continuous)
      .fill(color.opacity(brightness.indices.contains(i) ? brightness[i] : 1))
      .frame(width: tile, height: tile)
  }
}

/// Malý štítek stavu (Historie): obrys, tón podle naléhavosti.
struct HubBadge: View {
  enum Tone { case neutral, info, danger }
  let text: String
  var tone: Tone = .neutral

  var body: some View {
    Text(text)
      .font(DilkyFont.sans(11, weight: 500))
      .foregroundStyle(foreground)
      .padding(.horizontal, 8)
      .frame(height: 20)
      .background(background, in: Capsule())
  }

  private var foreground: Color {
    switch tone {
    case .neutral: return Dilky.quiet
    case .info: return Dilky.navy700
    case .danger: return Dilky.danger
    }
  }

  private var background: Color {
    switch tone {
    case .neutral: return Dilky.navy50
    case .info: return Dilky.navy100
    case .danger: return Dilky.danger.opacity(0.09)
    }
  }
}
