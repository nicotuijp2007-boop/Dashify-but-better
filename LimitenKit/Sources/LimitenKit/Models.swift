import Foundation

// MARK: - Level

/// Status of a limit, based on the share that is still left.
/// OK: > 30% left, Let op: 10–30% left, Kritiek: < 10% left.
public enum Level: String, Sendable, CaseIterable, Comparable, Hashable {
    case ok
    case warn
    case danger

    /// Derives the level from the percentage left, using the contract thresholds.
    public init(leftPct: Double) {
        if leftPct < 10 {
            self = .danger
        } else if leftPct <= 30 {
            self = .warn
        } else {
            self = .ok
        }
    }

    /// Dutch label, always shown next to the icon (never color alone).
    public var label: String {
        switch self {
        case .ok: "OK"
        case .warn: "Let op"
        case .danger: "Kritiek"
        }
    }

    /// SF Symbol name for the status icon.
    public var symbolName: String {
        switch self {
        case .ok: "checkmark.circle.fill"
        case .warn: "exclamationmark.triangle.fill"
        case .danger: "xmark.octagon.fill"
        }
    }

    /// Status color from the contract, as a hex string (UI layers convert it).
    public var colorHex: String {
        switch self {
        case .ok: "#0ca30c"
        case .warn: "#fab219"
        case .danger: "#d03b3b"
        }
    }

    private var severity: Int {
        switch self {
        case .ok: 0
        case .warn: 1
        case .danger: 2
        }
    }

    public static func < (lhs: Level, rhs: Level) -> Bool {
        lhs.severity < rhs.severity
    }
}

// MARK: - Source

/// Where a value came from. Unknown values are kept as `.other`.
public enum Source: Sendable, Hashable {
    case api
    case local
    case manual
    case other(String)

    public init(rawValue: String) {
        switch rawValue {
        case "api": self = .api
        case "local": self = .local
        case "manual": self = .manual
        default: self = .other(rawValue)
        }
    }

    public var rawValue: String {
        switch self {
        case .api: "api"
        case .local: "local"
        case .manual: "manual"
        case let .other(value): value
        }
    }

    /// Dutch description for the detail screen.
    public var label: String {
        switch self {
        case .api: "Automatisch (API)"
        case .local: "Lokaal sync-script"
        case .manual: "Handmatig ingevoerd"
        case let .other(value): value
        }
    }
}

// MARK: - UsageLimit

/// One limit as delivered by `GET /api/widget` (contract v1).
public struct UsageLimit: Sendable, Hashable, Identifiable {
    /// Stable id: service + "|" + metric.
    public var id: String
    public var service: String
    public var serviceName: String
    public var metric: String
    /// Percentage left, 0...100. The main number to show.
    public var leftPct: Double
    public var usedPct: Double?
    public var used: Double?
    public var limit: Double?
    public var unit: String?
    /// Dutch text such as "150 credits over".
    public var leftText: String
    public var level: Level
    public var resetsAt: Date?
    /// Share of the period that has passed, 0...1.
    public var elapsed: Double?
    public var runsOutAt: Date?
    public var urgency: String?
    public var source: Source
    public var fetchedAt: Date?
    /// True when the source failed and this is the last known value.
    public var stale: Bool

    public init(
        id: String,
        service: String,
        serviceName: String,
        metric: String,
        leftPct: Double,
        usedPct: Double? = nil,
        used: Double? = nil,
        limit: Double? = nil,
        unit: String? = nil,
        leftText: String? = nil,
        level: Level? = nil,
        resetsAt: Date? = nil,
        elapsed: Double? = nil,
        runsOutAt: Date? = nil,
        urgency: String? = nil,
        source: Source = .api,
        fetchedAt: Date? = nil,
        stale: Bool = false
    ) {
        let clampedLeft = min(max(leftPct, 0), 100)
        self.id = id
        self.service = service
        self.serviceName = serviceName
        self.metric = metric
        self.leftPct = clampedLeft
        self.usedPct = usedPct
        self.used = used
        self.limit = limit
        self.unit = unit
        self.leftText = leftText ?? "\(Int(clampedLeft.rounded()))% over"
        self.level = level ?? Level(leftPct: clampedLeft)
        self.resetsAt = resetsAt
        self.elapsed = elapsed.map { min(max($0, 0), 1) }
        self.runsOutAt = runsOutAt
        self.urgency = urgency
        self.source = source
        self.fetchedAt = fetchedAt
        self.stale = stale
    }

