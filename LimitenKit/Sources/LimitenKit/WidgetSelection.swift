import Foundation

/// Selection logic shared by the app and the widgets. The server already sorts
/// `limits` most urgent first (same as the dashboard); this keeps that order.
public enum WidgetSelection {
    /// The most urgent limit, for systemSmall and the lock-screen widgets.
    public static func mostUrgent(in response: WidgetResponse) -> UsageLimit? {
        response.limits.first
    }

    /// The first `count` limits, for systemMedium.
    public static func top(_ count: Int, in response: WidgetResponse) -> [UsageLimit] {
        Array(response.limits.prefix(max(count, 0)))
    }

    /// A limit by id, for deep links.
    public static func limit(id: String, in response: WidgetResponse) -> UsageLimit? {
        response.limits.first { $0.id == id }
    }

    /// Filters on status, keeping order. An empty set means "all".
    public static func filter(_ limits: [UsageLimit], levels: Set<Level>) -> [UsageLimit] {
        levels.isEmpty ? limits : limits.filter { levels.contains($0.level) }
    }

    /// Counts per level, computed from the limits themselves.
    public static func counts(_ limits: [UsageLimit]) -> [Level: Int] {
        var result: [Level: Int] = [.ok: 0, .warn: 0, .danger: 0]
        for limit in limits {
            result[limit.level, default: 0] += 1
        }
        return result
    }
}
