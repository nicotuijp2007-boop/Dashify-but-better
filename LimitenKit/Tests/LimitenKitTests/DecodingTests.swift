import XCTest
@testable import LimitenKit

final class DecodingTests: XCTestCase {
    func testFullFixtureDecodesEverything() throws {
        let response = try Fixture.response("full")
        XCTAssertEqual(response.version, 1)
        XCTAssertEqual(response.generatedAt, date("2026-11-11T13:09:00Z"))
        XCTAssertEqual(response.dashboardUrl?.absoluteString, "https://usage-dashboard-e00568.netlify.app")
        XCTAssertEqual(response.summary, Summary(ok: 4, warn: 1, danger: 1,
            headline: "1 kritiek, 1 let op · krapst: Claude (Pro) Sessie, 8% over"))
        XCTAssertEqual(response.limits.count, 6)
        XCTAssertEqual(response.problems, [Problem(service: "supabase", name: "Supabase (Free)", hasValues: true,
            message: "Supabase API gaf een fout (500); laatst bekende waarden getoond.")])
    }

    func testServerOrderIsKept() throws {
        let response = try Fixture.response("full")
        XCTAssertEqual(response.limits.map(\.id), [
            "claude|Sessie", "supabase|Database", "claude|Week",
            "netlify|Credits", "supabase|Egress", "supabase|MAU",
        ])
    }

    func testLimitFields() throws {
        let first = try XCTUnwrap(Fixture.response("full").limits.first)
        XCTAssertEqual(first.service, "claude")
        XCTAssertEqual(first.serviceName, "Claude (Pro)")
        XCTAssertEqual(first.metric, "Sessie")
        XCTAssertEqual(first.leftPercent, 8)
        XCTAssertEqual(first.usedPct, 92)
        XCTAssertEqual(first.leftText, "8% over")
        XCTAssertEqual(first.level, .danger)
        XCTAssertEqual(first.resetsAt, date("2026-11-11T15:00:00Z"))
        XCTAssertEqual(first.elapsed, 0.6)
        XCTAssertEqual(first.runsOutAt, date("2026-11-11T13:30:00Z"))
        XCTAssertEqual(first.urgency, "Op over ~21m, vóór de reset")
        XCTAssertEqual(first.source, .manual)
        XCTAssertEqual(first.fetchedAt, date("2026-11-11T13:05:00Z"))
        XCTAssertFalse(first.stale)
    }

    func testStaleAndNullFields() throws {
        let database = try XCTUnwrap(Fixture.response("full").limits[1])
        XCTAssertTrue(database.stale)
        XCTAssertNil(database.resetsAt)
        XCTAssertNil(database.elapsed)
        XCTAssertNil(database.runsOutAt)
        XCTAssertNil(database.urgency)
        XCTAssertEqual(database.source, .api)
    }

    func testContractExample() throws {
        let response = try Fixture.response("contract-example")
        let credits = try XCTUnwrap(response.limits.first)
        XCTAssertEqual(credits.id, "netlify|Credits")
        XCTAssertEqual(credits.leftPercent, 50)
        XCTAssertEqual(credits.used, 150)
        XCTAssertEqual(credits.limit, 300)
        XCTAssertEqual(credits.unit, "credits")
        XCTAssertEqual(credits.elapsed, 0.07)
        XCTAssertEqual(response.summary.ok, 4)
        XCTAssertEqual(response.problems.first?.message, "...")
    }

    func testMissingOptionalFieldsGetDefaults() throws {
        let response = try Fixture.response("minimal")
        XCTAssertNil(response.generatedAt)
        XCTAssertNil(response.dashboardUrl)
        XCTAssertTrue(response.problems.isEmpty)
        XCTAssertEqual(response.limits.count, 2)

        let bandwidth = response.limits[0]
        XCTAssertEqual(bandwidth.service, "netlify")
        XCTAssertEqual(bandwidth.serviceName, "netlify")
        XCTAssertEqual(bandwidth.metric, "Bandwidth")
        XCTAssertEqual(bandwidth.leftPercent, 64)
        XCTAssertEqual(bandwidth.leftText, "64% over")
        XCTAssertEqual(bandwidth.level, .ok)
        XCTAssertEqual(bandwidth.source, .api)
        XCTAssertFalse(bandwidth.stale)
        XCTAssertNil(bandwidth.resetsAt)

        // leftPct derived from usedPct, level derived from leftPct.
        let week = response.limits[1]
        XCTAssertEqual(week.leftPercent, 25)
        XCTAssertEqual(week.level, .warn)

        // Summary computed from the limits.
        XCTAssertEqual(response.summary.ok, 1)
        XCTAssertEqual(response.summary.warn, 1)
        XCTAssertEqual(response.summary.danger, 0)
        XCTAssertEqual(response.summary.headline, "1 let op · krapst: netlify Bandwidth, 64% over")
    }

