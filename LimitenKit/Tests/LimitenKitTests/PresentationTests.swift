import XCTest
@testable import LimitenKit

final class PresentationTests: XCTestCase {
    let now = SampleData.now

    func testBarMarkerAndPace() throws {
        let limits = try Fixture.response("full").limits
        let session = limits[0]       // 8% left, 40% of the period left
        XCTAssertEqual(session.bar.fill, 0.08, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(session.bar.marker), 0.4, accuracy: 1e-9)
        XCTAssertTrue(session.bar.behindPace)

        let credits = limits[3]       // 50% left, 93% of the period left
        XCTAssertTrue(credits.bar.behindPace)

        let week = limits[2]          // 45% left, 36% of the period left
        XCTAssertFalse(week.bar.behindPace)

        let database = limits[1]      // no elapsed: no marker
        XCTAssertNil(database.bar.marker)
        XCTAssertFalse(database.bar.behindPace)
    }

    func testBarClamps() {
        XCTAssertEqual(BarGeometry(leftPct: 140, elapsed: -1).fill, 1)
        XCTAssertEqual(BarGeometry(leftPct: 140, elapsed: -1).marker, 1)
        XCTAssertEqual(BarGeometry(leftPct: -5, elapsed: 2).fill, 0)
        XCTAssertEqual(BarGeometry(leftPct: -5, elapsed: 2).marker, 0)
    }

    func testRowStyle() throws {
        let limits = try Fixture.response("full").limits
        XCTAssertEqual(limits.map(\.usesFullRow), [true, true, true, true, true, false])
    }

    func testTexts() throws {
        let limits = try Fixture.response("full").limits
        XCTAssertEqual(limits[0].subtitle(now: now), "Op over ~21m, vóór de reset")
        XCTAssertEqual(limits[2].subtitle(now: now), "Reset over 1d 18u")
        XCTAssertNil(limits[1].subtitle(now: now))
        XCTAssertEqual(limits[1].usedText, "Gebruikt: 390 van 500 MB")
        XCTAssertEqual(limits[4].usedText, "Gebruikt: 0,5 van 5 GB")
        XCTAssertEqual(limits[0].leftPercentText, "8%")
    }

    func testAccessibilityLabel() throws {
        let database = try Fixture.response("full").limits[1]
        XCTAssertEqual(
            database.accessibilityLabel(now: now),
            "Supabase (Free) Database, 22 procent over, 110 MB over, status Let op, verouderd"
        )
    }
}
