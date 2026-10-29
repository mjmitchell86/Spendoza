// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SpendozaKit",
    platforms: [.iOS("26.0"), .macOS(.v15)],
    products: [.library(name: "SpendozaKit", targets: ["SpendozaKit"])],
    dependencies: [
        // Pinned to the 2.55.x line: Package.resolved is not used by xcodebuild for this local package.
        .package(url: "https://github.com/supabase/supabase-swift", .upToNextMinor(from: "2.55.5")),
    ],
    targets: [
        .target(
            name: "SpendozaKit",
            dependencies: [.product(name: "Auth", package: "supabase-swift")]
        ),
        .testTarget(name: "SpendozaKitTests", dependencies: ["SpendozaKit"],
                    resources: [.copy("Fixtures")]),
    ]
)
