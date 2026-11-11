import Foundation

/// Dutch (nl-NL) formatting helpers. All functions take `now` so they are testable.
public enum Format {
    public static let locale = Locale(identifier: "nl_NL")

    /// "1.234", "4,5". Grouping and decimal separator follow nl-NL.
    public static func number(_ value: Double, maxFractionDigits: Int = 1) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = true
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = maxFractionDigits
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    /// "zojuist", "3m geleden", "2u geleden", "4d geleden".
    public static func relative(_ date: Date, now: Date = Date()) -> String {
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 {
            return "zojuist"
        }
        let minutes = Int(seconds / 60)
        if minutes < 60 {
            return "\(minutes)m geleden"
        }
        let hours = minutes / 60
        if hours < 24 {
            return "\(hours)u geleden"
        }
        return "\(hours / 24)d geleden"
    }

    /// "Bijgewerkt 3m geleden" / "Bijgewerkt zojuist".
    public static func updated(_ date: Date, now: Date = Date()) -> String {
        "Bijgewerkt \(relative(date, now: now))"
    }

    /// Compact duration: "4d 15u", "15u 20m", "20m", "<1m".
    public static func duration(_ interval: TimeInterval) -> String {
        guard interval > 0 else { return "0m" }
        let totalMinutes = Int(interval / 60)
        if totalMinutes < 1 {
            return "<1m"
        }
        let days = totalMinutes / (24 * 60)
        let hours = (totalMinutes % (24 * 60)) / 60
        let minutes = totalMinutes % 60
        if days > 0 {
            return hours > 0 ? "\(days)d \(hours)u" : "\(days)d"
        }
        if hours > 0 {
            return minutes > 0 ? "\(hours)u \(minutes)m" : "\(hours)u"
        }
        return "\(minutes)m"
    }

    /// "Reset over 4d 15u", or "Reset nu" once the moment has passed.
    public static func resetCountdown(_ resetsAt: Date, now: Date = Date()) -> String {
        let remaining = resetsAt.timeIntervalSince(now)
        return remaining > 0 ? "Reset over \(duration(remaining))" : "Reset nu"
    }

    /// Absolute date and time in the given time zone, e.g. "di 9 dec., 09:00".
    public static func dateTime(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateFormat = "EEE d MMM, HH:mm"
        return formatter.string(from: date)
    }
}