    /// Percentage left as a whole number, 0...100.
    public var leftPercent: Int {
        Int(leftPct.rounded())
    }

    /// "Netlify (Free) Credits".
    public var displayName: String {
        "\(serviceName) \(metric)"
    }
}

extension UsageLimit: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, service, serviceName, metric, leftPct, usedPct, used, limit, unit, leftText
        case level, resetsAt, elapsed, runsOutAt, urgency, source, fetchedAt, stale
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let id = c.lenientString(.id), !id.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "Missing id")
        }

        // Fall back to the parts of the id ("service|metric") when names are missing.
        let idParts = id.split(separator: "|", maxSplits: 1).map(String.init)
        let service = c.lenientString(.service) ?? idParts.first ?? id
        let metric = c.lenientString(.metric) ?? (idParts.count > 1 ? idParts[1] : id)
        let serviceName = c.lenientString(.serviceName) ?? service

        let usedPct = c.lenientDouble(.usedPct)
        let used = c.lenientDouble(.used)
        let limit = c.lenientDouble(.limit)

        // The main number must exist; derive it the same way the server does if missing.
        let leftPct: Double
        if let value = c.lenientDouble(.leftPct) {
            leftPct = value
        } else if let usedPct {
            leftPct = max(0, 100 - usedPct.rounded())
        } else if let used, let limit, limit > 0 {
            leftPct = max(0, 100 - (used / limit * 100).rounded())
        } else {
            throw DecodingError.dataCorruptedError(forKey: .leftPct, in: c, debugDescription: "No percentage left")
        }

        self.init(
            id: id,
            service: service,
            serviceName: serviceName,
            metric: metric,
            leftPct: leftPct,
            usedPct: usedPct,
            used: used,
            limit: limit,
            unit: c.lenientString(.unit),
            leftText: c.lenientString(.leftText),
            level: c.lenientString(.level).flatMap(Level.init(rawValue:)),
            resetsAt: c.lenientDate(.resetsAt),
            elapsed: c.lenientDouble(.elapsed),
            runsOutAt: c.lenientDate(.runsOutAt),
            urgency: c.lenientString(.urgency).flatMap { $0.isEmpty ? nil : $0 },
            source: c.lenientString(.source).map(Source.init(rawValue:)) ?? .api,
            fetchedAt: c.lenientDate(.fetchedAt),
            stale: c.lenientBool(.stale) ?? false
        )
    }
}

// MARK: - Summary

public struct Summary: Sendable, Hashable {
    public var ok: Int
    public var warn: Int
    public var danger: Int
    /// Same sentence as the dashboard's status bar, Dutch.
    public var headline: String

    public init(ok: Int, warn: Int, danger: Int, headline: String) {
        self.ok = ok
        self.warn = warn
        self.danger = danger
        self.headline = headline
    }

    public func count(for level: Level) -> Int {
        switch level {
        case .ok: ok
        case .warn: warn
        case .danger: danger
        }
    }

    /// Fallback when the server sends no (complete) summary.
    public static func computed(from limits: [UsageLimit]) -> Summary {
        let ok = limits.filter { $0.level == .ok }.count
        let warn = limits.filter { $0.level == .warn }.count
        let danger = limits.filter { $0.level == .danger }.count
        guard let tightest = limits.first else {
            return Summary(ok: 0, warn: 0, danger: 0, headline: "Geen limieten")
        }
        var parts: [String] = []
        if danger > 0 { parts.append("\(danger) kritiek") }
        if warn > 0 { parts.append("\(warn) let op") }
        let lead = parts.isEmpty ? "Alles binnen marge" : parts.joined(separator: ", ")
        return Summary(
            ok: ok, warn: warn, danger: danger,
            headline: "\(lead) · krapst: \(tightest.displayName), \(tightest.leftText)"
        )
    }
}

// MARK: - Problem

/// A source that failed this time.
public struct Problem: Sendable, Hashable, Decodable {
    public var service: String
    public var name: String
    public var hasValues: Bool
    public var message: String

