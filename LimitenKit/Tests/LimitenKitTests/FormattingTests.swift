import XCTest
@testable import LimitenKit

final class FormattingTests: XCTestCase {
    let now = date("2026-11-11T13:12:00Z")

    func testRelative() {
        XCTAssertEqual(Format.relative(now, now: now), "zojuist")
        XCTAssertEqual(Format.relative(now.addingTimeInterval(-59), now: now), "zojuist")
        XCTAssertEqual(Format.relative(now.addingTimeInterval(-180), now: now), "3m geleden")
        XCTAssertEqual(Format.relative(now.addingTimeInterval(-7_200), now: now), "2u geleden")
        XCTAssertEqual(Format.relative(now.addingTimeInterval(-4 * 86_400), now: now), "4d geleden")
        XCTAssertEqual(Format.relative(now.addingTimeInterval(300), now: now), "zojuist", "Clock skew")
        XCTAssertEqual(Format.updated(now.addingTimeInterval(-180), now: now), "Bijgewerkt 3m geleden")
    }

    func testDuration() {
        XCTAssertEqual(Format.duration(0), "0m")
        XCTAssertEqual(Format.duration(-5), "0m")
        XCTAssertEqual(Format.duration(30), "<1m")
        XCTAssertEqual(Format.duration(20 * 60), "20m")
        XCTAssertEqual(Format.duration(15 * 3600), "15u")
        XCTAssertEqual(Format.duration(15 * 3600 + 20 * 60), "15u 20m")
        XCTAssertEqual(Format.duration(4 * 86_400 + 15 * 3600 + 59 * 60), "4d 15u")
        XCTAssertEqual(Format.duration(2 * 86_400), "2d")
    }

    func testResetCountdown() {
        XCTAssertEqual(Format.resetCountdown(date("2026-11-11T15:00:00Z"), now: now), "Reset over 1u 48m")
        XCTAssertEqual(Format.resetCountdown(date("2026-11-11T13:00:00Z"), now: now), "Reset nu")
    }

    func testDutchNumbers() {
        XCTAssertEqual(Format.number(49_488), "49.488")
        XCTAssertEqual(Format.number(4.5), "4,5")
        XCTAssertEqual(Format.number(300), "300")
        XCTAssertEqual(Format.number(0.25, maxFractionDigits: 2), "0,25")
    }

    func testDateTimeUsesTimeZone() throws {
        let amsterdam = try XCTUnwrap(TimeZone(identifier: "Europe/Amsterdam"))
        let text = Format.dateTime(date("2026-12-09T08:00:00Z"), timeZone: amsterdam)
        XCTAssertTrue(text.contains("9"), text)
        XCTAssertTrue(text.contains("dec"), text)
        XCTAssertTrue(text.hasSuffix("09:00"), text)
    }
}
