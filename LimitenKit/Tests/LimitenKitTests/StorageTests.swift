import XCTest
@testable import LimitenKit

final class StorageTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("LimitenKitTests-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    func testCacheRoundTrip() throws {
        let cache = ResponseCache(directory: directory)
        XCTAssertNil(cache.load())
        let savedAt = date("2026-11-11T13:10:00Z")
        try cache.save(try Fixture.data("full"), savedAt: savedAt)
        let snapshot = try XCTUnwrap(cache.load())
        XCTAssertEqual(snapshot.savedAt, savedAt)
        XCTAssertEqual(snapshot.response, try Fixture.response("full"))
        cache.clear()
        XCTAssertNil(cache.load())
    }

    func testCorruptCacheIsIgnored() throws {
        let cache = ResponseCache(directory: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data("nonsense".utf8).write(to: cache.fileURL)
        XCTAssertNil(cache.load())
    }

    func testSettingsStore() throws {
        let suite = "LimitenKitTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SettingsStore(defaults: defaults)
        XCTAssertEqual(store.dashboardURLText, SettingsStore.defaultDashboardURL)
        store.dashboardURLText = "example.com/"
        XCTAssertEqual(store.dashboardURL?.absoluteString, "https://example.com")
        store.dashboardURLText = "http://example.com"
        XCTAssertNil(store.dashboardURL)
    }

    func testInMemoryTokenStore() throws {
        let store = InMemoryTokenStore()
        XCTAssertNil(store.readToken())
        try store.saveToken("abc")
        XCTAssertEqual(store.readToken(), "abc")
        try store.deleteToken()
        XCTAssertNil(store.readToken())
    }
}
