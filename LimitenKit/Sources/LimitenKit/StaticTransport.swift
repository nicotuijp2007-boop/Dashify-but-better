import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Transport that always returns the same answer. For SwiftUI previews and demos,
/// so previews never touch the network.
public struct StaticTransport: HTTPTransport {
    public let statusCode: Int
    public let body: Data
    public let delay: TimeInterval

    public init(statusCode: Int = 200, body: Data = Data(SampleData.fullJSON.utf8), delay: TimeInterval = 0) {
        self.statusCode = statusCode
        self.body = body
        self.delay = delay
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        if delay > 0 {
            try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }
        let url = request.url ?? URL(string: "https://example.invalid")!
        let response = HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (body, response)
    }
}
