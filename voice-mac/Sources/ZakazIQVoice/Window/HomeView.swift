import SwiftUI
import ZakazIQVoiceCore

/// Domů: dnešní slova, sloupce za 7 dní, série, rychlost, ušetřený čas a poslední diktáty.
/// Čísla ze serveru (`/stats`), stejná jako admin; diktáty z místní historie.
struct HomeView: View {
  @ObservedObject var hub: HubModel
  @ObservedObject var app: AppModel

  var body: some View {
    HubPage {
      header
      if let stats = hub.numbers.stats {
        metrics(stats)
        HStack(alignment: .top, spacing: 16) {
          weekChart(stats)
          streakCard(stats)
        }
      } else if case .loading = hub.numbers {
        HubCard { ProgressView().controlSize(.small).frame(maxWidth: .infinity, minHeight: 80) }
      }
      recentCard
    }
  }

  // MARK: Hlavička

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(HubFormat.greeting(at: Date()))
        .font(DilkyFont.sans(13, weight: 500))
        .foregroundStyle(Dilky.quiet)
      Text(HubFormat.todaySentence(hub.numbers.stats?.today ?? 0))
        .font(DilkyFont.sans(28, weight: 600))
        .kerning(-0.7)
        .fixedSize(horizontal: false, vertical: true)
      freshness
    }
  }

  @ViewBuilder
  private var freshness: some View {
    switch hub.numbers {
    case .cached(_, let fetchedAt, let reason):
      HubMessage(text: reason.isEmpty ? HubFormat.updated(fetchedAt) : "\(HubFormat.updated(fetchedAt)). \(reason)")
    case .unavailable(let reason):
      VStack(alignment: .leading, spacing: 8) {
        HubMessage(text: reason, tone: .danger)
        if !hub.hasKey {
          Button("Otevřít Nastavení") { hub.tab = .settings }.buttonStyle(HubSecondaryButton(compact: true))
        }
      }
    case .fresh, .loading:
      EmptyView()
    }
  }

  // MARK: Čísla

  private func metrics(_ s: StatsResponse) -> some View {
    HStack(spacing: 12) {
      MetricTile(value: HubFormat.number(s.week), unit: HubFormat.plural(s.week, one: "slovo", few: "slova", many: "slov"), label: "za 7 dní")
      MetricTile(value: HubFormat.number(s.streak), unit: HubFormat.plural(s.streak, one: "den", few: "dny", many: "dní"), label: "série")
      MetricTile(value: HubFormat.speed(s.wpm), unit: s.wpm == nil ? "" : "slov/min", label: "rychlost")
      MetricTile(value: HubFormat.duration(minutes: s.timeSaved), unit: "", label: "ušetřený čas")
    }
  }

  private func weekChart(_ s: StatsResponse) -> some View {
    let bars = HubStats.lastSevenDays(s.daily, today: HubFormat.isoDay(Date()))
    let top = max(bars.map(\.words).max() ?? 0, 1)
    return HubCard(title: "Slova za týden") {
      HStack(alignment: .bottom, spacing: 10) {
        ForEach(bars) { bar in
          VStack(spacing: 6) {
            Text(bar.words > 0 ? HubFormat.number(bar.words) : " ")
              .font(DilkyFont.mono(10))
              .foregroundStyle(Dilky.quiet)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            RoundedRectangle(cornerRadius: 6, style: .continuous)
              .fill(bar.isToday ? Dilky.navy700 : Dilky.navy300)
              .frame(height: max(4, CGFloat(bar.words) / CGFloat(top) * 110))
              .opacity(bar.words == 0 ? 0.35 : 1)
            Text(bar.label)
              .font(DilkyFont.sans(11, weight: bar.isToday ? 600 : 400))
              .foregroundStyle(bar.isToday ? Dilky.navy950 : Dilky.quiet)
          }
          .frame(maxWidth: .infinity)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel("\(bar.label): \(HubFormat.words(bar.words))")
        }
      }
      .frame(height: 150, alignment: .bottom)
    }
  }

  private func streakCard(_ s: StatsResponse) -> some View {
    let dots = HubStats.weekDots(s.daily, today: HubFormat.isoDay(Date()))
    return HubCard(title: "Série") {
      VStack(alignment: .leading, spacing: 14) {
        Text(HubStats.streakSentence(s.streak))
          .font(DilkyFont.sans(18, weight: 600))
          .kerning(-0.3)
        HStack(spacing: 8) {
          ForEach(dots) { dot in
            VStack(spacing: 6) {
              ZStack {
                Circle()
                  .fill(dot.active ? Dilky.navy700 : Dilky.surface)
                  .overlay(Circle().strokeBorder(dot.active ? Dilky.navy700 : Dilky.navy100, lineWidth: dot.isToday ? 2 : 1))
                  .frame(width: 22, height: 22)
                if dot.active {
                  Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.white)
                }
              }
              .opacity(dot.isFuture ? 0.45 : 1)
              Text(dot.label)
                .font(DilkyFont.sans(10, weight: dot.isToday ? 600 : 400))
                .foregroundStyle(dot.isToday ? Dilky.navy950 : Dilky.quiet)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(dot.label): \(dot.active ? "diktovali jste" : "bez diktátu")")
          }
        }
        if s.longestStreak > 0 {
          Text("Nejdelší série: \(HubFormat.days(s.longestStreak))")
            .font(DilkyFont.sans(12))
            .foregroundStyle(Dilky.quiet)
        }
      }
    }
    .frame(width: 280)
  }

  // MARK: Poslední diktáty

  private var recentCard: some View {
    HubCard(title: "Poslední diktáty") {
      if !hub.historyAvailable || hub.recent.isEmpty {
        HubEmptyState(text: HubMessages.emptyHistory)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(hub.recent.enumerated()), id: \.element.id) { index, row in
            if index > 0 { Divider().overlay(Dilky.navy100) }
            HistoryRowView(row: row, compact: true, onCopy: { hub.copy(row) }, onRetry: nil, onDelete: nil)
          }
        }
        if hub.history.count > hub.recent.count {
          Button("Celá historie") { hub.tab = .history }.buttonStyle(HubLinkButton())
        }
      }
    }
  }
}

