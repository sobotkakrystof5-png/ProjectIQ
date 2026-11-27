import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Schůzka: dělení stopy na promluvy")
struct TurnSegmenterTests {
  /// Projde rámce po 50 ms: `pattern` je seznam (dB, délka v ms) za sebou od času 0.
  private func run(_ pattern: [(Float, Int)], flushAt: Int? = nil) -> [TurnSegmenter.Turn] {
    var s = TurnSegmenter()
    var turns: [TurnSegmenter.Turn] = []
    var t = 0
    for (db, length) in pattern {
      for _ in 0..<(length / TurnSegmenter.frameMs) {
        if let turn = s.add(frameAt: t, db: db) { turns.append(turn) }
        t += TurnSegmenter.frameMs
      }
    }
    if let flushAt, let turn = s.flush(at: flushAt) { turns.append(turn) }
    return turns
  }

  @Test("promluva mezi pauzami: náběh 300 ms, konec po 1,2 s ticha s dozvukem 300 ms")
  func basicTurn() {
    let turns = run([(-90, 2000), (-20, 3000), (-90, 2000)])
    #expect(turns == [.init(startMs: 1700, endMs: 5300, speechMs: 3000)])
  }

  @Test("krátká pauza promluvu nerozdělí, dlouhá ano")
  func pauses() {
    let turns = run([(-20, 2000), (-90, 800), (-20, 1000), (-90, 1500), (-20, 1000), (-90, 2000)])
    #expect(turns.count == 2)
    #expect(turns[0].startMs == 0 && turns[0].endMs == 4100)
    #expect(turns[1].startMs == 5000)
  }

  @Test("kašel pod 300 ms řeči se zahodí")
  func shortNoise() {
    #expect(run([(-90, 1000), (-20, 200), (-90, 2000)]).isEmpty)
  }

  @Test("dlouhý monolog se po 45 s utne v první krátké pauze")
  func softCut() {
    let turns = run([(-20, 46_000), (-90, 400), (-20, 5000), (-90, 2000)])
    #expect(turns.count == 2)
    #expect(turns[0].durationMs < 47_000)
  }

  @Test("bez pauzy natvrdo v 60 s a další promluva navazuje bez náběhu")
  func hardCut() {
    let turns = run([(-20, 70_000), (-90, 2000)])
    #expect(turns.count == 2)
    #expect(turns[0] == .init(startMs: 0, endMs: 60_000, speechMs: 60_000))
    #expect(turns[1].startMs == 60_000)
  }

  @Test("konec schůzky uprostřed řeči dopíše rozpracovanou promluvu")
  func flush() {
    let turns = run([(-90, 1000), (-20, 2000)], flushAt: 3000)
    #expect(turns == [.init(startMs: 700, endMs: 3000, speechMs: 2000)])
  }

  @Test("hlasitost rámce: ticho −160 dB, plná sinusovka kolem −3 dB")
  func rms() {
    #expect(TurnSegmenter.rmsDb([Float](repeating: 0, count: 800)[...]) == -160)
    let sine = (0..<800).map { Float(sin(Double($0) / 800 * 2 * .pi * 10)) }
    #expect(abs(TurnSegmenter.rmsDb(sine[...]) + 3.01) < 0.1)
  }
}

@Suite("Schůzka: data pro server a lištu")
struct MeetingDataTests {
  @Test("meta promluvy: přesná pole, meze, null výslovně")
  func turnMeta() throws {
    let meta = MeetingTurnMeta(track: .other, idx: 3, startMs: -5, durationMs: 500_000, speechMs: nil)
    let json = String(decoding: try meta.json(), as: UTF8.self)
    #expect(json == #"{"durationMs":120000,"idx":3,"speechMs":null,"startMs":0,"track":"other"}"#)
  }

  @Test("detail schůzky ze serveru (datum s milisekundami)")
  func detail() throws {
    let raw = #"{"ok":true,"meeting":{"id":"a","title":null,"startedAt":"2026-11-27T13:10:00.000Z","durationMs":3720000,"status":"done","appName":"Google Chrome","contactName":null,"words":12,"blocks":[{"speaker":"me","label":"Kryštof","startMs":0,"endMs":2000,"text":"Dobrý den."}],"transcript":"[0:00] Kryštof: Dobrý den.","summary":null,"summaryText":null,"failedTurns":0,"turns":1,"hasSummary":false}}"#
    struct Envelope: Decodable { let meeting: MeetingDetailDTO }
    let detail = try JSONDecoder().decode(Envelope.self, from: Data(raw.utf8)).meeting
    #expect(detail.blocks.first?.speaker == .me)
    #expect(MeetingDates.parse(detail.startedAt) != nil)
    #expect(MeetingDates.duration(detail.durationMs) == "1 h 2 min")
    #expect(MeetingDates.offset(3_787_000) == "1:03:07")
  }

  @Test("lišta: schůzka má vlastní velikost a čas přes hodinu")
  func bar() {
    #expect(BarLayout.pillSize(for: .meeting, hovering: false) == CGSize(width: 236, height: 36))
    #expect(BarLayout.elapsedText(3909) == "1:05:09")
    #expect(BarLayout.elapsedText(570) == "9:30")
  }
}
