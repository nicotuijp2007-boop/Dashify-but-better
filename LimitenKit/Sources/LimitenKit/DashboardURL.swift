import Foundation

/// Normalizes what the user types as dashboard URL.
public enum DashboardURL {
    /// Accepts "host", "https://host", "https://host/" and "https://host/api/widget".
    /// Returns the base URL (no trailing slash, no query) or nil. Only https is allowed,
    /// because the token is sent along.
    public static func normalize(_ input: String) -> URL? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard var components = URLComponents(string: text),
              components.scheme?.lowercased() == "https",
              let host = components.host, !host.isEmpty, !host.contains(" ")
        else {
            return nil
        }
        components.scheme = "https"
        components.host = host.lowercased()
        var path = components.path
        while path.hasSuffix("/") {
            path.removeLast()
        }
        if path.hasSuffix("/api/widget") {
            path.removeLast("/api/widget".count)
        }
        components.path = path
        components.query = nil
        components.fragment = nil
        components.user = nil
        components.password = nil
        return components.url
    }

    /// `{base}/api/widget`.
    public static func endpoint(for baseURL: URL) -> URL {
        baseURL.appendingPathComponent("api").appendingPathComponent("widget")
    }
}
