import SwiftUI
import ZakazIQVoiceCore

/// Záložka Schůzky (R-151): začít a ukončit schůzku, přepis rozhovoru, shrnutí od AI.
/// Jedna hlavní akce: bez schůzky „Začít schůzku", po ní „Zkopírovat přepis".
struct MeetingsView: View {
  @ObservedObject var model: MeetingsModel

  var body: some View {
    HubPage {
      HubPageHeader(
        title: "Schůzky",
        subtitle: "Online schůzka s klientem až na 2 hodiny. Nahraje se váš mikrofon i zvuk hovoru a na konci uvidíte přepis."
      )
      recorderCard
      if let error = model.error { HubMessage(text: error, tone: .danger) }
      if let detail = model.selected { detailCard(detail) }
      if !model.list.isEmpty { listCard }
    }
    .task { await model.refresh() }
  }

  // MARK: Nahrávání

  private var recorderCard: some View {
    HubCard {
      if model.recording {
        HStack(spacing: 12) {
          TilesGlyph(size: 18, color: Dilky.navy700)
          VStack(alignment: .leading, spacing: 2) {
            Text("Schůzka běží").font(DilkyFont.sans(15, weight: 600))
            Text(verbatim: BarLayout.elapsedText(model.elapsed)).font(DilkyFont.mono(13, weight: 500)).foregroundStyle(Dilky.quiet)
          }
          Spacer()
          Button("Ukončit schůzku") { model.stopMeeting?() }.buttonStyle(HubPrimaryButton())
        }
      } else if model.finishing {
        HStack(spacing: 12) {
          ProgressView().controlSize(.small)
          Text("Dokončuji přepis…").font(DilkyFont.sans(14, weight: 500))
        }
      } else {
        VStack(alignment: .leading, spacing: 10) {
          Button("Začít schůzku") { model.startMeeting?() }.buttonStyle(HubPrimaryButton())
          Text("Ukončíte ji tlačítkem na liště dole nebo tady. Doporučujeme sluchátka, bez nich mikrofon slyší klienta i z reproduktorů. Klientovi řekněte, že si schůzku nahráváte.")
            .font(DilkyFont.sans(12))
            .foregroundStyle(Dilky.quiet)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  // MARK: Detail

  private func detailCard(_ m: MeetingDetailDTO) -> some View {
    HubCard {
      VStack(alignment: .leading, spacing: 4) {
        Text(m.title ?? "Schůzka").font(DilkyFont.sans(17, weight: 600)).kerning(-0.2)
        Text(verbatim: Self.meta(m)).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
      }
      HStack(spacing: 8) {
        Button("Zkopírovat přepis") { model.copy(m.transcript) }
          .buttonStyle(HubPrimaryButton())
          .disabled(m.blocks.isEmpty)
        Button(model.summarizing ? "Shrnuji…" : (m.summary == nil ? "Shrnout pomocí AI" : "Shrnout znovu")) {
          Task { await model.summarize() }
        }
        .buttonStyle(HubSecondaryButton())
        .disabled(model.summarizing || m.blocks.isEmpty)
        Spacer()
        Button("Otevřít v adminu") { model.openInAdmin() }.buttonStyle(HubLinkButton())
      }
      if m.failedTurns > 0 {
        HubMessage(text: "\(m.failedTurns) promluv se nepodařilo přepsat.")
      }
      if let s = m.summary { summary(s, text: m.summaryText) }
      Divider().overlay(Dilky.navy100)
      if m.blocks.isEmpty {
        Text("Přepis zatím nemá žádnou promluvu.").font(DilkyFont.sans(13)).foregroundStyle(Dilky.quiet)
      } else {
        LazyVStack(alignment: .leading, spacing: 14) {
          ForEach(m.blocks) { block in
            HStack(alignment: .firstTextBaseline, spacing: 12) {
              Text(verbatim: MeetingDates.offset(block.startMs))
                .font(DilkyFont.mono(11, weight: 500))
                .foregroundStyle(Dilky.quiet)
                .frame(width: 52, alignment: .leading)
              VStack(alignment: .leading, spacing: 2) {
                Text(block.label)
                  .font(DilkyFont.sans(12, weight: 600))
                  .foregroundStyle(block.speaker == .me ? Dilky.navy700 : Dilky.navy950)
                Text(block.text)
                  .font(DilkyFont.sans(14))
                  .foregroundStyle(Dilky.navy950)
                  .fixedSize(horizontal: false, vertical: true)
                  .textSelection(.enabled)
              }
            }
          }
        }
      }
    }
  }

  private func summary(_ s: MeetingSummaryDTO, text: String?) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Shrnutí").font(DilkyFont.sans(14, weight: 600))
        Spacer()
        if let text { Button("Zkopírovat shrnutí") { model.copy(text) }.buttonStyle(HubLinkButton()) }
      }
      Text(s.summary).font(DilkyFont.sans(14)).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
      section("Na čem jsme se domluvili", s.agreements)
      section("Co udělám já", s.mySteps)
      section("Co udělá klient", s.clientSteps)
      section("Otevřené otázky", s.openQuestions)
      section("Jen pro mě", s.internalNotes)
    }
    .padding(14)
    .background(Dilky.navy50, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  @ViewBuilder
  private func section(_ title: String, _ items: [String]) -> some View {
    if !items.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(DilkyFont.sans(12, weight: 600)).foregroundStyle(Dilky.quiet)
        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
          Text(verbatim: "· \(item)").font(DilkyFont.sans(13)).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
        }
      }
    }
  }

  // MARK: Seznam

  private var listCard: some View {
    HubCard(title: "Schůzky") {
      VStack(spacing: 0) {
        ForEach(model.list) { item in
          Button {
            Task { await model.select(item.id) }
          } label: {
            HStack(spacing: 10) {
              VStack(alignment: .leading, spacing: 2) {
                Text(item.title ?? "Schůzka").font(DilkyFont.sans(14, weight: 500)).foregroundStyle(Dilky.navy950).lineLimit(1)
                Text(verbatim: Self.listMeta(item)).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
              }
              Spacer()
              if item.hasSummary { HubBadge(text: "shrnuto", tone: .info) }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 48)
            .background(item.id == model.selectedId ? Dilky.navy50 : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  // MARK: Formát

  private static let dateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "cs_CZ")
    f.dateFormat = "d. M. yyyy H:mm"
    return f
  }()

  static func date(_ raw: String) -> String {
    MeetingDates.parse(raw).map { dateFormatter.string(from: $0) } ?? ""
  }

  static func meta(_ m: MeetingDetailDTO) -> String {
    var parts = [date(m.startedAt), MeetingDates.duration(m.durationMs), HubFormat.words(m.words)]
    if let app = m.appName { parts.append(app) }
    if let contact = m.contactName { parts.append(contact) }
    return parts.joined(separator: " · ")
  }

  static func listMeta(_ item: MeetingListItemDTO) -> String {
    var parts = [date(item.startedAt), MeetingDates.duration(item.durationMs)]
    if let contact = item.contactName { parts.append(contact) }
    return parts.joined(separator: " · ")
  }
}
