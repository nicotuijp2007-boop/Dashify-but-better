import XCTest
@testable import LimitenKit

final class DashboardURLTests: XCTestCase {
    func testNormalize() {
        let expected = "https://usage-dashboard-e00568.netlify.app"
        for input in [
            "usage-dashboard-e00568.netlify.app",
            "https://usage-dashboard-e00568.netlify.app",
            " https://usage-dashboard-e00568.netlify.app/ ",
            "https://usage-dashboard-e00568.netlify.app/api/widget",
            "https://Usage-Dashboard-e00568.netlify.app/?x=1#y",
        ] {
            XCTAssertEqual(DashboardURL.normalize(input)?.absoluteString, expected, input)
        }
    }

    func testKeepsSubpath() {
        XCTAssertEqual(DashboardURL.normalize("https://example.com/usage/")?.absoluteString, "https://example.com/usage")
        XCTAssertEqual(
            DashboardURL.endpoint(for: URL(string: "https://example.com/usage")!).absoluteString,
            "https://example.com/usage/api/widget"
        )
    }

    func testRejects() {
        XCTAssertNil(DashboardURL.normalize(""))
        XCTAssertNil(DashboardURL.normalize("http://example.com"), "Token must not travel over http")
        XCTAssertNil(DashboardURL.normalize("ftp://example.com"))
        XCTAssertNil(DashboardURL.normalize("https://"))
    }

    func testEndpoint() {
        let base = URL(string: "https://usage-dashboard-e00568.netlify.app")!
        XCTAssertEqual(DashboardURL.endpoint(for: base).absoluteString, "https://usage-dashboard-e00568.netlify.app/api/widget")
    }
}
