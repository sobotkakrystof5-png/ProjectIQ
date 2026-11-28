import Foundation
import Testing
@testable import ZakazIQVoiceCore

@Suite("Hovor: které aplikace a jaká služba")
struct CallCatalogTests {
  @Test("pomocný proces prohlížeče patří hlavní aplikaci")
  func helpers() {
    #expect(CallCatalog.mainBundleId("com.google.Chrome.helper") == "com.google.Chrome")
    #expect(CallCatalog.mainBundleId("com.tinyspeck.slackmacgap.helper.Renderer") == "com.tinyspeck.slackmacgap")
    #expect(CallCatalog.mainBundleId("com.apple.WebKit.GPU") == "com.apple.Safari")
    #expect(CallCatalog.mainBundleId("us.zoom.xos") == "us.zoom.xos")
  }

  @Test("aplikace na hovory a prohlížeče se poznají, ostatní ne")
  func classify() {
    #expect(CallCatalog.app(forProcess: "us.zoom.xos") == CallApp(bundleId: "us.zoom.xos", name: "Zoom", isBrowser: false))
    #expect(CallCatalog.app(forProcess: "com.google.Chrome.helper") == CallApp(bundleId: "com.google.Chrome", name: "Chrome", isBrowser: true))
    #expect(CallCatalog.app(forProcess: "com.apple.WebKit.GPU")?.name == "Safari")
    #expect(CallCatalog.app(forProcess: "net.whatsapp.WhatsApp")?.name == "WhatsApp")
    #expect(CallCatalog.app(forProcess: "com.spotify.client") == nil)
    #expect(CallCatalog.app(forProcess: "cz.zakaziq.voice") == nil)
  }

  @Test("služba podle názvu okna prohlížeče")
  func services() {
    #expect(CallCatalog.service(inTitle: "Meet – abc-defg-hij") == "Google Meet")
    #expect(CallCatalog.service(inTitle: "Meet: Konzultace k webu - Google Chrome") == "Google Meet")
    #expect(CallCatalog.service(inTitle: "Chat | Microsoft Teams") == "Microsoft Teams")
    #expect(CallCatalog.service(inTitle: "Zoom Meeting") == "Zoom")
    #expect(CallCatalog.service(inTitle: "Meeting notes – Notion") == nil)
    #expect(CallCatalog.service(inTitle: "ZakazIQ — Dnes") == nil)
  }

  @Test("popisek: služba, jinak název aplikace")
  func label() {
    let chrome = CallApp(bundleId: "com.google.Chrome", name: "Chrome", isBrowser: true)
    #expect(DetectedCall(app: chrome).label == "Chrome")
    #expect(DetectedCall(app: chrome, service: "Google Meet").label == "Google Meet")
  }
}

@Suite("Hovor: kdy nabídnout nahrání a kdy se zeptat na konec")
struct CallDetectorTests {
  let t0 = Date(timeIntervalSince1970: 1_800_000_000)
  let meet = DetectedCall(app: CallApp(bundleId: "com.google.Chrome", name: "Chrome", isBrowser: true), service: "Google Meet")
  let zoom = DetectedCall(app: CallApp(bundleId: "us.zoom.xos", name: "Zoom", isBrowser: false))

  /// Kola po 2 s od `from` do `to` (včetně), vždy se stejným seznamem hovorů.
  private func run(_ d: inout CallDetector, _ active: [DetectedCall], from: Double, to: Double, canOffer: Bool = true) -> [CallDetector.Event] {
    var events: [CallDetector.Event] = []
    var s = from
    while s <= to {
      events += d.update(active: active, now: t0.addingTimeInterval(s), canOffer: canOffer)
      s += 2
    }
    return events
  }

  @Test("nabídne po 3 s držení mikrofonu, jen jednou")
  func offersOnce() {
    var d = CallDetector()
    #expect(d.update(active: [meet], now: t0, canOffer: true) == [])
    #expect(d.update(active: [meet], now: t0.addingTimeInterval(2), canOffer: true) == [])
    #expect(d.update(active: [meet], now: t0.addingTimeInterval(4), canOffer: true) == [.offerStart(meet)])
    #expect(run(&d, [meet], from: 6, to: 120) == [])
  }

  @Test("krátké použití mikrofonu nic nenabídne")
  func shortUse() {
    var d = CallDetector()
    #expect(run(&d, [zoom], from: 0, to: 2) == [])
    #expect(run(&d, [], from: 4, to: 40) == [])
  }

  @Test("„Teď ne\" platí do konce hovoru, nový hovor se nabídne znovu")
  func dismissUntilEnd() {
    var d = CallDetector()
    #expect(run(&d, [zoom], from: 0, to: 4) == [.offerStart(zoom)])
    d.dismissOffer()
    #expect(run(&d, [zoom], from: 6, to: 60) == [])
    // Krátký výpadek je pořád tentýž hovor.
    #expect(run(&d, [], from: 62, to: 68) == [])
    #expect(run(&d, [zoom], from: 70, to: 90) == [])
    // Po konci hovoru (15 s bez mikrofonu) je další hovor nový.
    #expect(run(&d, [], from: 92, to: 110) == [])
    #expect(run(&d, [zoom], from: 112, to: 118) == [.offerStart(zoom)])
  }

