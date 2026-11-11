import LimitenKit
import SwiftUI

extension Color {
    /// Creates a color from "#rrggbb".
    init(hex: String) {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt64(digits, radix: 16) ?? 0
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

extension Level {
    /// Status color for icons (never for text).
    var color: Color {
        Color(hex: colorHex)
    }
}

/// Icon in the status color plus the Dutch word in the normal text color.
struct StatusLabel: View {
    let level: Level

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: level.symbolName)
                .foregroundStyle(level.color)
            Text(level.label)
                .foregroundStyle(.primary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Status \(level.label)")
    }
}
