import Foundation
import LimitenKit
import Observation

/// Result of "Verbinding testen" in Settings.
enum ConnectionTestResult: Equatable {
    case success(limitCount: Int)
    case failure(WidgetAPIError)
}

/// App state: settings, token, last response and the offline cache.
@MainActor
@Observable
final class AppModel {
    private let settings: SettingsStore
    private let tokenStore: TokenStore
    private let cache: ResponseCache
    private let client: WidgetAPIClient

    private(set) var response: WidgetResponse?
    /// When `response` was received from the server.
    private(set) var lastUpdated: Date?
    /// The last refresh error; the previous response stays visible.
    private(set) var lastError: WidgetAPIError?
    private(set) var isLoading = false
    private(set) var hasToken: Bool
    private(set) var dashboardURLText: String

    init(settings: SettingsStore, tokenStore: TokenStore, cache: ResponseCache, client: WidgetAPIClient) {
        self.settings = settings
        self.tokenStore = tokenStore
        self.cache = cache
        self.client = client
        hasToken = tokenStore.readToken() != nil
        dashboardURLText = settings.dashboardURLText
        if let snapshot = cache.load() {
            response = snapshot.response
            lastUpdated = snapshot.savedAt
        }
    }

    var dashboardURL: URL? {
        DashboardURL.normalize(dashboardURLText)
    }

    var isConfigured: Bool {
        dashboardURL != nil && hasToken
    }

    /// Fetches fresh data. On failure the last good response stays on screen.
    func refresh() async {
        guard let baseURL = dashboardURL, let token = tokenStore.readToken() else {
            lastError = dashboardURL == nil ? .invalidURL : .missingToken
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await client.fetch(baseURL: baseURL, token: token)
            apply(result)
        } catch is CancellationError {
            // Pull-to-refresh was cancelled; keep the current state.
        } catch {
            lastError = WidgetAPIError.from(error)
        }
    }

    /// Tests the given URL and token. On success both are saved and the data is shown.
    /// An empty `newToken` means: use the stored token.
    func testConnection(urlText: String, newToken: String) async -> ConnectionTestResult {
        guard let baseURL = DashboardURL.normalize(urlText) else {
            return .failure(.invalidURL)
        }
        let trimmed = newToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let token = trimmed.isEmpty ? tokenStore.readToken() : trimmed else {
            return .failure(.missingToken)
        }
        do {
            let result = try await client.fetch(baseURL: baseURL, token: token)
            settings.dashboardURLText = baseURL.absoluteString
            dashboardURLText = baseURL.absoluteString
            if !trimmed.isEmpty {
                try? tokenStore.saveToken(trimmed)
                hasToken = tokenStore.readToken() != nil
            }
            apply(result)
            return .success(limitCount: result.response.limits.count)
        } catch {
            return .failure(WidgetAPIError.from(error))
        }
    }

    /// Removes the token from the Keychain and forgets the cached data.
    func clearToken() {
        try? tokenStore.deleteToken()
        hasToken = tokenStore.readToken() != nil
        cache.clear()
        response = nil
        lastUpdated = nil
        lastError = nil
    }

    private func apply(_ result: FetchResult) {
        response = result.response
        lastUpdated = result.receivedAt
        lastError = nil
        try? cache.save(result)
    }
}

// MARK: - Factories

extension AppModel {
    /// The real app: UserDefaults, Keychain and a cache in Application Support.
    static func live() -> AppModel {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return AppModel(
            settings: SettingsStore(),
            tokenStore: KeychainTokenStore(),
            cache: ResponseCache(directory: support.appendingPathComponent("Limieten", isDirectory: true)),
            client: WidgetAPIClient()
        )
    }

    /// For previews: no network, no Keychain, sample data from the fixtures.
    static func preview(
        token: String? = "preview-token",
        statusCode: Int = 200,
        body: Data = Data(SampleData.fullJSON.utf8),
        loaded: Bool = true
    ) -> AppModel {
        let suite = "preview-\(UUID().uuidString)"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite, isDirectory: true)
        let cache = ResponseCache(directory: directory)
        if loaded {
            try? cache.save(Data(SampleData.fullJSON.utf8), savedAt: Date().addingTimeInterval(-180))
        }
        return AppModel(
            settings: SettingsStore(defaults: UserDefaults(suiteName: suite) ?? .standard),
            tokenStore: InMemoryTokenStore(token: token),
            cache: cache,
            client: WidgetAPIClient(transport: StaticTransport(statusCode: statusCode, body: body, delay: 0.5))
        )
    }
}
