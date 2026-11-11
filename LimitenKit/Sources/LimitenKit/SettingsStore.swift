import Foundation

/// Non-secret settings (the dashboard URL). The token never goes here.
public struct SettingsStore: @unchecked Sendable {
    public static let defaultDashboardURL = "https://usage-dashboard-e00568.netlify.app"
    private static let dashboardURLKey = "dashboardURL"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The raw text as entered by the user.
    public var dashboardURLText: String {
        get { defaults.string(forKey: Self.dashboardURLKey) ?? Self.defaultDashboardURL }
        nonmutating set { defaults.set(newValue, forKey: Self.dashboardURLKey) }
    }

    /// The normalized base URL, or nil when the text is invalid.
    public var dashboardURL: URL? {
        DashboardURL.normalize(dashboardURLText)
    }
}

/// Storage for the widget token.
public protocol TokenStore: Sendable {
    func readToken() -> String?
    func saveToken(_ token: String) throws
    func deleteToken() throws
}

/// In-memory token store for previews and tests.
public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private var token: String?
    private let lock = NSLock()

    public init(token: String? = nil) {
        self.token = token
    }

    public func readToken() -> String? {
        lock.lock(); defer { lock.unlock() }
        return token
    }

    public func saveToken(_ token: String) throws {
        lock.lock(); defer { lock.unlock() }
        self.token = token
    }

    public func deleteToken() throws {
        lock.lock(); defer { lock.unlock() }
        token = nil
    }
}
