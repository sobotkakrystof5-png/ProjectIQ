import SwiftUI
import ZakazIQVoiceCore

/// Pilulka dole uprostřed obrazovky (VO05, plán oddíl 9, náhled `lista-nahled.html`).
/// Panel je pevný a průhledný, pilulka uvnitř mění velikost; obsah se nepřeskládává.
struct FlowBarView: View {
  @ObservedObject var model: BarModel

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      if model.isVisible {
        pill
          .transition(.opacity)
      }
    }
    .frame(width: BarLayout.panelSize.width, height: BarLayout.panelSize.height)
    .animation(model.reduceMotion ? .easeInOut(duration: 0.15) : .spring(response: 0.25, dampingFraction: 0.86), value: model.stage)
    .animation(model.reduceMotion ? .easeInOut(duration: 0.15) : .spring(response: 0.25, dampingFraction: 0.86), value: model.hovering)
  }

  private var size: CGSize { model.pillSize }
  private var tile: CGFloat { BarLayout.tileSize(for: model.stage, hovering: model.hovering) }

  private var pill: some View {
    content
      .frame(width: size.width, height: size.height)
      .background(Dilky.navy950.opacity(0.86), in: Capsule())
      .overlay(Capsule().strokeBorder(borderColor, lineWidth: 1))
      .clipShape(Capsule())
      .shadow(color: Dilky.navy950.opacity(0.28), radius: 9, y: 6)
      .contentShape(Capsule())
      .onTapGesture { model.click() }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(accessibilityText)
      .accessibilityAddTraits(.isButton)
  }

  private var borderColor: Color {
    if case .message(let message) = model.stage, message.tone == .error { return Dilky.danger }
    return Color.white.opacity(0.10)
  }

  @ViewBuilder
  private var content: some View {
    switch model.stage {
    case .hidden:
      EmptyView()
    case .idle, .done:
      if model.hovering {
        HStack(spacing: 10) {
          DilkyMark(tile: tile, mode: .solid, reduceMotion: model.reduceMotion)
          Text(VoiceMessages.barHint(model.shortcut))
            .font(DilkyFont.sans(12))
            .foregroundStyle(Dilky.navy200)
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
      } else {
        DilkyMark(tile: tile, mode: model.stage == .done ? .blink : .solid, reduceMotion: model.reduceMotion)
          .opacity(model.stage == .done ? 0.55 : 1)
      }
    case .listening(.hold):
      HStack(spacing: 10) {
        listeningCore
      }
      .padding(.horizontal, 14)
    case .listening(.handsFree):
      HStack(spacing: 0) {
        BarButton(label: "Zrušit") {
          Text(verbatim: "×").font(.system(size: 14, weight: .semibold))
        } action: { model.cancel() }
        HStack(spacing: 10) { listeningCore }
          .padding(.horizontal, 6)
        BarButton(label: "Hotovo") {
          RoundedRectangle(cornerRadius: 2, style: .continuous).fill(Color.white).frame(width: 9, height: 9)
        } action: { model.click() }
      }
      .padding(.horizontal, 4)
    case .processing:
      DilkyMark(tile: tile, mode: .spin, reduceMotion: model.reduceMotion)
        .opacity(model.reduceMotion ? 0.7 : 1)
    case .message(let message):
      HStack(spacing: 10) {
        DilkyMark(tile: tile, mode: .solid, reduceMotion: model.reduceMotion)
        Text(message.text)
          .font(DilkyFont.sans(12, weight: message.tone == .error ? 500 : 400))
          .foregroundStyle(message.tone == .error ? Color.white : Dilky.navy200)
          .lineLimit(1)
          .minimumScaleFactor(0.85)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 14)
    }
  }

  @ViewBuilder
  private var listeningCore: some View {
    DilkyMark(tile: tile, mode: .level(model.level), reduceMotion: model.reduceMotion)
    Waveform(levels: model.levels, reduceMotion: model.reduceMotion)
      .frame(maxWidth: .infinity)
    Text(verbatim: BarLayout.elapsedText(model.elapsed))
      .font(DilkyFont.mono(11, weight: 500))
      .foregroundStyle(Dilky.navy200)
      .monospacedDigit()
  }

  private var accessibilityText: String {
    switch model.stage {
    case .hidden, .idle, .done: return "ZakazIQ Voice. " + VoiceMessages.barHint(model.shortcut)
    case .listening: return "ZakazIQ Voice nahrává, \(BarLayout.elapsedText(model.elapsed))"
    case .processing: return "ZakazIQ Voice zpracovává diktát"
    case .message(let message): return message.text
    }
  }
}

/// Kulaté tlačítko 28 px uvnitř lišty (Zrušit, Hotovo).
private struct BarButton<Label: View>: View {
  let label: String
  @ViewBuilder let icon: Label
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      icon
        .foregroundStyle(Color.white)
        .frame(width: 28, height: 28)
        .background(Color.white.opacity(0.10), in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}
