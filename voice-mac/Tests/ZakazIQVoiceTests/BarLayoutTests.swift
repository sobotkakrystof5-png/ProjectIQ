import CoreGraphics
import Testing
@testable import ZakazIQVoiceCore

@Suite("Lišta: velikost a umístění")
struct BarLayoutTests {
  // Dvě obrazovky vedle sebe: vestavěná (Dock dole, 70 px) a externí vpravo bez Docku.
  let builtIn = CGRect(x: 0, y: 0, width: 1512, height: 982)
  let builtInVisible = CGRect(x: 0, y: 70, width: 1512, height: 879)
  let external = CGRect(x: 1512, y: -200, width: 2560, height: 1440)
  let externalVisible = CGRect(x: 1512, y: -200, width: 2560, height: 1415)

  @Test("obrazovka s kurzorem; mimo všechny je hlavní")
  func cursorScreen() {
    let frames = [builtIn, external]
    #expect(BarLayout.screenIndex(containing: CGPoint(x: 300, y: 500), frames: frames) == 0)
    #expect(BarLayout.screenIndex(containing: CGPoint(x: 2000, y: 0), frames: frames) == 1)
    #expect(BarLayout.screenIndex(containing: CGPoint(x: -500, y: -500), frames: frames) == 0)
    #expect(BarLayout.screenIndex(containing: .zero, frames: []) == 0)
  }

  @Test("panel je vodorovně uprostřed a 12 px nad Dockem")
  func origin() {
    let size = BarLayout.panelSize
    let onBuiltIn = BarLayout.panelOrigin(visibleFrame: builtInVisible)
    #expect(onBuiltIn.y == CGFloat(82))
    #expect(onBuiltIn.x + size.width / 2 == builtInVisible.midX)

    let onExternal = BarLayout.panelOrigin(visibleFrame: externalVisible)
    #expect(onExternal.y == CGFloat(-188))
    #expect(onExternal.x == (externalVisible.midX - size.width / 2).rounded())
  }

  @Test("velikosti stavů podle náhledu, v klidu najetí zvětší")
  func sizes() {
    #expect(BarLayout.pillSize(for: .idle, hovering: false) == CGSize(width: 48, height: 14))
    #expect(BarLayout.pillSize(for: .idle, hovering: true) == CGSize(width: 184, height: 32))
    #expect(BarLayout.pillSize(for: .listening(.hold), hovering: true) == CGSize(width: 216, height: 36))
    #expect(BarLayout.pillSize(for: .listening(.handsFree), hovering: false) == CGSize(width: 252, height: 36))
    #expect(BarLayout.pillSize(for: .processing, hovering: false) == CGSize(width: 96, height: 28))
    #expect(BarLayout.pillSize(for: .message(BarMessage("Text je ve schránce")), hovering: false) == CGSize(width: 248, height: 32))
    #expect(BarLayout.pillSize(for: .hidden, hovering: true) == .zero)
    #expect(BarLayout.tileSize(for: .idle, hovering: false) == 4)
    #expect(BarLayout.tileSize(for: .idle, hovering: true) == 10)
    #expect(BarLayout.tileSize(for: .processing, hovering: false) == 7)
    // Všechny stavy se vejdou do pevného panelu.
    let stages: [BarStage] = [.idle, .listening(.hold), .listening(.handsFree), .processing, .done, .message(BarMessage("x"))]
    for stage in stages {
      let pill = BarLayout.pillSize(for: stage, hovering: true)
      #expect(pill.width <= BarLayout.panelSize.width && pill.height <= BarLayout.panelSize.height)
    }
  }

  @Test("pilulka je v panelu dole uprostřed")
  func pillRect() {
    let rect = BarLayout.pillRect(pill: CGSize(width: 48, height: 14))
    #expect(rect.minY == 0)
    #expect(rect.midX == BarLayout.panelSize.width / 2)
  }

  @Test("čas na liště m:ss, hláška s nabídkou kopírování drží déle")
  func texts() {
    #expect(BarLayout.elapsedText(0) == "0:00")
    #expect(BarLayout.elapsedText(7.9) == "0:07")
    #expect(BarLayout.elapsedText(570) == "9:30")
    #expect(BarLayout.elapsedText(-3) == "0:00")
    #expect(BarMessage("Bez připojení, diktát počká", tone: .error).duration == 3)
    #expect(BarMessage("Přepsáno", copyText: "ahoj").duration == 8)
  }
}
