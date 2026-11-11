import XCTest
@testable import LimitenKit

final class SelectionAndLinkTests: XCTestCase {
    func testSelection() throws {
        let response = try Fixture.response("full")
        XCTAssertEqual(WidgetSelection.mostUrgent(in: response)?.id, "claude|Sessie")
        XCTAssertEqual(WidgetSelection.top(3, in: response).map(\.id), ["claude|Sessie", "supabase|Database", "claude|Week"])
        XCTAssertEqual(WidgetSelection.top(10, in: response).count, 6)
        XCTAssertEqual(WidgetSelection.top(-1, in: response).count, 0)
        XCTAssertEqual(WidgetSelection.limit(id: "netlify|Credits", in: response)?.metric, "Credits")
    }

    func testFilterKeepsOrder() throws {
        let limits = try Fixture.response("full").limits
        XCTAssertEqual(WidgetSelection.filter(limits, levels: []).count, 6)
        XCTAssertEqual(WidgetSelection.filter(limits, levels: [.ok]).map(\.id),
                       ["claude|Week", "netlify|Credits", "supabase|Egress", "supabase|MAU"])
        XCTAssertEqual(WidgetSelection.filter(limits, levels: [.warn, .danger]).map(\.id),
                       ["claude|Sessie", "supabase|Database"])
        XCTAssertEqual(WidgetSelection.counts(limits), [.ok: 4, .warn: 1, .danger: 1])
    }

    func testDeepLinkRoundTrip() throws {
        for id in ["netlify|Credits", "claude|Sessie", "a/b c|ü?"] {
            let url = DeepLink.limit(id: id).url
            XCTAssertEqual(url.scheme, "limieten")
            XCTAssertEqual(DeepLink(url: url), .limit(id: id), url.absoluteString)
        }
        XCTAssertEqual(DeepLink.limit(id: "netlify|Credits").url.absoluteString, "limieten://limit/netlify%7CCredits")
    }

    func testDeepLinkRejects() {
        XCTAssertNil(DeepLink(url: URL(string: "https://limit/x")!))
        XCTAssertNil(DeepLink(url: URL(string: "limieten://other/x")!))
        XCTAssertNil(DeepLink(url: URL(string: "limieten://limit/")!))
    }
}
