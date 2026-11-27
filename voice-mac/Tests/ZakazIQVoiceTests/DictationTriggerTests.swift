import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Klávesa fn a stav diktátu")
struct DictationTriggerTests {
  /// Pomocník: projde události s časy a vrátí všechny akce za sebou.
  private func run(_ steps: [(TriggerEvent, TimeInterval)], trigger: inout DictationTrigger) -> [TriggerAction] {
    steps.flatMap { trigger.handle($0.0, at: $0.1) }
  }

  @Test("nahrává se hned při stisku, ne až po 0,3 s")
  func startsImmediately() {
    var t = DictationTrigger()
    #expect(t.handle(.keyDown(secureInput: false), at: 0) == [.startRecording])
    #expect(t.isRecording)
  }

  @Test("držení ≥ 0,3 s je diktát, puštění ho odešle")
  func hold() {
    var t = DictationTrigger()
    let actions = run([
      (.keyDown(secureInput: false), 0),
      (.tick, 0.2),
      (.tick, 0.35),
      (.tick, 2),
      (.keyUp, 3),
    ], trigger: &t)
    #expect(actions == [.startRecording, .showListening(.hold), .finish(.hold)])
    #expect(t.state == .processing)
  }

  @Test("puštění po 0,3 s odešle, i když tik ještě nepřišel")
  func holdWithoutTick() {
    var t = DictationTrigger()
    let actions = run([(.keyDown(secureInput: false), 0), (.keyUp, 0.31)], trigger: &t)
    #expect(actions == [.startRecording, .finish(.hold)])
  }

  @Test("krátký stisk se po 0,4 s bez druhého stisku zahodí")
  func shortTapDiscarded() {
    var t = DictationTrigger()
    let actions = run([
      (.keyDown(secureInput: false), 0),
      (.keyUp, 0.1),
      (.tick, 0.3),
      (.tick, 0.55),
    ], trigger: &t)
    #expect(actions == [.startRecording, .discard(.tooShort)])
    #expect(t.state == .idle)
  }

  @Test("dvakrát fn do 0,4 s = diktát bez držení, další fn ho ukončí")
  func doubleTapHandsFree() {
    var t = DictationTrigger()
    let actions = run([
      (.keyDown(secureInput: false), 0),
      (.keyUp, 0.1),
      (.keyDown(secureInput: false), 0.3),
      (.keyUp, 0.4),
      (.tick, 5),
      (.otherKey, 6),
      (.keyDown(secureInput: false), 8),
      (.keyUp, 8.1),
    ], trigger: &t)
    #expect(actions == [.startRecording, .showListening(.handsFree), .finish(.handsFree)])
    #expect(t.state == .processing)
  }

  @Test("diktát bez držení začíná prvním stiskem (žádná ztracená slabika)")
  func handsFreeKeepsFirstPressStart() {
    var t = DictationTrigger()
    _ = run([(.keyDown(secureInput: false), 10), (.keyUp, 10.1), (.keyDown(secureInput: false), 10.3)], trigger: &t)
    #expect(t.state == .recording(mode: .handsFree, startedAt: 10, keyHeld: true, warned: false))
  }

  @Test("Esc během nahrávání diktát zruší, během zpracování výsledek nevloží")
  func escape() {
    var t = DictationTrigger()
    let cancel = run([(.keyDown(secureInput: false), 0), (.tick, 0.5), (.escape, 1)], trigger: &t)
    #expect(cancel == [.startRecording, .showListening(.hold), .cancel])
    #expect(t.state == .idle)
    #expect(!t.capturesEscape)

    let abandon = run([(.keyDown(secureInput: false), 2), (.keyUp, 3), (.escape, 3.5), (.processingDone, 4)], trigger: &t)
    #expect(abandon == [.startRecording, .finish(.hold), .abandon])
    #expect(t.state == .idle)
  }

