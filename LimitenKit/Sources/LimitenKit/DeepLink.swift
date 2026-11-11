import Foundation

/// `limieten://limit/<id>` links from the widgets into the app.
public enum DeepLink: Equatable, Sendable {
    case limit(id: String)

    public static let scheme = "limieten"

    /// Characters that may stay unescaped in the id path segment ("|" and "/" are escaped).
    private static let allowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-._~")
        return set
    }()

    public var url: URL {
        switch self {
        case let .limit(id):
            let encoded = id.addingPercentEncoding(withAllowedCharacters: Self.allowed) ?? id
            return URL(string: "\(Self.scheme)://limit/\(encoded)")!
        }
    }

    public init?(url: URL) {
        guard url.scheme?.lowercased() == Self.scheme,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.host?.lowercased() == "limit"
        else {
            return nil
        }
        var path = components.percentEncodedPath
        if path.hasPrefix("/") {
            path.removeFirst()
        }
        guard !path.isEmpty, let id = path.removingPercentEncoding, !id.isEmpty else {
            return nil
        }
        self = .limit(id: id)
    }
}
