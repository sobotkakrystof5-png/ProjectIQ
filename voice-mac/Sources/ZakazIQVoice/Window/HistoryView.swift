import SwiftUI
import ZakazIQVoiceCore

/// Historie: místní seznam diktátů s hledáním a filtrem, Zkopírovat, Zkusit znovu, Smazat.
struct HistoryView: View {
  @ObservedObject var hub: HubModel
  @FocusState private var searchFocused: Bool

  var body: some View {
    HubPage {
      HubPageHeader(
        title: "Historie",
        subtitle: "Diktáty z tohoto Macu za posledních \(HubFormat.days(hub.historyDays)). Celou historii a mazání na serveru najdete v adminu."
      )

      HStack(spacing: 10) {
        HubTextField(placeholder: "Hledat v textu nebo aplikaci", text: $hub.search, focus: $searchFocused)
          .frame(maxWidth: 320)
        ForEach(HistoryFilter.allCases) { f in
          Button(f.title) { hub.filter = f }
            .buttonStyle(HubChoiceButton(selected: hub.filter == f))
            .accessibilityAddTraits(hub.filter == f ? .isSelected : [])
        }
      }
      // ⌘F skočí do hledání.
      .background {
        Button("") { searchFocused = true }.keyboardShortcut("f", modifiers: .command).hidden()
      }

      if let pending = hub.pendingDelete {
        HStack(spacing: 8) {
          Text("Diktát z \(HubFormat.when(pending.startedAt)) je smazaný.").font(DilkyFont.sans(13))
          Button("Zpět") { hub.undoDelete() }.buttonStyle(HubLinkButton())
        }
      }

      HubCard(padding: 16) {
        let rows = hub.visibleHistory
        if !hub.historyAvailable || hub.history.isEmpty {
          HubEmptyState(text: HubMessages.emptyHistory)
        } else if rows.isEmpty {
          HubEmptyState(text: HubMessages.emptySearch, actionTitle: "Zrušit hledání") {
            hub.search = ""
            hub.filter = .all
          }
        } else {
          LazyVStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
              if index > 0 { Divider().overlay(Dilky.navy100) }
              HistoryRowView(
                row: row,
                onCopy: { hub.copy(row) },
                onRetry: { hub.retry(row) },
                onDelete: { hub.delete(row) }
              )
            }
          }
        }
      }
    }
  }
}

/// Slovník: slova (správný tvar + jak to přepis slyší) a zkratky. Přes `/terms` na serveru.
struct DictionaryView: View {
  @ObservedObject var hub: HubModel
  @State private var editor: Editor?

  enum Editor: Identifiable, Equatable {
    case word(DictionaryWord?)
    case snippet(DictionarySnippet?)

    var id: String {
      switch self {
      case .word(let w): return "w-\(w?.id ?? "new")"
      case .snippet(let s): return "s-\(s?.id ?? "new")"
      }
    }
  }

  var body: some View {
    HubPage {
      HubPageHeader(
        title: "Slovník",
        subtitle: "Jména a pojmy, které má přepis psát správně, a zkratky, které se rozvinou v celý text. Platí i v adminu."
      )

      if let error = hub.dictionaryError {
        HubMessage(text: error, tone: .danger)
      }

      if let dict = hub.dictionary {
        wordsCard(dict.terms)
        snippetsCard(dict.snippets)
      } else if hub.dictionaryLoading {
        HubCard { ProgressView().controlSize(.small).frame(maxWidth: .infinity, minHeight: 80) }
      }
    }
    .sheet(item: $editor) { editor in
      DictionaryEditor(editor: editor, hub: hub) { self.editor = nil }
    }
  }

