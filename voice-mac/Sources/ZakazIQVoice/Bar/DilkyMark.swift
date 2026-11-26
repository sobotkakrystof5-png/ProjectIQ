import SwiftUI
import ZakazIQVoiceCore

/// Mřížka 2×2 bílých dílků z loga: zaoblení i mezera 28 % strany dílku.
///
/// Pořadí jasů je po směru hodinových ručiček od levého horního
/// (levý horní, pravý horní, pravý dolní, levý dolní), stejně jako v náhledu.
struct DilkyMark: View {
  enum Mode: Equatable {
    /// Klid: všechny dílky bílé.
    case solid
    /// Mluvení: každý dílek svítí podle pásma hlasitosti.
    case level(Double)
    /// Zpracování: dílky se rozsvěcují dokola (600 ms na kolo).
    case spin
    /// Hotovo: krátké bliknutí.
    case blink
  }

  let tile: CGFloat
  let mode: Mode
  var reduceMotion = false

  static let cycle: TimeInterval = 0.6
  /// Pozice dílků v mřížce v pořadí po směru hodin (sloupec, řádek).
  private static let clockwise: [(Int, Int)] = [(0, 0), (1, 0), (1, 1), (0, 1)]

  var body: some View {
    if mode == .spin, !reduceMotion {
      TimelineView(.animation) { context in
        grid(brightness: Self.spinBrightness(at: context.date.timeIntervalSinceReferenceDate))
      }
    } else {
      grid(brightness: staticBrightness)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: staticBrightness)
    }
  }

  private var staticBrightness: [Double] {
    switch mode {
    case .solid, .blink: return [1, 1, 1, 1]
    case .level(let value): return reduceMotion ? [1, 1, 1, 1] : SpeechMeter.tileBrightness(level: value)
    case .spin: return [0.6, 0.6, 0.6, 0.6]
    }
  }

  /// Rozsvícený je jeden dílek, předchozí dohasíná.
  static func spinBrightness(at time: TimeInterval) -> [Double] {
    let phase = time.truncatingRemainder(dividingBy: cycle) / cycle
    let active = min(3, Int(phase * 4))
    return (0..<4).map { index in
      if index == active { return 1 }
      if index == (active + 3) % 4 { return 0.55 }
      return 0.25
    }
  }

  private func grid(brightness: [Double]) -> some View {
    let gap = tile * 0.28
    return ZStack(alignment: .topLeading) {
      ForEach(0..<4, id: \.self) { index in
        let (col, row) = Self.clockwise[index]
        RoundedRectangle(cornerRadius: tile * 0.28, style: .continuous)
          .fill(Color.white.opacity(brightness[index]))
          .frame(width: tile, height: tile)
          .offset(x: CGFloat(col) * (tile + gap), y: CGFloat(row) * (tile + gap))
      }
    }
    .frame(width: tile * 2 + gap, height: tile * 2 + gap, alignment: .topLeading)
    .accessibilityHidden(true)
  }
}

/// 16 svislých čar v barvě `navy-300`, výška podle posledních úrovní hlasu.
struct Waveform: View {
  let levels: [Double]
  var reduceMotion = false
  var height: CGFloat = 20

  var body: some View {
    HStack(alignment: .center, spacing: 3) {
      ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
        Capsule()
          .fill(Dilky.navy300)
          .frame(width: 2, height: barHeight(level))
      }
    }
    .frame(height: height)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.08), value: levels)
    .accessibilityHidden(true)
  }

  private func barHeight(_ level: Double) -> CGFloat {
    if reduceMotion { return height * 0.55 }
    return height * (0.2 + 0.75 * min(1, max(0, level)))
  }
}