  @Test("Esc se pohlcuje jen během nahrávání a zpracování")
  func escapeCapture() {
    var t = DictationTrigger()
    #expect(!t.capturesEscape)
    _ = t.handle(.keyDown(secureInput: false), at: 0)
    #expect(t.capturesEscape)
    _ = t.handle(.keyUp, at: 1)
    #expect(t.capturesEscape)
    _ = t.handle(.processingDone, at: 2)
    #expect(!t.capturesEscape)
  }

  @Test("jiná klávesa při drženém fn (fn+F5, fn+šipka) diktát zruší")
  func otherKeyCancels() {
    var early = DictationTrigger()
    #expect(run([(.keyDown(secureInput: false), 0), (.otherKey, 0.1)], trigger: &early) == [.startRecording, .discard(.otherKey)])

    var late = DictationTrigger()
    let actions = run([(.keyDown(secureInput: false), 0), (.tick, 0.4), (.otherKey, 1), (.keyUp, 1.2)], trigger: &late)
    #expect(actions == [.startRecording, .showListening(.hold), .discard(.otherKey)])
    #expect(late.state == .idle)
  }

  @Test("v 9:30 upozornění jednou, v 10:00 diktát skončí sám")
  func tenMinuteLimit() {
    var t = DictationTrigger()
    let actions = run([
      (.keyDown(secureInput: false), 0),
      (.tick, 0.5),
      (.tick, 569),
      (.tick, 570),
      (.tick, 571),
      (.tick, 599.9),
      (.tick, 600),
    ], trigger: &t)
    #expect(actions == [.startRecording, .showListening(.hold), .warnLong, .finish(.hold)])
  }

  @Test("v poli pro heslo se nenahrává")
  func secureInput() {
    var t = DictationTrigger()
    #expect(t.handle(.keyDown(secureInput: true), at: 0) == [.refuseSecureInput])
    #expect(t.state == .idle)
    #expect(t.handle(.barClick(secureInput: true), at: 1) == [.refuseSecureInput])
    #expect(t.state == .idle)
  }

  @Test("klik na lištu spustí diktát bez držení, další klik ho dokončí, Zrušit ho zruší")
  func barClicks() {
    var t = DictationTrigger()
    #expect(t.handle(.barClick(secureInput: false), at: 0) == [.startRecording, .showListening(.handsFree)])
    #expect(t.handle(.barClick(secureInput: false), at: 4) == [.finish(.handsFree)])
    _ = t.handle(.processingDone, at: 5)
    #expect(t.handle(.barClick(secureInput: false), at: 6) == [.startRecording, .showListening(.handsFree)])
    #expect(t.handle(.barCancel, at: 7) == [.cancel])
    #expect(t.state == .idle)
  }

  @Test("během zpracování se nový stisk ignoruje")
  func ignoresWhileProcessing() {
    var t = DictationTrigger()
    _ = run([(.keyDown(secureInput: false), 0), (.keyUp, 1)], trigger: &t)
    #expect(t.handle(.keyDown(secureInput: false), at: 1.5).isEmpty)
    #expect(t.handle(.keyUp, at: 1.6).isEmpty)
    #expect(t.state == .processing)
  }
}

@Suite("Čas řeči a hlasitost")
struct SpeechMeterTests {
  @Test("čas řeči = úseky nad −40 dB po 50 ms")
  func speechMs() {
    let levels: [Float] = [-60, -55, -30, -20, -39.9, -40, -45, -10, -160, -35]
    #expect(SpeechMeter.speechMs(levelsDb: levels) == 5 * 50)
    #expect(SpeechMeter.speechMs(levelsDb: []) == 0)
    #expect(SpeechMeter.speechMs(levelsDb: Array(repeating: -80, count: 100)) == 0)
  }

