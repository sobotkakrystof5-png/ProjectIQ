import Foundation

/// Stav pole hned po vložení diktátu (VO09): obsah, kde vložený text leží a kotvy kolem něj.
/// Pozice jsou v jednotkách UTF-16, stejně jako `kAXSelectedTextRangeAttribute`.
public struct PasteSnapshot: Equatable, Sendable {
  public let inserted: String
  /// Kde vložený text začínal (UTF-16).
  public let start: Int
  /// Text těsně před vloženým úsekem; prázdný nebo kratší = vložení u začátku pole.
  public let prefix: String
  public let prefixAtFieldStart: Bool
  /// Text těsně za vloženým úsekem; prázdný nebo kratší = vložení u konce pole.
  public let suffix: String
  public let suffixAtFieldEnd: Bool
}

/// Najde v poli úsek, který vložil ZakazIQ Voice, a pozná, jestli ho člověk opravil.
/// Čisté funkce bez systému (plán, oddíl 5: rozdíl jen z vloženého úseku, nehádat).
public enum EditLocator {
  /// Délka kotvy před a za vloženým textem (plán: aspoň 20 znaků nebo začátek/konec pole).
  public static let anchorLength = 32
  /// Delší pole se nečte (plán VO09).
  public static let maxFieldLength = 50_000

  /// Snímek po vložení. `caret` = kurzor po vložení (konec vloženého textu).
  /// Nesedí-li text na místě kurzoru, hledá vložený text nejblíž kurzoru; nenajde-li ho, `nil`.
  public static func snapshot(field: String, inserted: String, caret: Int) -> PasteSnapshot? {
    let ns = field as NSString
    let len = (inserted as NSString).length
    guard len > 0, ns.length <= maxFieldLength else { return nil }

    var start = caret - len
    if start < 0 || start + len > ns.length || ns.substring(with: NSRange(location: start, length: len)) != inserted {
      guard let nearest = occurrences(of: inserted, in: ns).min(by: { abs($0 + len - caret) < abs($1 + len - caret) }) else { return nil }
      start = nearest
    }
    let end = start + len
    let prefixFrom = max(0, start - anchorLength)
    let suffixTo = min(ns.length, end + anchorLength)
    return PasteSnapshot(
      inserted: inserted,
      start: start,
      prefix: ns.substring(with: NSRange(location: prefixFrom, length: start - prefixFrom)),
      prefixAtFieldStart: prefixFrom == 0,
      suffix: ns.substring(with: NSRange(location: end, length: suffixTo - end)),
      suffixAtFieldEnd: suffixTo == ns.length
    )
  }

  /// Jak vložený úsek vypadá teď. `nil` = nic neposílat: beze změny, změněná jen
  /// interpunkce, kotvy chybí (pole vymazané, zpráva odeslaná) nebo je to nový text.
  /// Prázdný řetězec = celý vložený text smazaný (kotvy zůstaly).
  public static func editedSegment(_ snap: PasteSnapshot, now: String) -> String? {
    if case .edited(let text) = locate(snap, now: now) { return text }
    return nil
  }

  /// Výsledek hledání vloženého úseku v poli.
  public enum Outcome: Equatable, Sendable {
    /// Úsek je na místě a člověk ho nezměnil (nebo jen interpunkci).
    case unchanged
    /// Úsek je na místě a vypadá jinak; prázdný = celý smazaný.
    case edited(String)
    /// Úsek nejde najít: kotvy zmizely, pole je prázdné, nebo je na místě jiný text.
    case lost
  }

  public static func locate(_ snap: PasteSnapshot, now: String) -> Outcome {
    let ns = now as NSString
    guard ns.length <= maxFieldLength else { return .lost }

    // Pole tvořil jen vložený text a teď je prázdné = odešlo nebo se smazalo. Nehádat.
    let onlyInserted = snap.prefix.isEmpty && snap.suffix.isEmpty
    if onlyInserted && now.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .lost }

    let starts = anchorEnds(prefix: snap.prefix, atFieldStart: snap.prefixAtFieldStart, in: ns)
    let ends = anchorStarts(suffix: snap.suffix, atFieldEnd: snap.suffixAtFieldEnd, in: ns)
    guard !starts.isEmpty, !ends.isEmpty else { return .lost }

    // Opakovaný text v poli: vybrat dvojici kotev nejblíž původnímu místu.
    var best: (Int, Int)?
    var bestScore = Int.max
    for s in starts {
      for e in ends where e >= s {
        let score = abs(s - snap.start) + abs(e - (snap.start + (snap.inserted as NSString).length))
        if score < bestScore {
          bestScore = score
          best = (s, e)
        }
      }
    }
    guard let (s, e) = best else { return .lost }
    let segment = ns.substring(with: NSRange(location: s, length: e - s))

    if segment == snap.inserted { return .unchanged }
    if segment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return onlyInserted ? .lost : .edited("")
    }
    // Změna jen interpunkce se nepočítá (velká písmena ano).
    if words(segment) == words(snap.inserted) { return .unchanged }
    // Nezůstalo ani slovo z delšího diktátu = na místě je jiný text (označit vše a psát),
    // ne oprava. Víc než polovinu slov jinak pozná server sám a uloží aspoň počet oprav.
    if words(snap.inserted).count >= 3 && keptShare(of: snap.inserted, in: segment) == 0 { return .lost }
    return .edited(segment)
  }

  // MARK: Pomocné

  static func words(_ s: String) -> [String] {
    s.components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
  }

  /// Podíl slov vloženého textu, která v úseku zůstala (bez ohledu na velikost písmen).
  static func keptShare(of inserted: String, in segment: String) -> Double {
    let original = words(inserted).map { $0.lowercased() }
    guard !original.isEmpty else { return 1 }
    var pool: [String: Int] = [:]
    for w in words(segment) { pool[w.lowercased(), default: 0] += 1 }
    var kept = 0
    for w in original where (pool[w] ?? 0) > 0 {
      pool[w]! -= 1
      kept += 1
    }
    return Double(kept) / Double(original.count)
  }

  static func occurrences(of needle: String, in haystack: NSString) -> [Int] {
    guard !needle.isEmpty else { return [] }
    var result: [Int] = []
    var range = NSRange(location: 0, length: haystack.length)
    while range.length > 0 {
      let found = haystack.range(of: needle, options: .literal, range: range)
      guard found.location != NSNotFound else { break }
      result.append(found.location)
      let next = found.location + 1
      range = NSRange(location: next, length: haystack.length - next)
    }
    return result
  }

  /// Kde může začínat úsek: za kotvou před ním.
  static func anchorEnds(prefix: String, atFieldStart: Bool, in ns: NSString) -> [Int] {
    let len = (prefix as NSString).length
    if atFieldStart {
      return (ns as String).hasPrefix(prefix) ? [len] : []
    }
    return occurrences(of: prefix, in: ns).map { $0 + len }
  }

  /// Kde může končit úsek: před kotvou za ním.
  static func anchorStarts(suffix: String, atFieldEnd: Bool, in ns: NSString) -> [Int] {
    let len = (suffix as NSString).length
    if atFieldEnd {
      return (ns as String).hasSuffix(suffix) ? [ns.length - len] : []
    }
    return occurrences(of: suffix, in: ns)
  }
}
