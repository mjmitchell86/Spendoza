import Foundation

/// What time the screens treat as now. Debug builds can pin it for the stubbed UI tests (`UITestStub`).
enum AppClock {
    static var now: Date {
        #if DEBUG
        if UITestStub.isOn { return UITestStub.now }
        #endif
        return Date()
    }
}
