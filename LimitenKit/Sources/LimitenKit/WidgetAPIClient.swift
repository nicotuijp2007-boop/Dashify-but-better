import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// MARK: - Errors

/// Everything that can go wrong when talking to `/api/widget`, with Dutch messages.
public enum WidgetAPIError: Error, Equatable, Sendable {
    case invalidURL
    case missingToken
    case unauthorized
    case notFound
    case serverNotConfigured
    case httpStatus(Int)
    case timeout
    case offline
    case hostNotFound
    case network(String)
    case invalidResponse
    case unsupportedVersion(Int)

    /// Short Dutch message for the user.
    public var message: String {
        switch self {
        case .invalidURL:
            "Ongeldige dashboard-URL. Gebruik een https-adres, bijvoorbeeld https://mijn-dashboard.netlify.app."
        case .missingToken:
            "Vul eerst de widgettoken in."
        case .unauthorized:
            "Token geweigerd (401). Controleer de widgettoken."
        case .notFound:
            "/api/widget niet gevonden (404). Staat de nieuwste versie van het dashboard live?"
        case .serverNotConfigured:
            "Het dashboard is nog niet ingesteld (503): WIDGET_TOKEN ontbreekt op de server."
        case let .httpStatus(code):
            "Onverwachte fout van de server (HTTP \(code))."
        case .timeout:
            "Het dashboard reageerde niet op tijd."
        case .offline:
            "Geen internetverbinding."
        case .hostNotFound:
            "Server niet gevonden. Controleer de dashboard-URL."
        case let .network(detail):
            "Netwerkfout: \(detail)"
        case .invalidResponse:
            "Onverwacht antwoord van het dashboard. Klopt de URL?"
        case let .unsupportedVersion(version):
            "Het dashboard gebruikt API-versie \(version); deze app kent versie \(WidgetAPIClient.supportedVersion). Werk de app bij."
        }
    }

    /// True for problems the user can only fix in Settings.
    public var needsSettingsChange: Bool {
        switch self {
        case .invalidURL, .missingToken, .unauthorized, .notFound, .hostNotFound:
            true
        default:
            false
        }
    }

    /// Maps a transport error to a contract error.
    public static func from(_ error: Error) -> WidgetAPIError {
        if let apiError = error as? WidgetAPIError {
            return apiError
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut:
                return .timeout
            case .notConnectedToInternet, .networkConnectionLost:
                return .offline
            case .cannotFindHost, .dnsLookupFailed:
                return .hostNotFound
            case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
                 .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot:
                return .network("beveiligde verbinding mislukt.")
            case .cannotConnectToHost:
                return .network("kan geen verbinding maken met de server.")
            default:
                return .network("code \(urlError.code.rawValue).")
            }
        }
        return .network(error.localizedDescription)
    }
}

extension WidgetAPIError: LocalizedError {
    public var errorDescription: String? { message }
}

// MARK: - Transport

/// Minimal HTTP abstraction so the client can be tested without a network.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// `URLSession`-based transport with an ephemeral session (no cookies, no URL cache).
public struct URLSessionTransport: HTTPTransport, @unchecked Sendable {
    private let session: URLSession

    public init(timeout: TimeInterval = 15) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout * 2
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        session = URLSession(configuration: configuration)
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            let task = session.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let http = response as? HTTPURLResponse {
                    continuation.resume(returning: (data ?? Data(), http))
                } else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                }
            }
            task.resume()
        }
    }
}

// MARK: - Client

/// A successful fetch: the decoded response plus the raw body (for the cache).
public struct FetchResult: Sendable {
    public let response: WidgetResponse
    public let data: Data
    public let receivedAt: Date
}

/// Read-only client for `GET {dashboardUrl}/api/widget`.
public struct WidgetAPIClient: Sendable {
    public static let supportedVersion = 1

    public var transport: HTTPTransport
    public var timeout: TimeInterval

    public init(transport: HTTPTransport? = nil, timeout: TimeInterval = 15) {
        self.transport = transport ?? URLSessionTransport(timeout: timeout)
        self.timeout = timeout
    }

    /// Builds the request. The token only ever goes in the Authorization header.
    public func makeRequest(baseURL: URL, token: String) -> URLRequest {
        var request = URLRequest(url: DashboardURL.endpoint(for: baseURL))
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    /// Fetches and decodes the widget data. Throws `WidgetAPIError` (or `CancellationError`).
    public func fetch(baseURL: URL, token: String, now: Date = Date()) async throws -> FetchResult {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw WidgetAPIError.missingToken }

        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.send(makeRequest(baseURL: baseURL, token: trimmed))
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw WidgetAPIError.from(error)
        }

        switch response.statusCode {
        case 200:
            let decoded = try WidgetResponse.decode(from: data)
            guard decoded.version == Self.supportedVersion else {
                throw WidgetAPIError.unsupportedVersion(decoded.version)
            }
            return FetchResult(response: decoded, data: data, receivedAt: now)
        case 401, 403:
            throw WidgetAPIError.unauthorized
        case 404:
            throw WidgetAPIError.notFound
        case 503:
            throw WidgetAPIError.serverNotConfigured
        default:
            throw WidgetAPIError.httpStatus(response.statusCode)
        }
    }
}
