import Foundation
import Vision
import AppKit

func output(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let text = String(data: data, encoding: .utf8) { print(text) }
}
do {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let languages = try request.supportedRecognitionLanguages()
    let korean = languages.contains("ko-KR")
    if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--capabilities" {
        output(["available": korean, "detail": "Apple Vision local ko-KR OCR", "languages": languages])
    } else {
        guard CommandLine.arguments.count == 2, korean else { throw NSError(domain: "OCR", code: 1) }
        request.recognitionLanguages = ["ko-KR", "en-US"]
        request.usesLanguageCorrection = true
        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? Int,
              let height = props[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 20000, height <= 20000, width * height <= 40000000
        else { throw NSError(domain: "OCR image size", code: 2) }
        let handler = VNImageRequestHandler(url: url, options: [:])
        try handler.perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        output(["text": lines.joined(separator: "\n"), "lineCount": lines.count])
    }
} catch {
    output(["error": "Vision OCR could not process this image"])
    exit(1)
}
