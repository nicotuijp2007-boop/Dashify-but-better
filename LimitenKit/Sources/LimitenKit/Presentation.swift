import Foundation

/// Geometry for a "left" bar: it fills with what is left, with an optional marker at
/// the time left in the period (`1 - elapsed`). A bar shorter than the marker means
/// "runs out before the reset".
public struct BarGeometry: Sendable, Hashable {
    /// 0...1, share left.
    public let fill: Double
    /// 0...1, share of the period left, or nil when `elapsed` is unknown.
    public let marker: Double?

    public init(leftPct: Double, elapsed: Double?) {
        fill = min(max(leftPct / 100, 0), 1)
        marker = elapsed.map { min(max(1 - $0, 0), 1) }
    }

    /// True when less is left than time in the period.
    public var behindPace: Bool {
        guard let marker else { return false }
        return fill < marker
    }
}

extension UsageLimit {
    public var bar: BarGeometry {
        BarGeometry(leftPct: leftPct, elapsed: elapsed)
    }

    /// "8%": the big number. Always what is left.
    public var leftPercentText: String {
        "\(leftPercent)%"
    }

    /// Dashboard rule: full row for limits with a reset or that are not OK.
    public var usesFullRow: Bool {
        resetsAt != nil || level != .ok
    }

    /// "Reset over 4d 15u", or nil without a reset.
    public func resetText(now: Date = Date()) -> String? {
        resetsAt.map { Format.resetCountdown($0, now: now) }
    }

    /// Urgency when there is one, else the reset countdown, else nil.
    public func subtitle(now: Date = Date()) -> String? {
        urgency ?? resetText(now: now)
    }

    /// "Gebruikt: 390 van 500 MB", or nil when the numbers are missing.
    public var usedText: String? {
        guard let used, let limit else { return nil }
        let unitPart = unit.map { " \($0)" } ?? ""
        return "Gebruikt: \(Format.number(used)) van \(Format.number(limit))\(unitPart)"
    }

    /// Full VoiceOver sentence.
    public func accessibilityLabel(now: Date = Date()) -> String {
        var parts = [
            displayName,
            "\(leftPercent) procent over",
            leftText,
            "status \(level.label)",
        ]
        if let urgency { parts.append(urgency) }
        if let reset = resetText(now: now) { parts.append(reset) }
        if stale { parts.append("verouderd") }
        return parts.joined(separator: ", ")
    }
}