  @Test("hlasitost 0…1 a pásma dílků")
  func levels() {
    #expect(SpeechMeter.normalized(-160) == 0)
    #expect(SpeechMeter.normalized(-50) == 0)
    #expect(SpeechMeter.normalized(-30) == 0.5)
    #expect(SpeechMeter.normalized(0) == 1)
    #expect(SpeechMeter.normalized(.nan) == 0)

    let dim = SpeechMeter.dimTile
    #expect(SpeechMeter.tileBrightness(level: 0) == [dim, dim, dim, dim])
    #expect(SpeechMeter.tileBrightness(level: 0.3) == [1, dim, dim, dim])
    #expect(SpeechMeter.tileBrightness(level: 0.5) == [1, 1, dim, dim])
    #expect(SpeechMeter.tileBrightness(level: 1) == [1, 1, 1, 1])
    #expect(SpeechMeter.tileBrightness(level: 2) == [1, 1, 1, 1])
  }
}

@Suite("Zkratka a klávesa fn v systému")
struct ShortcutTests {
  @Test("fn a pravý ⌥ se poznají podle vlastního příznaku")
  func flags() {
    #expect(DictationShortcut.fn.isDown(flags: 0x0080_0100))
    #expect(!DictationShortcut.fn.isDown(flags: 0x0008_0120))
    // Levý ⌥ nese maskAlternate a NX_DEVICELALTKEYMASK (0x20), pravý 0x40.
    #expect(!DictationShortcut.rightOption.isDown(flags: 0x0008_0120))
    #expect(DictationShortcut.rightOption.isDown(flags: 0x0008_0140))
    #expect(DictationShortcut.fn.keyCode == 63 && DictationShortcut.rightOption.keyCode == 61)
    #expect(DictationShortcut.fn.matches(keyCode: 63) && DictationShortcut.fn.matches(keyCode: 179))
    #expect(!DictationShortcut.fn.matches(keyCode: 61) && !DictationShortcut.rightOption.matches(keyCode: 58))
  }

  @Test("výběr emoji na fn: rada jen když fn něco dělá")
  func fnUsage() {
    #expect(FnKeyUsage(rawValue: 0) == .nothing)
    #expect(!FnKeyUsage.nothing.interferes && FnKeyUsage.nothing.advice == nil)
    #expect(FnKeyUsage(rawValue: 2) == .emoji)
    #expect(FnKeyUsage(rawValue: nil).interferes)
    #expect(FnKeyUsage(rawValue: 2).advice?.contains("Nedělat nic") == true)
  }

  @Test("volby diktování: výchozí hodnoty a meze")
  func preferences() throws {
    let suite = "cz.zakaziq.voice.tests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let prefs = Preferences(defaults: defaults)
    #expect(prefs.shortcut == .fn)
    #expect(prefs.showBarWhenIdle)
    #expect(!prefs.sounds)
    #expect(prefs.historyDays == 90)
    #expect(prefs.afterDictation == .showText)
    prefs.afterDictation = .paste
    #expect(prefs.afterDictation == .paste)
    defaults.set("nesmysl", forKey: "afterDictation")
    #expect(prefs.afterDictation == .showText)
    prefs.shortcut = .rightOption
    prefs.showBarWhenIdle = false
    prefs.historyDays = 2
    #expect(prefs.shortcut == .rightOption)
    #expect(!prefs.showBarWhenIdle)
    #expect(prefs.historyDays == 7)
  }

}

@Suite("Enter a ticho ukončí diktát")
struct DictationStopTests {
  private func run(_ steps: [(TriggerEvent, TimeInterval)], trigger: inout DictationTrigger) -> [TriggerAction] {
    steps.flatMap { trigger.handle($0.0, at: $0.1) }
  }


  /// Diktát bez držení spuštěný klikem na lištu v čase 0.
  private func handsFree() -> DictationTrigger {
    var t = DictationTrigger()
    _ = t.handle(.barClick(secureInput: false), at: 0)
    return t
  }

