import Foundation

/// Režim diktátu tak, jak ho posílá `meta.mode` (plán, oddíl 7).
public enum DictationMode: String, Codable, Sendable, Equatable {
  /// Klávesa držená po celou dobu.
  case hold
  /// Dvojí stisk, nebo klik na lištu: nahrává se bez držení, konec dalším stiskem.
  case handsFree = "hands_free"
}

/// Co se stalo na klávesnici nebo na liště. Čas dodává volající (`handle(_:at:)`).
public enum TriggerEvent: Equatable, Sendable {
  /// Zkratka dolů (fn nebo pravý ⌥). `secureInput` = pole pro heslo.
  case keyDown(secureInput: Bool)
  case keyUp
  /// Jiná klávesa při držené zkratce (fn+F5, fn+šipka) = uživatel chtěl zkratku.
  case otherKey
  case escape
  /// Enter během nahrávání: diktát skončí (aplikace klávesu do pole nepustí).
  case enter
  /// Měření právě zachytilo řeč (úsek 50 ms nad prahem). Hlídá konec po tichu.
  case speech
  /// Klik na lištu: v klidu spustí diktát bez držení, během něj ho dokončí.
  case barClick(secureInput: Bool)
  /// Tlačítko Zrušit (×) na liště.
  case barCancel
  /// Pravidelný tik (každých 50 ms během nahrávání), hlídá prahy a limit.
  case tick
  /// Zpracování (odeslání a vložení) skončilo.
  case processingDone
}

public enum DiscardReason: Equatable, Sendable {
  /// Stisk kratší než 0,3 s, který nebyl prvním ze dvou.
  case tooShort
  /// Jiná klávesa při držené zkratce.
  case otherKey
}

/// Co má aplikace udělat. Pořadí v poli je pořadí provedení.
public enum TriggerAction: Equatable, Sendable {
  /// Začít nahrávat hned při stisku, ať se neztratí první slabika.
  case startRecording
  /// Stisk už je diktát (držení ≥ 0,3 s nebo dvojí stisk): roztáhnout lištu.
  case showListening(DictationMode)
  /// Konec nahrávky, odeslat.
  case finish(DictationMode)
  /// Zastavit a nahrávku zahodit, nic se neposílá.
  case discard(DiscardReason)
  /// Esc nebo Zrušit: zahodit nahrávku, serveru jen „zrušeno" kvůli statistice.
  case cancel
  /// Esc během zpracování: výsledek se nevloží (zůstane jen v historii).
  case abandon
  /// V poli pro heslo se nenahrává.
  case refuseSecureInput
  /// 9 a půl minuty: upozornit, v 10 minutách diktát skončí sám.
  case warnLong
}

/// Stavový automat diktátu (D-V6, D-V11). Čistá logika bez systému: testy krmí události
/// a čas, aplikace provádí vrácené akce.
public struct DictationTrigger: Sendable {
  public static let holdThreshold: TimeInterval = 0.3
  public static let doubleTapWindow: TimeInterval = 0.4
  public static let warnAfter: TimeInterval = 9 * 60 + 30
  public static let maxDuration: TimeInterval = 10 * 60
  /// Diktát bez držení skončí sám, když tolik sekund nikdo nemluví.
  public static let silenceStop: TimeInterval = 10

  public enum State: Equatable, Sendable {
    case idle
    /// Klávesa dole, nahrává se, ještě se nerozhodlo, jestli je to diktát.
    case pressing(since: TimeInterval)
    /// Krátký stisk: nahrávání běží dál, čeká se 0,4 s na druhý stisk.
    case tapped(startedAt: TimeInterval, releasedAt: TimeInterval)
    case recording(mode: DictationMode, startedAt: TimeInterval, keyHeld: Bool, warned: Bool)
    case processing
  }

  public private(set) var state: State = .idle
  /// Kdy naposledy zazněla řeč (`.speech`). Nová nahrávka ho vynuluje.
  public private(set) var lastSpeechAt: TimeInterval?

  public init() {}

  /// Běží nahrávání (i před rozhodnutím, jestli je to diktát).
  public var isRecording: Bool {
    switch state {
    case .pressing, .tapped, .recording: return true
    case .idle, .processing: return false
    }
  }

  /// Esc se pohltí jen během nahrávání a zpracování, jinak patří aplikaci vpředu.
  public var capturesEscape: Bool { state != .idle }

  /// Enter se pohltí jen během nahrávání (diktát ukončí). Jindy patří aplikaci vpředu.
  public var capturesEnter: Bool {
    if case .recording = state { return true }
    return false
  }

  /// Návrat do klidu bez akcí (např. když se nahrávání nepodařilo spustit).
  public mutating func reset() { state = .idle }

