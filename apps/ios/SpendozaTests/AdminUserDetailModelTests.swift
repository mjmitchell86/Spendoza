import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct AdminUserDetailModelTests {
    private final class Box { var changed: [AdminUser] = []; var deleted = 0 }

    private func model(_ api: StubAPI, isSelf: Bool = false, box: Box = Box()) -> AdminUserDetailModel {
        AdminUserDetailModel(user: AdminUsersModelTests.user("u1"), api: api, isSelf: isSelf,
                             onChange: { box.changed.append($0) }, onDeleted: { box.deleted += 1 })
    }

    @Test func setTierSendsOnlyTheTierAndReportsTheChange() async {
        let api = StubAPI()
        let box = Box()
        let m = model(api, box: box)
        await m.setTier("starter")
        #expect(api.calls == ["adminUpdateUser(u1, tier=starter)"])
        #expect(m.user.tier == "starter")
        #expect(box.changed.map(\.tier) == ["starter"])
        #expect(m.error == nil)
    }

    @Test func aFailedChangeRevertsAndShowsTheError() async {
        let api = StubAPI()
        api.adminActionErrors["adminUpdateUser"] = .message("Admin access required")
        let box = Box()
        let m = model(api, box: box)
        await m.setTier("pro")
        #expect(m.user.tier == "free")
        #expect(m.error == "Admin access required")
        #expect(box.changed.isEmpty)
        await m.setAdmin(true)
        #expect(!m.user.isAdmin)
        await m.setDisabled(true)
        #expect(!m.user.disabled)
    }

    @Test func adminAndDisabledSendTheirOwnKeys() async {
        let api = StubAPI()
        let m = model(api)
        await m.setAdmin(true)
        await m.setDisabled(true)
        #expect(api.calls == ["adminUpdateUser(u1, admin=true)", "adminUpdateUser(u1, disabled=true)"])
        #expect(m.user.isAdmin && m.user.disabled)
    }

    @Test func actionsReturnTheWebsCopyWithTheUsersName() async {
        let api = StubAPI()
        let m = model(api)
        #expect(await m.run(.regenerateReport) == "Report regenerated for Ann")
        #expect(await m.run(.detectRecurring) == "Recurring detection complete for Ann")
        #expect(await m.run(.sendQuarterlyReport) == "Quarterly report sent to Ann")
        #expect(await m.run(.sendAnnualReport) == "Annual report sent to Ann")
        #expect(api.calls == ["adminRegenerateReport(u1)", "adminDetectRecurring(u1)",
                              "adminSendQuarterlyReport(u1)", "adminSendAnnualReport(u1)"])
        #expect(m.results[.sendAnnualReport]?.text == "Annual report sent to Ann")
    }

    @Test func failedActionsReturnTheWebsFailureCopy() async {
        let api = StubAPI()
        api.adminActionErrors = ["adminRegenerateReport": .offline, "adminDetectRecurring": .offline,
                                 "adminSendQuarterlyReport": .message("No report data"),
                                 "adminSendAnnualReport": .message("Mail down")]
        let m = model(api)
        #expect(await m.run(.regenerateReport) == "Failed to regenerate report for Ann")
        #expect(await m.run(.detectRecurring) == "Failed to detect recurring for Ann")
        #expect(await m.run(.sendQuarterlyReport) == "Quarterly report failed: No report data")
        #expect(await m.run(.sendAnnualReport) == "Annual report failed: Mail down")
        #expect(m.results[.regenerateReport]?.failed == true)
    }

    @Test func deleteSuccessCallsOnDeleted() async {
        let api = StubAPI()
        let box = Box()
        let m = model(api, box: box)
        await m.delete()
        #expect(api.calls == ["adminDeleteUser(u1)"])
        #expect(box.deleted == 1)
        #expect(m.deleted)
    }

    @Test func theServers409MessageShowsAndTheUserStays() async {
        let text = "Cannot delete a household head with members"
        let api = StubAPI()
        api.adminActionErrors["adminDeleteUser"] = .message(text)
        let box = Box()
        let m = model(api, box: box)
        await m.delete()
        #expect(m.error == text)
        #expect(box.deleted == 0)
        #expect(!m.deleted)
    }

    @Test func yourOwnAccountCannotBeDeleted() async {
        let api = StubAPI()
        let m = model(api, isSelf: true)
        #expect(!m.canDelete)
        await m.delete()
        #expect(api.calls.isEmpty)
    }

    @Test func theConfirmationNamesTheUserAndEmail() {
        let m = model(StubAPI())
        #expect(m.confirmation == "This will permanently delete Ann (u1@example.com) and all their data. This cannot be undone.")
    }

    @Test func aFailedChangeDoesNotUndoAnotherInFlight() async {
        let api = StubAPI()
        let gate = AdminUsersModelTests.Gate()
        api.adminUpdateHook = { change in
            if change.isAdmin != nil { await gate.wait(); throw APIError.message("No") }
        }
        let box = Box()
        let m = model(api, box: box)
        let admin = Task { await m.setAdmin(true) }
        for _ in 0..<1000 where api.calls.isEmpty { await Task.yield() }
        await m.setDisabled(true)
        #expect(m.user.isAdmin && m.user.disabled)
        await gate.open()
        await admin.value
        #expect(!m.user.isAdmin)
        #expect(m.user.disabled)
        #expect(m.error == "No")
        #expect(box.changed.map(\.isAdmin) == [false])
        #expect(box.changed.map(\.disabled) == [true])
    }

    @Test func theParentOnlyHearsConfirmedValues() async {
        let api = StubAPI()
        let gate = AdminUsersModelTests.Gate()
        api.adminUpdateHook = { change in
            if change.isAdmin != nil { await gate.wait() } else { throw APIError.message("No") }
        }
        let box = Box()
        let m = model(api, box: box)
        let admin = Task { await m.setAdmin(true) }
        for _ in 0..<1000 where api.calls.isEmpty { await Task.yield() }
        await m.setDisabled(true)           // fails while the admin change is still held
        #expect(!m.user.disabled)
        await gate.open()
        await admin.value
        #expect(box.changed.count == 1)
        #expect(box.changed[0].isAdmin && !box.changed[0].disabled)
    }
}
