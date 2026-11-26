// swift-tools-version:6.0
// ZakazIQ Voice — aplikace na Macu (R-150, docs/admin/VOICE-PLAN.md).
// Bez cizích balíčků: jen Apple frameworky. Jazykový režim Swift 5 (plán, D-V5).
import PackageDescription

let package = Package(
  name: "ZakazIQVoice",
  platforms: [.macOS(.v14)],
  targets: [
    // Logika bez rozhraní (adresa serveru, klíč, Klíčenka, klient, hlášky) — tu pokrývají testy.
    .target(name: "ZakazIQVoiceCore"),
    // Aplikace v liště menu: AppKit + SwiftUI.
    .executableTarget(name: "ZakazIQVoice", dependencies: ["ZakazIQVoiceCore"]),
    .testTarget(
      name: "ZakazIQVoiceTests",
      dependencies: ["ZakazIQVoiceCore"],
      resources: [.copy("Fixtures")]
    ),
  ],
  swiftLanguageModes: [.v5]
)