  private func wordsCard(_ terms: [DictionaryWord]) -> some View {
    HubCard(title: "Slova") {
      Button("Přidat slovo") { editor = .word(nil) }.buttonStyle(HubSecondaryButton(compact: true))
      if terms.isEmpty {
        HubEmptyState(text: HubMessages.emptyWords)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(terms.enumerated()), id: \.element.id) { index, term in
            if index > 0 { Divider().overlay(Dilky.navy100) }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
              VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                  Text(term.term).font(DilkyFont.sans(14, weight: 600))
                  if term.isLearned { HubBadge(text: "Naučené samo", tone: .info) }
                }
                Text(term.heardAs.isEmpty ? "Přepis ho zatím slyší správně." : "Slyší jako: \(term.heardAs.joined(separator: ", "))")
                  .font(DilkyFont.sans(12))
                  .foregroundStyle(Dilky.quiet)
                  .fixedSize(horizontal: false, vertical: true)
              }
              Spacer()
              if term.uses > 0 {
                Text("\(HubFormat.number(term.uses))×").font(DilkyFont.mono(11)).foregroundStyle(Dilky.quiet).help("Kolikrát slovník opravil přepis")
              }
              IconButton(symbol: "pencil", help: "Upravit") { editor = .word(term) }
              IconButton(symbol: "trash", help: "Smazat") {
                Task { await hub.deleteWord(id: term.id, label: term.term) }
              }
            }
            .padding(.vertical, 10)
          }
        }
      }
    }
  }

  private func snippetsCard(_ snippets: [DictionarySnippet]) -> some View {
    HubCard(title: "Zkratky", subtitle: "Řeknete zkratku a vloží se celý text. Hodí se na podpis, adresu nebo číslo účtu.") {
      Button("Přidat zkratku") { editor = .snippet(nil) }.buttonStyle(HubSecondaryButton(compact: true))
      if snippets.isEmpty {
        HubEmptyState(text: HubMessages.emptySnippets)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(snippets.enumerated()), id: \.element.id) { index, snippet in
            if index > 0 { Divider().overlay(Dilky.navy100) }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
              VStack(alignment: .leading, spacing: 3) {
                Text("„\(snippet.trigger)“").font(DilkyFont.sans(14, weight: 600))
                Text(snippet.expansion)
                  .font(DilkyFont.sans(12))
                  .foregroundStyle(Dilky.quiet)
                  .lineLimit(2)
              }
              Spacer()
              IconButton(symbol: "pencil", help: "Upravit") { editor = .snippet(snippet) }
              IconButton(symbol: "trash", help: "Smazat") {
                Task { await hub.deleteWord(id: snippet.id, label: snippet.trigger) }
              }
            }
            .padding(.vertical, 10)
          }
        }
      }
    }
  }
}

private struct DictionaryEditor: View {
  let editor: DictionaryView.Editor
  @ObservedObject var hub: HubModel
  let close: () -> Void