  public mutating func handle(_ event: TriggerEvent, at now: TimeInterval) -> [TriggerAction] {
    if event == .speech {
      if isRecording { lastSpeechAt = now }
      return []
    }
    switch state {
    case .idle:
      return idle(event, now)
    case .pressing(let since):
      return pressing(event, now, since: since)
    case .tapped(let startedAt, let releasedAt):
      return tapped(event, now, startedAt: startedAt, releasedAt: releasedAt)
    case .recording(let mode, let startedAt, let keyHeld, let warned):
      return recording(event, now, mode: mode, startedAt: startedAt, keyHeld: keyHeld, warned: warned)
    case .processing:
      switch event {
      case .processingDone:
        state = .idle
        return []
      case .escape:
        return [.abandon]
      default:
        return []
      }
    }
  }

  // MARK: Stavy

  private mutating func idle(_ event: TriggerEvent, _ now: TimeInterval) -> [TriggerAction] {
    switch event {
    case .keyDown(let secure):
      if secure { return [.refuseSecureInput] }
      state = .pressing(since: now)
      lastSpeechAt = nil
      return [.startRecording]
    case .barClick(let secure):
      if secure { return [.refuseSecureInput] }
      state = .recording(mode: .handsFree, startedAt: now, keyHeld: false, warned: false)
      lastSpeechAt = nil
      return [.startRecording, .showListening(.handsFree)]
    default:
      return []
    }
  }

  private mutating func pressing(_ event: TriggerEvent, _ now: TimeInterval, since: TimeInterval) -> [TriggerAction] {
    switch event {
    case .keyUp:
      if now - since >= Self.holdThreshold {
        state = .processing
        return [.finish(.hold)]
      }
      state = .tapped(startedAt: since, releasedAt: now)
      return []
    case .tick:
      guard now - since >= Self.holdThreshold else { return [] }
      state = .recording(mode: .hold, startedAt: since, keyHeld: true, warned: false)
      return [.showListening(.hold)]
    case .otherKey:
      state = .idle
      return [.discard(.otherKey)]
    case .escape:
      state = .idle
      return [.discard(.tooShort)]
    default:
      return []
    }
  }

  private mutating func tapped(
    _ event: TriggerEvent, _ now: TimeInterval, startedAt: TimeInterval, releasedAt: TimeInterval
  ) -> [TriggerAction] {
    switch event {
    case .keyDown(let secure):
      if now - releasedAt <= Self.doubleTapWindow {
        // Druhý stisk: diktát bez držení, nahrávka platí od prvního stisku.
        state = .recording(mode: .handsFree, startedAt: startedAt, keyHeld: true, warned: false)
        return [.showListening(.handsFree)]
      }
      // Pozdě na dvojí stisk (tik nepřišel včas): starou nahrávku zahodit, začít novou.
      if secure {
        state = .idle
        return [.discard(.tooShort), .refuseSecureInput]
      }
      state = .pressing(since: now)
      lastSpeechAt = nil
      return [.discard(.tooShort), .startRecording]
    case .tick:
      guard now - releasedAt > Self.doubleTapWindow else { return [] }
      state = .idle
      return [.discard(.tooShort)]
    case .escape, .otherKey:
      state = .idle
      return [.discard(.tooShort)]
    default:
      return []
    }
  }

  private mutating func recording(
    _ event: TriggerEvent,
    _ now: TimeInterval,
    mode: DictationMode,
    startedAt: TimeInterval,
    keyHeld: Bool,
    warned: Bool
  ) -> [TriggerAction] {
    switch event {
    case .keyUp:
      if mode == .hold {
        state = .processing
        return [.finish(.hold)]
      }
      state = .recording(mode: mode, startedAt: startedAt, keyHeld: false, warned: warned)
      return []
    case .keyDown:
      guard mode == .handsFree, !keyHeld else { return [] }
      state = .processing
      return [.finish(.handsFree)]
    case .otherKey:
      // Při drženém fn je to zkratka. Bez držení (diktát bez držení) se píše dál.
      guard mode == .hold, keyHeld else { return [] }
      state = .idle
      return [.discard(.otherKey)]
    case .enter:
      state = .processing
      return [.finish(mode)]
    case .escape, .barCancel:
      state = .idle
      return [.cancel]
    case .barClick:
      guard mode == .handsFree else { return [] }
      state = .processing
      return [.finish(.handsFree)]
    case .tick:
      let elapsed = now - startedAt
      if elapsed >= Self.maxDuration {
        state = .processing
        return [.finish(mode)]
      }
      // Bez držení: 10 s ticha od poslední řeči (nebo od začátku) diktát ukončí.
      // Při držení rozhoduje puštění klávesy, pauza na rozmyšlenou nevadí.
      if mode == .handsFree, now - max(startedAt, lastSpeechAt ?? startedAt) >= Self.silenceStop {
        state = .processing
        return [.finish(mode)]
      }
      if elapsed >= Self.warnAfter, !warned {
        state = .recording(mode: mode, startedAt: startedAt, keyHeld: keyHeld, warned: true)
        return [.warnLong]
      }
      return []
    case .processingDone, .speech:
      return []
    }
  }
}
