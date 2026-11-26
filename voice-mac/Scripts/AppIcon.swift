// Vykreslí sadu ikon aplikace (AppIcon.iconset) ze stejné geometrie jako public/ikony/ikona.svg.
// Logo sedí v mřížce ikon macOS: 824 × 824 z plátna 1024, s jemným stínem.
// Spouští `make icon`: swift Scripts/AppIcon.swift <výstupní složka .iconset>
import AppKit

let args = CommandLine.arguments
guard args.count == 2 else {
  FileHandle.standardError.write(Data("Použití: swift Scripts/AppIcon.swift <složka.iconset>\n".utf8))
  exit(2)
}
let out = URL(fileURLWithPath: args[1], isDirectory: true)
try? FileManager.default.removeItem(at: out)
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func color(_ hex: UInt32) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

func render(pixels: Int) -> Data {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
  )!
  rep.size = NSSize(width: pixels, height: pixels)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let canvas = CGFloat(pixels)
  let side = canvas * 824 / 1024
  let origin = (canvas - side) / 2
  let unit = side / 64
  let body = NSRect(x: origin, y: origin + canvas * 10 / 1024, width: side, height: side)

  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
  shadow.shadowBlurRadius = canvas * 12 / 1024
  shadow.shadowOffset = NSSize(width: 0, height: -canvas * 6 / 1024)
  NSGraphicsContext.saveGraphicsState()
  shadow.set()
  let shape = NSBezierPath(roundedRect: body, xRadius: 17.92 * unit, yRadius: 17.92 * unit)
  color(0x1B3868).setFill()
  shape.fill()
  NSGraphicsContext.restoreGraphicsState()

  NSGradient(starting: color(0x2B57A8), ending: color(0x1B3868))!.draw(in: shape, angle: -45)

  NSColor.white.setFill()
  for (x, y) in [(10.0, 10.0), (36.0, 10.0), (10.0, 36.0), (36.0, 36.0)] {
    // SVG má počátek vlevo nahoře, AppKit vlevo dole.
    let tile = NSRect(x: body.minX + x * unit, y: body.maxY - (y + 18) * unit, width: 18 * unit, height: 18 * unit)
    NSBezierPath(roundedRect: tile, xRadius: 5.04 * unit, yRadius: 5.04 * unit).fill()
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

for points in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let name = scale == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
    try render(pixels: points * scale).write(to: out.appendingPathComponent(name))
  }
}
print("Ikony: \(out.path)")
