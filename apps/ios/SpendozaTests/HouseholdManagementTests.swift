import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

/// Counts how often a model asked for the household to be fetched again.
@MainActor final class ReloadCounter { var count = 0 }

@MainActor
struct HouseholdManagementTests {
    private let ann = Member(id: "ann", displayName: "Ann")
    private var me: Member { Member(id: "me", displayName: "Me") }
    private func household(head: String = "me", code: String? = "abcdefghjk", members: [Member]? = nil) -> Household {
        Household(id: "h1", name: "The Smiths", headID: head, inviteCode: code, members: members ?? [me, ann])
    }

    private func model(_ api: StubAPI, _ household: Household? = nil, selfID: String = "me",
                       reloads: ReloadCounter = ReloadCounter()) -> HouseholdModel {
        HouseholdModel(api: api, selfID: { selfID }, household: household ?? self.household(),
                       reload: { reloads.count += 1 })
    }

    // MARK: invite code

    @Test func theHeadSeesTheCodeFormattedAndNonHeadsSeeNone() {
        #expect(model(StubAPI()).codeText == "ABCDE-FGHJK")
        let other = model(StubAPI(), household(head: "ann"))
        #expect(!other.isHead)
        #expect(other.codeText == nil)
        #expect(model(StubAPI(), household(code: nil)).codeText == nil)
    }

    @Test func isHeadReadsTheCurrentSessionLazily() {
        final class Box { var id = "ann" }
        let box = Box()
        let m = HouseholdModel(api: StubAPI(), selfID: { box.id }, household: household(), reload: {})
        #expect(!m.isHead)
        box.id = "me"
        #expect(m.isHead)
    }

    @Test func theShareTextIsTheWebsAndCarriesTheFormattedCode() {
        #expect(HouseholdModel.shareText(code: "ABCDE-FGHJK") == "Join my household on Spendoza with code ABCDE-FGHJK")
    }

    @Test func rotatingShowsTheReturnedCode() async {
        let api = StubAPI()
        let m = model(api)
        await m.rotateCode()
        #expect(api.calls.contains("rotateInviteCode"))
        #expect(m.codeText == "ZYXWV-UTSRQ")
        #expect(m.codeError == nil)
    }

    @Test func aFailedRotateKeepsTheCodeAndSaysWhy() async {
        let api = StubAPI()
        api.householdActionErrors["rotateInviteCode"] = .message("Only the head can do that")
        let m = model(api)
        await m.rotateCode()
        #expect(m.codeText == "ABCDE-FGHJK")
        #expect(m.codeError == "Only the head can do that")
    }

    @Test func rotateDialogCopyIsTheWebsSentence() {
        #expect(HouseholdModel.rotateTitle == "Get a new code?")
        #expect(HouseholdModel.rotateBody == "Anyone who has the old code won't be able to use it. People already in your household stay.")
    }

    // MARK: members

    @Test func removeAndTransferDialogsNameTheMember() {
        #expect(HouseholdModel.removeBody(ann) == "Remove Ann from the household? Your invite code will change.")
        #expect(HouseholdModel.transferBody(ann) == "Make Ann the head of household? You will no longer be the head of household.")
    }

    @Test func removingCallsTheApiThenRefetches() async {
        let api = StubAPI()
        let reloads = ReloadCounter()
        let m = model(api, reloads: reloads)
        await m.remove(ann)
        #expect(api.calls.contains("removeMember(ann)"))
        #expect(reloads.count == 1)
        #expect(m.memberError == nil)
    }

    @Test func aFailedRemoveShowsTheServersWordsAndDoesNotRefetch() async {
        let api = StubAPI()
        api.householdActionErrors["removeMember"] = .message("Member not found")
        let reloads = ReloadCounter()
        let m = model(api, reloads: reloads)
        await m.remove(ann)
        #expect(m.memberError == "Member not found")
        #expect(reloads.count == 0)
    }