    public init(service: String, name: String, hasValues: Bool, message: String) {
        self.service = service
        self.name = name
        self.hasValues = hasValues
        self.message = message
    }

    private enum CodingKeys: String, CodingKey {
        case service, name, hasValues, message
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let service = c.lenientString(.service) ?? ""
        self.init(
            service: service,
            name: c.lenientString(.name) ?? service,
            hasValues: c.lenientBool(.hasValues) ?? false,
            message: c.lenientString(.message) ?? ""
        )
    }
}

// MARK: - WidgetResponse

/// The full `GET /api/widget` response (contract v1).
public struct WidgetResponse: Sendable, Hashable {
    public var version: Int
    public var generatedAt: Date?
    public var dashboardUrl: URL?
    public var summary: Summary
    /// Sorted most urgent first by the server. Keep this order.
    public var limits: [UsageLimit]
    public var problems: [Problem]

    public init(
        version: Int = 1,
        generatedAt: Date? = nil,
        dashboardUrl: URL? = nil,
        summary: Summary? = nil,
        limits: [UsageLimit],
        problems: [Problem] = []
    ) {
        self.version = version
        self.generatedAt = generatedAt
        self.dashboardUrl = dashboardUrl
        self.summary = summary ?? .computed(from: limits)
        self.limits = limits
        self.problems = problems
    }

    /// Decodes a response body. Throws `WidgetAPIError.invalidResponse` for anything
    /// that is not a v1-shaped JSON object.
    public static func decode(from data: Data) throws -> WidgetResponse {
        do {
            return try JSONDecoder().decode(WidgetResponse.self, from: data)
        } catch {
            throw WidgetAPIError.invalidResponse
        }
    }
}

extension WidgetResponse: Decodable {
    private enum CodingKeys: String, CodingKey {
        case version, generatedAt, dashboardUrl, summary, limits, problems
    }

    private enum SummaryKeys: String, CodingKey {
        case ok, warn, danger, headline
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .version)

        // Skip malformed entries instead of failing the whole response.
        let limits = ((try? c.decodeIfPresent([Failable<UsageLimit>].self, forKey: .limits)) ?? nil)?
            .compactMap(\.value) ?? []
        let problems = ((try? c.decodeIfPresent([Failable<Problem>].self, forKey: .problems)) ?? nil)?
            .compactMap(\.value) ?? []

        // Merge the server summary with a computed one for any missing parts.
        let computed = Summary.computed(from: limits)
        var summary = computed
        if let s = try? c.nestedContainer(keyedBy: SummaryKeys.self, forKey: .summary) {
            summary = Summary(
                ok: s.lenientInt(.ok) ?? computed.ok,
                warn: s.lenientInt(.warn) ?? computed.warn,
                danger: s.lenientInt(.danger) ?? computed.danger,
                headline: s.lenientString(.headline) ?? computed.headline
            )
        }

        self.init(
            version: version,
            generatedAt: c.lenientDate(.generatedAt),
            dashboardUrl: c.lenientString(.dashboardUrl).flatMap(URL.init(string:)),
            summary: summary,
            limits: limits,
            problems: problems
        )
    }
}

// MARK: - Lenient decoding helpers

/// Decodes a value or nil, without failing the surrounding array.
struct Failable<T: Decodable>: Decodable {
    let value: T?

    init(from decoder: Decoder) throws {
        value = try? T(from: decoder)
    }
}

extension KeyedDecodingContainer {
    func lenientString(_ key: Key) -> String? {
        (try? decodeIfPresent(String.self, forKey: key)) ?? nil
    }

    func lenientDouble(_ key: Key) -> Double? {
        if let value = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil {
            return value.isFinite ? value : nil
        }
        return lenientString(key).flatMap(Double.init)
    }

    func lenientInt(_ key: Key) -> Int? {
        if let value = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil {
            return value
        }
        return lenientDouble(key).map { Int($0.rounded()) }
    }

    func lenientBool(_ key: Key) -> Bool? {
        (try? decodeIfPresent(Bool.self, forKey: key)) ?? nil
    }

    func lenientDate(_ key: Key) -> Date? {
        lenientString(key).flatMap(ISO8601.parse)
    }
}

/// ISO 8601 parsing with and without fractional seconds.
public enum ISO8601 {
    public static func parse(_ string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: string) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: string)
    }
}