  @Test("Enter ukončí diktát bez držení a pohltí se jen během nahrávání")
  func enterFinishesHandsFree() {
    var t = DictationTrigger()
    #expect(!t.capturesEnter)
    _ = t.handle(.barClick(secureInput: false), at: 0)
    #expect(t.capturesEnter)
    #expect(t.handle(.enter, at: 3) == [.finish(.handsFree)])
    #expect(t.state == .processing)
    #expect(!t.capturesEnter)
    #expect(t.handle(.enter, at: 3.1) == [])
  }

  @Test("Enter při drženém fn diktát odešle, nezahodí ho jako zkratku")
  func enterFinishesHold() {
    var t = DictationTrigger()
    let actions = run([
      (.keyDown(secureInput: false), 0),
      (.tick, 0.35),
      (.enter, 2),
      (.keyUp, 2.2),
    ], trigger: &t)
    #expect(actions == [.startRecording, .showListening(.hold), .finish(.hold)])
    #expect(t.state == .processing)
  }

  @Test("Enter před rozhodnutím o diktátu se nepohltí (krátký stisk fn)")
  func enterNotCapturedWhilePressing() {
    var t = DictationTrigger()
    _ = t.handle(.keyDown(secureInput: false), at: 0)
    #expect(!t.capturesEnter)
    _ = t.handle(.keyUp, at: 0.1)
    #expect(!t.capturesEnter)
  }

  @Test("10 s bez řeči ukončí diktát bez držení")
  func silenceStopsHandsFree() {
    var t = handsFree()
    #expect(t.handle(.speech, at: 1) == [])
    #expect(t.handle(.tick, at: 10.9) == [])
    #expect(t.handle(.tick, at: 11) == [.finish(.handsFree)])
    #expect(t.state == .processing)
  }

  @Test("řeč odkládá konec, ticho se počítá od poslední řeči")
  func speechKeepsRecording() {
    var t = handsFree()
    var actions: [TriggerAction] = []
    var time: TimeInterval = 0
    // Mluví se s pauzami po 9 s, 40 s v kuse.
    while time < 40 {
      actions += t.handle(.speech, at: time)
      actions += t.handle(.tick, at: time + 9)
      time += 9
    }
    #expect(actions.isEmpty)
    #expect(t.lastSpeechAt == 36)
    #expect(t.handle(.tick, at: 46) == [.finish(.handsFree)])
  }

  @Test("bez řeči od začátku skončí po 10 s (Mac pak nic neodešle)")
  func silenceFromStart() {
    var t = handsFree()
    #expect(t.handle(.tick, at: 9.95) == [])
    #expect(t.handle(.tick, at: 10) == [.finish(.handsFree)])
  }

  @Test("při drženém fn ticho diktát neukončí")
  func silenceDoesNotStopHold() {
    var t = DictationTrigger()
    _ = t.handle(.keyDown(secureInput: false), at: 0)
    _ = t.handle(.tick, at: 0.35)
    #expect(t.handle(.tick, at: 30) == [])
    #expect(t.handle(.keyUp, at: 31) == [.finish(.hold)])
  }

  @Test("dvojí fn: ticho se počítá od prvního stisku a nový diktát začíná bez staré řeči")
  func silenceAfterDoubleTapAndReset() {
    var t = DictationTrigger()
    _ = run([
      (.keyDown(secureInput: false), 0),
      (.speech, 0.05),
      (.keyUp, 0.1),
      (.keyDown(secureInput: false), 0.3),
      (.keyUp, 0.4),
    ], trigger: &t)
    #expect(t.handle(.tick, at: 10) == [])
    #expect(t.handle(.tick, at: 10.1) == [.finish(.handsFree)])
    _ = t.handle(.processingDone, at: 12)
    // Řeč mimo nahrávání se nepočítá.
    _ = t.handle(.speech, at: 13)
    #expect(t.lastSpeechAt == 0.05)
    _ = t.handle(.barClick(secureInput: false), at: 20)
    #expect(t.lastSpeechAt == nil)
  }
}