    @Test func transferringCallsTheApiThenRefetches() async {
        let api = StubAPI()
        let reloads = ReloadCounter()
        let m = model(api, reloads: reloads)
        await m.makeHead(ann)
        #expect(api.calls.contains("makeHead(ann)"))
        #expect(reloads.count == 1)
    }

    @Test func aTransferFailureThatIsNotTheServersWordsUsesThePlainMessage() async {
        let api = StubAPI()
        api.householdActionErrors["makeHead"] = .offline
        let m = model(api)
        await m.makeHead(ann)
        #expect(m.memberError == APIError.offline.userMessage)
    }

    @Test func memberLinesNameHeadAndYouAndSharingModes() {
        let m = model(StubAPI())
        #expect(m.title(for: me) == "Me (Head) (You)")
        #expect(m.title(for: ann) == "Ann")
        let partial = Member(id: "p", displayName: "Pat", incomeSharing: .partial, expenseSharing: .category)
        #expect(HouseholdModel.sharingLine(partial) == "Income: Partial · Expenses: By category")
        let none = Member(id: "n", displayName: "Nan", incomeSharing: .none, expenseSharing: .none)
        #expect(HouseholdModel.sharingLine(none) == "Income: None · Expenses: None")
        #expect(HouseholdModel.sharingLine(ann) == "Income: All · Expenses: All")
    }

    // MARK: invite by email and pending

    @Test func invitingSendsTheTrimmedEmailThenListsPending() async {
        let api = StubAPI()
        let m = model(api)
        await m.sendInvitation(email: "  cara@example.com ")
        #expect(api.calls.contains("invite(cara@example.com)"))
        #expect(api.calls.contains("pendingInvitations"))
        #expect(m.inviteResult == .sent)
    }

    @Test func aFailedInviteShowsTheApisMessage() async {
        let api = StubAPI()
        api.householdActionErrors["invite"] = .message("Household is full")
        let m = model(api)
        await m.sendInvitation(email: "cara@example.com")
        #expect(m.inviteResult == .failed("Household is full"))
    }

    @Test func theEmailFallbackIsTheWebsSentence() {
        #expect(HouseholdModel.inviteFallback == "Couldn't send the invitation email. Try again.")
    }

    @Test func pendingInvitationsLoadForTheHeadOnly() async {
        let api = StubAPI()
        let pending = PendingInvitation(id: "p1", email: "cara@example.com", createdAt: .now, expiresAt: .now)
        api.pendingInvitationsResult = .success([pending])
        let head = model(api)
        await head.loadPending()
        #expect(head.pending == [pending])
        let other = model(api, household(head: "ann"))
        await other.loadPending()
        #expect(other.pending.isEmpty)
    }

    @Test func revokingCallsTheApiAndListsAgain() async {
        let api = StubAPI()
        let pending = PendingInvitation(id: "p1", email: "cara@example.com", createdAt: .now, expiresAt: .now)
        api.pendingInvitationsResult = .success([pending])
        let m = model(api)
        await m.loadPending()
        api.pendingInvitationsResult = .success([])
        await m.revoke(pending)
        #expect(api.calls.contains("revokeInvitation(p1)"))
        #expect(m.pending.isEmpty)
    }

    @Test func aFailedRevokeKeepsTheRow() async {
        let api = StubAPI()
        let pending = PendingInvitation(id: "p1", email: "cara@example.com", createdAt: .now, expiresAt: .now)
        api.pendingInvitationsResult = .success([pending])
        api.householdActionErrors["revokeInvitation"] = .message("Invitation not found")
        let m = model(api)
        await m.loadPending()
        await m.revoke(pending)
        #expect(m.pending == [pending])
        #expect(m.pendingError == "Invitation not found")
    }

    // MARK: settings

    @Test func renameNeedsAChangedNonEmptyName() {
        let m = model(StubAPI())
        #expect(!m.canRename("The Smiths"))
        #expect(!m.canRename("   "))
        #expect(m.canRename("The Joneses"))
    }

