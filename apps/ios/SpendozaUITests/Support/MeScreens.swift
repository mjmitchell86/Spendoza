import XCTest

/// The Me tab's screens that the UI tests walk.
enum MeScreen: String, CaseIterable {
    case me = "Me", inviteCodes = "Invite codes", assistants = "AI assistants", support = "Support",
         admin = "Admin", adminUser = "Admin user"

    var needsAdmin: Bool { self == .admin || self == .adminUser }

    /// How the last element on the page (with the stub's data) starts.
    var lastElementPrefix: String {
        switch self {
        case .me: "Delete my account"
        case .inviteCodes: "Create code"
        case .assistants: "Disconnect AI assistants"
        case .support: "Read the privacy policy"
        case .admin: "LLM token usage"
        case .adminUser: "Delete user"
        }
    }
}

extension XCUIApplication {
    /// Taps through the Me tab as far as `screen`.
    @MainActor
    func open(_ screen: MeScreen, timeout: TimeInterval = 15) {
        // With the tab bar hidden the app starts on Me (`startOnMe`); otherwise Health first, then the Me tab.
        let me = tabBars.buttons["Me"]
        if me.waitForExistence(timeout: 5) { me.tap() }
        XCTAssertTrue(staticTexts["Weekly email reports"].waitForExistence(timeout: timeout), "Me didn't open")
        func push(_ title: String, expecting text: String) {
            let row = buttons[title].firstMatch
            var swipes = 0
            while !row.exists || !row.isHittable, swipes < 12 { swipeUp(); swipes += 1 }
            row.tap()
            XCTAssertTrue(staticTexts[text].waitForExistence(timeout: timeout), "\(title) didn't open")
        }
        switch screen {
        case .me: break
        case .inviteCodes: push("Invite codes", expecting: "Invite codes")
        case .assistants: push("AI assistants", expecting: "Connect to AI assistants")
        case .support: push("Support", expecting: "How it works")
        case .admin: push("Admin", expecting: "Total users")
        case .adminUser:
            push("Admin", expecting: "Total users")
            push("Users", expecting: "User management")
            let user = buttons.matching(NSPredicate(format: "label CONTAINS 'Ann Baker'")).firstMatch
            XCTAssertTrue(user.waitForExistence(timeout: timeout), "No Ann Baker row")
            user.tap()
            XCTAssertTrue(buttons["Refresh report"].waitForExistence(timeout: timeout), "User didn't open")
        }
    }

    /// Swipes up until the page stops moving (its first text keeps the same position twice).
    @MainActor
    func scrollToEnd(maxSwipes: Int = 20) {
        func top() -> CGFloat? {
            guard let root = try? snapshot() else { return nil }
            var y: CGFloat?
            func walk(_ node: XCUIElementSnapshot) {
                if y == nil, node.elementType == .staticText, !node.label.isEmpty { y = node.frame.minY }
                node.children.forEach(walk)
            }
            walk(root)
            return y
        }
        for _ in 0..<maxSwipes {
            let before = top()
            swipeUp(velocity: .slow)
            RunLoop.current.run(until: Date().addingTimeInterval(0.6))
            if top() == before { return }
        }
    }
}