  @Test("když aplikace mikrofon pustí, nabídka zmizí")
  func withdrawsWhenCallStops() {
    var d = CallDetector()
    #expect(run(&d, [meet], from: 0, to: 4) == [.offerStart(meet)])
    #expect(run(&d, [], from: 6, to: 8) == [])
    #expect(run(&d, [], from: 10, to: 12) == [.withdraw])
  }

  @Test("během diktátu se nenabízí, po něm ano; diktát nabídku schová")
  func waitsForDictation() {
    var d = CallDetector()
    #expect(run(&d, [zoom], from: 0, to: 10, canOffer: false) == [])
    #expect(d.update(active: [zoom], now: t0.addingTimeInterval(12), canOffer: true) == [.offerStart(zoom)])
    #expect(d.update(active: [zoom], now: t0.addingTimeInterval(14), canOffer: false) == [.withdraw])
    #expect(d.update(active: [zoom], now: t0.addingTimeInterval(16), canOffer: true) == [.offerStart(zoom)])
  }

  @Test("dva hovory: nabídne ten starší, druhý až po vyřízení prvního")
  func twoCalls() {
    var d = CallDetector()
    _ = d.update(active: [zoom], now: t0, canOffer: true)
    _ = d.update(active: [zoom, meet], now: t0.addingTimeInterval(2), canOffer: true)
    #expect(d.update(active: [zoom, meet], now: t0.addingTimeInterval(4), canOffer: true) == [.offerStart(zoom)])
    d.dismissOffer()
    #expect(d.update(active: [zoom, meet], now: t0.addingTimeInterval(6), canOffer: true) == [.offerStart(meet)])
  }

  @Test("název služby se doplní, až ho okno ukáže")
  func serviceArrivesLater() {
    var d = CallDetector()
    let plain = DetectedCall(app: meet.app)
    _ = d.update(active: [plain], now: t0, canOffer: true)
    #expect(d.update(active: [meet], now: t0.addingTimeInterval(4), canOffer: true) == [.offerStart(meet)])
  }

  @Test("nahrávání z nabídky: po konci hovoru se zeptá, jestli skončit")
  func endAfterRecording() {
    var d = CallDetector()
    #expect(run(&d, [meet], from: 0, to: 4) == [.offerStart(meet)])
    #expect(d.recordingStarted(call: meet, now: t0.addingTimeInterval(5)) == [.withdraw])
    #expect(run(&d, [meet], from: 6, to: 600, canOffer: false) == [])
    #expect(run(&d, [], from: 602, to: 614, canOffer: false) == [])
    #expect(d.update(active: [], now: t0.addingTimeInterval(618), canOffer: false) == [.offerEnd(meet)])
    #expect(run(&d, [], from: 620, to: 700, canOffer: false) == [])
    #expect(d.recordingStopped() == [.withdraw])
  }

  @Test("hovor se vrátí: otázka na konec zmizí a hlídá se znovu")
  func callResumes() {
    var d = CallDetector()
    _ = d.update(active: [zoom], now: t0, canOffer: false)
    _ = d.recordingStarted(call: zoom, now: t0)
    #expect(run(&d, [], from: 2, to: 14, canOffer: false) == [])
    #expect(d.update(active: [], now: t0.addingTimeInterval(16), canOffer: false) == [.offerEnd(zoom)])
    #expect(d.update(active: [zoom], now: t0.addingTimeInterval(18), canOffer: false) == [.withdraw])
    #expect(run(&d, [zoom], from: 20, to: 30, canOffer: false) == [])
    #expect(run(&d, [], from: 32, to: 48, canOffer: false) == [.offerEnd(zoom)])
  }

  @Test("„Nahrávat dál\": znovu se nezeptá, dokud hovor nezačne a neskončí")
  func keepRecording() {
    var d = CallDetector()
    _ = d.update(active: [zoom], now: t0, canOffer: false)
    _ = d.recordingStarted(call: zoom, now: t0)
    #expect(run(&d, [], from: 2, to: 16, canOffer: false) == [.offerEnd(zoom)])
    d.keepRecording()
    #expect(run(&d, [], from: 18, to: 200, canOffer: false) == [])
  }

  @Test("ruční nahrávání převezme hovor, který běží, nebo ten, který začne potom")
  func manualRecording() {
    var d = CallDetector()
    _ = run(&d, [zoom], from: 0, to: 2, canOffer: false)
    _ = d.recordingStarted(call: nil, now: t0.addingTimeInterval(3))
    #expect(run(&d, [], from: 4, to: 18, canOffer: false) == [.offerEnd(zoom)])

    var e = CallDetector()
    _ = e.recordingStarted(call: nil, now: t0)
    #expect(run(&e, [], from: 0, to: 30, canOffer: false) == [])
    #expect(run(&e, [meet], from: 32, to: 40, canOffer: false) == [])
    #expect(run(&e, [], from: 42, to: 56, canOffer: false) == [.offerEnd(meet)])
  }

  @Test("po konci nahrávání se další hovor zase nabídne")
  func afterRecording() {
    var d = CallDetector()
    _ = d.recordingStarted(call: zoom, now: t0)
    _ = run(&d, [zoom], from: 0, to: 20, canOffer: false)
    _ = d.recordingStopped()
    #expect(run(&d, [zoom], from: 22, to: 40) == [])
    #expect(run(&d, [], from: 42, to: 60) == [])
    #expect(run(&d, [meet], from: 62, to: 66) == [.offerStart(meet)])
  }
}
