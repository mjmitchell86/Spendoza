// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SpendozaKit",
    platforms: [.iOS("26.0"), .macOS(.v15)],
    products: [.library(name: "SpendozaKit", targets: ["SpendozaKit"])],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0"),
    ],
    targets: [
        .target(
            name: "SpendozaKit",
            dependencies: [.product(name: "Auth", package: "supabase-swift")]
        ),
        .testTarget(name: "SpendozaKitTests", dependencies: ["SpendozaKit"]),
    ]
)