  @State private var first = ""
  @State private var second = ""
  @State private var error: String?
  @State private var saving = false

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(title).font(DilkyFont.sans(18, weight: 600))
      VStack(alignment: .leading, spacing: 6) {
        Text(isWord ? "Jak se píše správně" : "Zkratka, kterou řeknete").font(DilkyFont.sans(13, weight: 500))
        HubTextField(placeholder: isWord ? "ZakazIQ" : "můj podpis", text: $first)
      }
      VStack(alignment: .leading, spacing: 6) {
        Text(isWord ? "Jak to přepis slyší (nepovinné)" : "Text, který se vloží").font(DilkyFont.sans(13, weight: 500))
        if isWord {
          HubTextField(placeholder: "zákaz iq, zakaz ik", text: $second)
          Text("Víc variant oddělte čárkou, nejvýš 10.").font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
        } else {
          TextEditor(text: $second)
            .font(DilkyFont.sans(14))
            .scrollContentBackground(.hidden)
            .padding(8)
            .frame(height: 110)
            .background(Dilky.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Dilky.navy100, lineWidth: 1))
        }
      }
      if let error { HubMessage(text: error, tone: .danger) }
      HStack(spacing: 10) {
        Spacer()
        Button("Zrušit", action: close).buttonStyle(HubSecondaryButton()).keyboardShortcut(.cancelAction)
        Button("Uložit") { Task { await save() } }
          .buttonStyle(HubPrimaryButton())
          .keyboardShortcut(.defaultAction)
          .disabled(saving || first.trimmingCharacters(in: .whitespaces).isEmpty || (!isWord && second.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
      }
    }
    .padding(24)
    .frame(width: 440)
    .background(Dilky.ground)
    .foregroundStyle(Dilky.navy950)
    .onAppear(perform: fill)
  }

  private var isWord: Bool {
    if case .word = editor { return true }
    return false
  }

  private var title: String {
    switch editor {
    case .word(let w): return w == nil ? "Nové slovo" : "Upravit slovo"
    case .snippet(let s): return s == nil ? "Nová zkratka" : "Upravit zkratku"
    }
  }

  private func fill() {
    switch editor {
    case .word(let w?):
      first = w.term
      second = w.heardAs.joined(separator: ", ")
    case .snippet(let s?):
      first = s.trigger
      second = s.expansion
    default:
      break
    }
  }

  private func save() async {
    saving = true
    defer { saving = false }
    let edit: DictionaryEdit
    switch editor {
    case .word(let w):
      edit = .word(id: w?.id, term: first, heardAs: HubMessages.splitHeardAs(second))
    case .snippet(let s):
      edit = .snippet(id: s?.id, trigger: first, expansion: second)
    }
    if let message = await hub.save(edit) {
      error = message
    } else {
      close()
    }
  }
}

/// Styl: pro každou kategorii aplikací styl čištění textu, s ukázkou téže věty. Přes `/settings`.
struct StyleView: View {
  @ObservedObject var hub: HubModel

  var body: some View {
    HubPage {
      HubPageHeader(
        title: "Styl",
        subtitle: "Jak se má učesat text podle toho, kam píšete. Kategorii pozná aplikace podle programu vpředu."
      )
      if let error = hub.remoteError {
        HubMessage(text: error, tone: .danger)
      }
      if let remote = hub.remote {
        if !remote.cleanupEnabled {
          HubMessage(text: "Čištění textu je vypnuté, vkládá se přepis beze změn. Zapnete ho v Nastavení › Soukromí a čištění.")
        }
        sample
        ForEach(VoiceCategory.allCases) { category in
          categoryCard(category, current: remote.style(for: category))
        }
      } else if hub.remoteError == nil {
        HubCard { ProgressView().controlSize(.small).frame(maxWidth: .infinity, minHeight: 80) }
      }
    }
  }

  private var sample: some View {
    HubCard(title: "Ukázka", subtitle: "Řeknete:") {
      Text("„\(VoiceStyle.sampleHeard)“")
        .font(DilkyFont.sans(14))
        .foregroundStyle(Dilky.quiet)
      VStack(alignment: .leading, spacing: 8) {
        ForEach(VoiceStyle.allCases) { style in
          HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(style.title).font(DilkyFont.sans(12, weight: 600)).frame(width: 80, alignment: .leading)
            Text(style.sample).font(DilkyFont.sans(14))
          }
        }
      }
    }
  }

  private func categoryCard(_ category: VoiceCategory, current: VoiceStyle) -> some View {
    HubCard(title: category.title, subtitle: category.apps) {
      HStack(spacing: 8) {
        ForEach(VoiceStyle.allCases) { style in
          Button(style.title) { Task { await hub.setStyle(style, for: category) } }
            .buttonStyle(HubChoiceButton(selected: current == style))
            .disabled(hub.savingRemote)
            .accessibilityAddTraits(current == style ? .isSelected : [])
        }
      }
      Text(current.explanation).font(DilkyFont.sans(12)).foregroundStyle(Dilky.quiet)
    }
  }
}