    func testZeroAndHundredPercent() throws {
        let response = try Fixture.response("edge-zero-hundred")
        let empty = response.limits[0]
        XCTAssertEqual(empty.leftPercent, 0)
        XCTAssertEqual(empty.leftPercentText, "0%")
        XCTAssertEqual(empty.level, .danger)
        XCTAssertEqual(empty.bar.fill, 0)

        let full = response.limits[1]
        XCTAssertEqual(full.leftPercent, 100)
        XCTAssertEqual(full.level, .ok)
        XCTAssertEqual(full.bar.fill, 1)
        XCTAssertEqual(full.bar.marker, 0)
        XCTAssertEqual(full.source, .local)
        // Dates without fractional seconds.
        XCTAssertEqual(response.generatedAt, date("2026-11-11T13:09:00.000Z"))
    }

    func testUnknownFieldsAndValuesAreTolerated() throws {
        let response = try Fixture.response("unknown-fields")
        // The broken entry is dropped, the rest survives.
        XCTAssertEqual(response.limits.map(\.id), ["claude|Opus", "netlify|Credits"])
        let opus = response.limits[0]
        XCTAssertEqual(opus.level, .warn, "Unknown level falls back to the threshold rule")
        XCTAssertEqual(opus.source, .other("scraper"))
        XCTAssertNil(opus.resetsAt, "Unparseable date becomes nil")
        let credits = response.limits[1]
        XCTAssertNil(credits.used)
        XCTAssertNil(credits.fetchedAt)
        XCTAssertEqual(response.problems.first?.hasValues, false)
        XCTAssertEqual(response.summary.headline, "1 let op")
    }

    func testEmptyLimits() throws {
        let response = try Fixture.response("empty")
        XCTAssertTrue(response.limits.isEmpty)
        XCTAssertEqual(response.summary.headline, "Nog geen gegevens")
        XCTAssertNil(WidgetSelection.mostUrgent(in: response))
    }

    func testErrorBodiesAndGarbageAreInvalid() throws {
        XCTAssertThrowsError(try Fixture.response("error-401")) { error in
            XCTAssertEqual(error as? WidgetAPIError, .invalidResponse)
        }
        XCTAssertThrowsError(try WidgetResponse.decode(from: Data("<html>Login</html>".utf8))) { error in
            XCTAssertEqual(error as? WidgetAPIError, .invalidResponse)
        }
    }

    func testLevelThresholds() {
        XCTAssertEqual(Level(leftPct: 0), .danger)
        XCTAssertEqual(Level(leftPct: 9.9), .danger)
        XCTAssertEqual(Level(leftPct: 10), .warn)
        XCTAssertEqual(Level(leftPct: 30), .warn)
        XCTAssertEqual(Level(leftPct: 30.1), .ok)
        XCTAssertEqual(Level(leftPct: 100), .ok)
        XCTAssertEqual(Level.ok.label, "OK")
        XCTAssertEqual(Level.warn.label, "Let op")
        XCTAssertEqual(Level.danger.label, "Kritiek")
        XCTAssertEqual(Level.danger.colorHex, "#d03b3b")
        XCTAssertTrue(Level.ok < Level.danger)
    }

    func testSampleDataMatchesFixture() throws {
        let fixture = String(decoding: try Fixture.data("full"), as: UTF8.self)
        XCTAssertEqual(SampleData.fullJSON, fixture.trimmingCharacters(in: .newlines))
        XCTAssertEqual(SampleData.response, try Fixture.response("full"))
    }
}
