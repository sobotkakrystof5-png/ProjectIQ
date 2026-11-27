import SwiftUI
import ZakazIQVoiceCore

/// Karta s přepisem: hlavička, text (delší se posouvá), počet slov a jediná hlavní akce
/// „Zkopírovat". Tmavá jako lišta, ať k sobě patří.
struct TranscriptView: View {
  @ObservedObject var model: TranscriptModel

  var body: some View {
    Group {
      if let item = model.item {
        card(item)
      } else {
        Color.clear
      }
    }
    .padding(TranscriptLayout.shadowInset)
  }

  private func card(_ item: TranscriptModel.Item) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      header(item)
        .frame(height: 28)
      Spacer().frame(height: 10)
      textBlock(item.text)
        .frame(height: model.textHeight, alignment: .topLeading)
      Spacer().frame(height: 12)
      footer(item)
        .frame(height: 40)
    }
    .padding(.horizontal, TranscriptLayout.padding)
    .padding(.top, 16)
    .padding(.bottom, 14)
    .frame(width: TranscriptLayout.cardWidth, alignment: .topLeading)
    .background(Dilky.navy950.opacity(0.94), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
    .shadow(color: Dilky.navy950.opacity(0.30), radius: 10, y: 6)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Přepis diktátu")
  }

  private func header(_ item: TranscriptModel.Item) -> some View {
    HStack(spacing: 8) {
      DilkyMark(tile: 6, mode: .solid, reduceMotion: true)
      Text("Přepis")
        .font(DilkyFont.sans(12, weight: 500))
        .foregroundStyle(Dilky.navy200)
      if let app = item.appName, !app.isEmpty {
        Text(verbatim: "· \(app)")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.navy300)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Button(action: model.hide) {
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

  @ViewBuilder
  private func textBlock(_ text: String) -> some View {
    let body = Text(verbatim: text)
      .font(DilkyFont.sans(TranscriptModel.fontSize))
      .lineSpacing(TranscriptModel.lineSpacing)
      .foregroundStyle(Color.white)
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .fixedSize(horizontal: false, vertical: true)
    if model.scrollable {
      ScrollView(.vertical, showsIndicators: true) {
        body.padding(.trailing, 8)
      }
    } else {
      body
    }
  }

  private func footer(_ item: TranscriptModel.Item) -> some View {
    HStack(spacing: 12) {
      Text(verbatim: HubFormat.words(item.words))
        .font(DilkyFont.mono(11, weight: 500))
        .foregroundStyle(Dilky.navy300)
      Spacer(minLength: 0)
      Button(action: model.copy) {
        HStack(spacing: 6) {
          if model.copied {
            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold))
          }
          Text(model.copied ? "Zkopírováno" : "Zkopírovat")
        }
      }
      .buttonStyle(TranscriptCopyButton())
      .accessibilityLabel(model.copied ? "Zkopírováno" : "Zkopírovat přepis")
    }
  }
}

/// Hlavní akce karty: světlé tlačítko na tmavé ploše, 40 px vysoké.
private struct TranscriptCopyButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(DilkyFont.sans(13, weight: 600))
      .foregroundStyle(Dilky.navy950)
      .padding(.horizontal, 18)
      .frame(minWidth: 132, minHeight: 40)
      .background(configuration.isPressed ? Dilky.navy100 : Color.white, in: Capsule())
      .contentShape(Capsule())
  }
}