    @Test func renamingSendsTheTrimmedNameThenRefetches() async {
        let api = StubAPI()
        let reloads = ReloadCounter()
        let m = model(api, reloads: reloads)
        await m.rename(to: " The Joneses ")
        #expect(api.calls.contains("renameHousehold(The Joneses)"))
        #expect(reloads.count == 1)
    }

    @Test func deleteIsEnabledOnlyForTheExactName() {
        #expect(HouseholdModel.canDelete(typed: "The Smiths", name: "The Smiths"))
        #expect(!HouseholdModel.canDelete(typed: "the smiths", name: "The Smiths"))
        #expect(!HouseholdModel.canDelete(typed: "The Smiths ", name: "The Smiths"))
        #expect(!HouseholdModel.canDelete(typed: "", name: ""))
    }

    @Test func deletingSendsTheNameAndRefetches() async {
        let api = StubAPI()
        let reloads = ReloadCounter()
        let m = model(api, reloads: reloads)
        #expect(await m.deleteHousehold(typed: "The Smiths"))
        #expect(api.calls.contains("deleteHousehold(The Smiths)"))
        #expect(reloads.count == 1)
    }

    @Test func deletingWithTheWrongNameDoesNotCallTheApi() async {
        let api = StubAPI()
        let m = model(api)
        #expect(await m.deleteHousehold(typed: "the smiths") == false)
        #expect(!api.calls.contains { $0.hasPrefix("deleteHousehold") })
    }

    @Test func aFailedDeleteReportsAndStaysOpen() async {
        let api = StubAPI()
        api.householdActionErrors["deleteHousehold"] = .message("Name does not match")
        let m = model(api)
        #expect(await m.deleteHousehold(typed: "The Smiths") == false)
        #expect(m.settingsError == "Name does not match")
    }

    // MARK: leave

    @Test func aHeadWithOthersCannotLeave() {
        let m = model(StubAPI())
        #expect(m.leave.isDisabled)
        #expect(m.leave.subtext == "Transfer ownership before leaving")
        #expect(m.leave.rowTitle == "Leave household")
        #expect(m.leave.buttonTitle == "Leave household")
    }

    @Test func aSoleHeadLeavesAndDeletes() {
        let m = model(StubAPI(), household(members: [me]))
        #expect(!m.leave.isDisabled)
        #expect(m.leave.rowTitle == "Leave & delete household")
        #expect(m.leave.buttonTitle == "Leave & delete")
        #expect(m.leave.subtext == "This will permanently delete the household")
        #expect(m.leave.dialogTitle == "Leave & delete household")
        #expect(m.leave.dialogBody == "Are you sure you want to leave The Smiths? Since you are the only member, the household will be permanently deleted.")
    }

    @Test func aMemberCanLeave() {
        let m = model(StubAPI(), household(head: "ann"))
        #expect(!m.leave.isDisabled)
        #expect(m.leave.subtext == "You will be removed from this household")
        #expect(m.leave.dialogTitle == "Leave household")
        #expect(m.leave.dialogBody == "Are you sure you want to leave The Smiths?")
    }

    @Test func leavingCallsTheApiThenRefetches() async {
        let api = StubAPI()
        let reloads = ReloadCounter()
        let m = model(api, household(head: "ann"), reloads: reloads)
        await m.leaveHousehold()
        #expect(api.calls.contains("leaveHousehold"))
        #expect(reloads.count == 1)
    }

    @Test func aRefusedLeaveShowsTheApisMessage() async {
        let api = StubAPI()
        api.householdActionErrors["leaveHousehold"] = .message("Transfer head of household first")
        let m = model(api)
        await m.leaveHousehold()
        #expect(m.leaveError == "Transfer head of household first")
    }
}

@MainActor
struct SharingSettingsModelTests {
    private func profile(income: IncomeSharing = .all, amount: Double? = nil, expense: ExpenseSharing = .all) -> Profile {
        Profile(id: "me", displayName: "Me", onboardingCompleted: true, isAdmin: false, emailReportsEnabled: false,
                householdID: "h1", incomeSharing: income, expenseSharing: expense, sharedIncomeAmount: amount)
    }

