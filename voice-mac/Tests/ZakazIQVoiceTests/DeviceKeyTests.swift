import Testing
@testable import ZakazIQVoiceCore

@Suite("Klíč zařízení")
struct DeviceKeyTests {
  // Vymyšlený klíč ve správném tvaru, žádný skutečný.
  static let sample = "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 31) + "9"

  @Test("platný klíč projde, mezery a konce řádků se oříznou")
  func valid() {
    #expect(DeviceKey.normalize(Self.sample) == Self.sample)
    #expect(DeviceKey.normalize("  \(Self.sample)\n") == Self.sample)
  }

  @Test("špatný tvar neprojde", arguments: [
    "",
    "zk_web_AbCdEf1234_" + String(repeating: "x", count: 32),
    "zk_voice_AbCdEf123_" + String(repeating: "x", count: 32),
    "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 31),
    "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 33),
    "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 31) + "ž",
    "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 31) + "-",
    "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 16) + " " + String(repeating: "x", count: 15),
    "zk_voice_AbCdEf1234_" + String(repeating: "x", count: 32) + "_x",
  ])
  func invalid(raw: String) {
    #expect(DeviceKey.normalize(raw) == nil)
  }

  @Test("zakrytý tvar neukáže tajemství")
  func masked() {
    let masked = DeviceKey.masked(Self.sample)
    #expect(masked == "zk_voice_AbCd…")
    #expect(!masked.contains("xxxx"))
  }

  @Test("úložiště v paměti: uložit, přečíst, smazat")
  func memoryStore() throws {
    let store = MemorySecretStore()
    #expect(try store.read() == nil)
    try store.save(Self.sample)
    #expect(try store.read() == Self.sample)
    try store.delete()
    #expect(try store.read() == nil)
  }
}
