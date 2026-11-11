import Foundation
import XCTest
@testable import LimitenKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

enum Fixture {
    static func data(_ name: String) throws -> Data {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"),
            "Missing fixture \(name).json"
        )
        return try Data(contentsOf: url)
    }

    static func response(_ name: String) throws -> WidgetResponse {
        try WidgetResponse.decode(from: data(name))
    }
}

func date(_ iso: String) -> Date {
    ISO8601.parse(iso)!
}

/// Transport that returns a canned answer and records the request.
final class MockTransport: HTTPTransport, @unchecked Sendable {
    enum Answer {
        case status(Int, Data)
        case failure(Error)
    }

    let answer: Answer
    private(set) var lastRequest: URLRequest?

    init(_ answer: Answer) {
        self.answer = answer
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        lastRequest = request
        switch answer {
        case let .status(code, body):
            let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1", headerFields: nil)!
            return (body, response)
        case let .failure(error):
            throw error
        }
    }
}