    private func model(_ api: StubAPI, reloads: ReloadCounter = ReloadCounter()) -> SharingSettingsModel {
        SharingSettingsModel(api: api, reload: { reloads.count += 1 })
    }

    @Test func loadPrefillsFromTheProfileIncludingTheAmount() async {
        let api = StubAPI()
        api.profileResult = profile(income: .partial, amount: 1250.5, expense: .none)
        let m = model(api)
        await m.load()
        #expect(m.income == .partial)
        #expect(m.expense == .none)
        #expect(m.amountText == "1250.50")
    }

    @Test func savingSendsAllThreeAndSaysSo() async {
        let api = StubAPI()
        api.profileResult = profile()
        let reloads = ReloadCounter()
        let m = model(api, reloads: reloads)
        await m.load()
        m.income = .none
        m.expense = .none
        await m.save()
        #expect(api.calls.contains("updateSharing(income: none, amount: nil, expense: none)"))
        #expect(m.message == .saved)
        #expect(reloads.count == 1)
    }

    @Test func partialNeedsAnAmountAboveZeroAndSendsIt() async {
        let api = StubAPI()
        api.profileResult = profile()
        let m = model(api)
        await m.load()
        m.income = .partial
        #expect(!m.canSave)
        m.amountText = "0"
        #expect(!m.canSave)
        m.amountText = "abc"
        #expect(!m.canSave)
        m.amountText = "500"
        #expect(m.canSave)
        await m.save()
        #expect(api.calls.contains("updateSharing(income: partial, amount: 500.0, expense: all)"))
    }

    @Test func theAmountIsNotSentUnlessPartial() async {
        let api = StubAPI()
        api.profileResult = profile(income: .partial, amount: 300)
        let m = model(api)
        await m.load()
        m.income = .all
        await m.save()
        #expect(api.calls.contains("updateSharing(income: all, amount: nil, expense: all)"))
    }

    @Test func aFailedSaveShowsTheServersWords() async {
        let api = StubAPI()
        api.profileResult = profile()
        api.householdActionErrors["updateSharing"] = .message("Invalid sharing mode")
        let m = model(api)
        await m.load()
        await m.save()
        #expect(m.message == .failed("Invalid sharing mode"))
    }

    @Test func categoriesLoadOnlyForShareByCategory() async {
        let api = StubAPI()
        api.profileResult = profile(expense: .category)
        api.categoryList = [.init(id: "c1", name: "Housing", budgetClass: .need, isSharedWithHousehold: true),
                            .init(id: "c2", name: "Dining out", budgetClass: .want)]
        let m = model(api)
        await m.load()
        #expect(m.showsCategories)
        #expect(m.categories.map(\.name) == ["Dining out", "Housing"])
        #expect(m.isShared("c1"))
        #expect(!m.isShared("c2"))
        m.expense = .all
        #expect(!m.showsCategories)
    }

    @Test func switchingACategorySavesItAndAFailureRevertsIt() async {
        let api = StubAPI()
        api.profileResult = profile(expense: .category)
        api.categoryList = [.init(id: "c1", name: "Housing", budgetClass: .need)]
        let m = model(api)
        await m.load()
        await m.setShared("c1", true)
        #expect(api.calls.contains("setCategoryShared(c1, true)"))
        #expect(m.isShared("c1"))
        api.householdActionErrors["setCategoryShared"] = .message("Category not found")
        await m.setShared("c1", false)
        #expect(m.isShared("c1"))
        #expect(m.categoryError == "Category not found")
    }

    @Test func choosingByCategoryAfterLoadFetchesTheCategories() async {
        let api = StubAPI()
        api.profileResult = profile()
        let m = model(api)
        await m.load()
        #expect(m.categories.isEmpty)
        m.expense = .category
        await m.loadCategoriesIfNeeded()
        #expect(!m.categories.isEmpty)
    }
}
