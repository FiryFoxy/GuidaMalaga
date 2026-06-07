import AppKit

let emoji = "☀️"
let bg = NSColor(red: 52.0 / 255, green: 78.0 / 255, blue: 65.0 / 255, alpha: 1)
let outDir = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : FileManager.default.currentDirectoryPath + "/assets/icons"

for size in [192, 512, 180] {
    let dim = Int(size)
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: dim,
        pixelsHigh: dim,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fputs("bitmap alloc failed for size \(size)\n", stderr)
        exit(1)
    }

    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current = ctx

    let rect = NSRect(x: 0, y: 0, width: CGFloat(dim), height: CGFloat(dim))
    let radius = CGFloat(dim) * 96 / 512
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    bg.setFill()
    path.fill()

    let fontSize = CGFloat(dim) * 0.55
    let font = NSFont(name: "Apple Color Emoji", size: fontSize)
        ?? NSFont.systemFont(ofSize: fontSize)
    let attrs: [NSAttributedString.Key: Any] = [.font: font]
    let str = emoji as NSString
    let textSize = str.size(withAttributes: attrs)
    let point = NSPoint(
        x: (CGFloat(dim) - textSize.width) / 2,
        y: (CGFloat(dim) - textSize.height) / 2
    )
    str.draw(at: point, withAttributes: attrs)

    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        fputs("export failed for size \(size)\n", stderr)
        exit(1)
    }

    let name = size == 180 ? "apple-touch-icon.png" : "icon-\(size).png"
    let url = URL(fileURLWithPath: outDir).appendingPathComponent(name)
    try png.write(to: url)
    print("wrote \(name) (\(png.count) bytes)")
}
