// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "LimitenKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "LimitenKit", targets: ["LimitenKit"]),
    ],
    targets: [
        .target(name: "LimitenKit"),
        .testTarget(
            name: "LimitenKitTests",
            dependencies: ["LimitenKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
