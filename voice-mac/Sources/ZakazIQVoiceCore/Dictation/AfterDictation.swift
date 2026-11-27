import Foundation

/// Co se stane s hotovým přepisem (volba v Nastavení › Diktování).
public enum AfterDictation: String, CaseIterable, Identifiable, Sendable {
  /// Přepis se ukáže v kartě nad lištou a zkopíruje se jedním tlačítkem. Nic se nevkládá.
  case showText = "show_text"
  /// Text se vloží tam, kde je kurzor (⌘V), jako dřív.
  case paste

  public var id: String { rawValue }

  public var title: String {
    switch self {
    case .showText: return "Ukázat přepis"
    case .paste: return "Vložit text"
    }
  }

  public var detail: String {
    switch self {
    case .showText: return "Přepis se ukáže nad lištou a zkopírujete ho jedním tlačítkem. Do aplikace se sám nevloží."
    case .paste: return "Text se vloží tam, kde je kurzor."
    }
  }
}
