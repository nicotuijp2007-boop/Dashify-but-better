import Foundation

/// The last good response, with the moment it was received.
public struct CachedSnapshot: Sendable {
    public let response: WidgetResponse
    public let data: Data
    public let savedAt: Date
}

/// File-based cache of the last good raw response body. Stores the raw JSON so a
/// newer app version can re-decode it with its own models.
public struct ResponseCache: Sendable {
    public let fileURL: URL

    private struct Envelope: Codable {
        var formatVersion: Int
        var savedAt: Date
        var body: Data
    }

    public init(directory: URL, fileName: String = "widget-response-cache.json") {
        fileURL = directory.appendingPathComponent(fileName)
    }

    public func save(_ data: Data, savedAt: Date = Date()) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        let envelope = Envelope(formatVersion: 1, savedAt: savedAt, body: data)
        try encoder.encode(envelope).write(to: fileURL, options: [.atomic])
    }

    public func save(_ result: FetchResult) throws {
        try save(result.data, savedAt: result.receivedAt)
    }

    /// Returns nil when there is no cache or it can no longer be read.
    public func load() -> CachedSnapshot? {
        guard let raw = try? Data(contentsOf: fileURL) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        guard let envelope = try? decoder.decode(Envelope.self, from: raw),
              let response = try? WidgetResponse.decode(from: envelope.body)
        else {
            return nil
        }
        return CachedSnapshot(response: response, data: envelope.body, savedAt: envelope.savedAt)
    }

    public func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
