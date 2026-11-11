import XCTest
@testable import LimitenKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class APIClientTests: XCTestCase {
    private let base = URL(string: "https://usage-dashboard-e00568.netlify.app")!

    private func fetch(_ answer: MockTransport.Answer, token: String = "secret-token") async throws -> (FetchResult, MockTransport) {
        let transport = MockTransport(answer)
        let client = WidgetAPIClient(transport: transport)
        return (try await client.fetch(baseURL: base, token: token), transport)
    }

    private func expectError(_ answer: MockTransport.Answer, token: String = "secret-token",
                             _ expected: WidgetAPIError, file: StaticString = #filePath, line: UInt = #line) async {
        do {
            _ = try await fetch(answer, token: token)
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? WidgetAPIError, expected, file: file, line: line)
        }
    }

    func testSuccess() async throws {
        let (result, transport) = try await fetch(.status(200, try Fixture.data("full")))
        XCTAssertEqual(result.response.limits.count, 6)
        XCTAssertEqual(result.data, try Fixture.data("full"))

        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.url?.absoluteString, "https://usage-dashboard-e00568.netlify.app/api/widget")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret-token")
        XCTAssertNil(request.url?.query, "Token must never be in the query string")
    }

    func testTokenIsTrimmed() async throws {
        let (_, transport) = try await fetch(.status(200, try Fixture.data("full")), token: "  abc \n")
        XCTAssertEqual(transport.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer abc")
    }

    func testMissingToken() async {
        await expectError(.status(200, Data()), token: "  ", .missingToken)
    }

    func testStatusMapping() async throws {
        await expectError(.status(401, try Fixture.data("error-401")), .unauthorized)
        await expectError(.status(404, Data("Not found".utf8)), .notFound)
        await expectError(.status(503, try Fixture.data("error-503")), .serverNotConfigured)
        await expectError(.status(500, Data()), .httpStatus(500))
    }

    func testInvalidBodyAndVersion() async throws {
        await expectError(.status(200, Data("<html></html>".utf8)), .invalidResponse)
        await expectError(.status(200, try Fixture.data("version-2")), .unsupportedVersion(2))
    }

    func testTransportErrors() async {
        await expectError(.failure(URLError(.timedOut)), .timeout)
        await expectError(.failure(URLError(.notConnectedToInternet)), .offline)
        await expectError(.failure(URLError(.cannotFindHost)), .hostNotFound)
        await expectError(.failure(URLError(.secureConnectionFailed)), .network("beveiligde verbinding mislukt."))
    }

    func testDutchMessages() {
        XCTAssertEqual(WidgetAPIError.unauthorized.message, "Token geweigerd (401). Controleer de widgettoken.")
        XCTAssertEqual(WidgetAPIError.offline.message, "Geen internetverbinding.")
        XCTAssertTrue(WidgetAPIError.serverNotConfigured.message.contains("503"))
        XCTAssertTrue(WidgetAPIError.unauthorized.needsSettingsChange)
        XCTAssertFalse(WidgetAPIError.timeout.needsSettingsChange)
    }
}