private struct MetricTile: View {
  let value: String
  let unit: String
  let label: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(value)
          .font(DilkyFont.mono(22, weight: 600))
          .lineLimit(1)
          .minimumScaleFactor(0.6)
        if !unit.isEmpty {
          Text(unit).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet).lineLimit(1)
        }
      }
      Text(label).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
    .accessibilityElement(children: .combine)
  }
}

/// Řádek diktátu: aplikace, čas, stav, text a akce. Sdílí Domů a Historie.
struct HistoryRowView: View {
  let row: HistoryRow
  var compact = false
  let onCopy: () -> Void
  let onRetry: (() -> Void)?
  let onDelete: (() -> Void)?
  @State private var hover = false

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      VStack(alignment: .leading, spacing: 2) {
        Text(HubFormat.when(row.startedAt))
          .font(DilkyFont.mono(12))
          .foregroundStyle(Dilky.quiet)
        Text(row.appName ?? "Neznámá aplikace")
          .font(DilkyFont.sans(12))
          .foregroundStyle(Dilky.quiet)
          .lineLimit(1)
      }
      .frame(width: 120, alignment: .leading)

      VStack(alignment: .leading, spacing: 6) {
        if let text = row.text, !text.isEmpty {
          Text(text)
            .font(DilkyFont.sans(14))
            .lineLimit(compact ? 2 : 6)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        } else {
          Text(row.status.title)
            .font(DilkyFont.sans(14))
            .foregroundStyle(Dilky.quiet)
        }
        HStack(spacing: 6) {
          if row.status != .ok {
            HubBadge(text: row.status.title, tone: row.status.isProblem ? .danger : (row.status == .queued ? .info : .neutral))
          }
          if row.corrected { HubBadge(text: "Opraveno po vložení") }
          if row.words > 0 && !compact {
            Text(HubFormat.words(row.words)).font(DilkyFont.sans(11)).foregroundStyle(Dilky.quiet)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      HStack(spacing: 4) {
        if row.status.hasText, row.text?.isEmpty == false {
          IconButton(symbol: "doc.on.doc", help: "Zkopírovat", action: onCopy)
        }
        if let onRetry, row.status.canRetry {
          IconButton(symbol: "arrow.clockwise", help: "Zkusit znovu", action: onRetry)
        }
        if let onDelete {
          IconButton(symbol: "trash", help: "Smazat z místní historie", action: onDelete)
        }
      }
      .opacity(hover || compact ? 1 : 0.55)
    }
    .padding(.vertical, 12)
    .contentShape(Rectangle())
    .onHover { hover = $0 }
  }
}

/// Malé tlačítko s ikonou; plocha 32 px uvnitř řádku, popisek pro čtečku i tooltip.
struct IconButton: View {
  let symbol: String
  let help: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 13))
        .foregroundStyle(Dilky.navy700)
        .frame(width: 32, height: 32)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .help(help)
    .accessibilityLabel(help)
  }
}
