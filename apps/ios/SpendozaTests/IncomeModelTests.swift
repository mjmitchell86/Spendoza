import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct IncomeModelTests {
    private let me = "u-me"
    private let us = Locale(identifier: "en_US")
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    private func entry(_ id: String, _ source: String, friendly: String? = nil, amount: Double = 3000, owner: String? = nil,
                       frequency: IncomeFrequency = .monthly, attributedUser: String? = nil, attributedName: String? = nil,
                       auto: Bool = false, ai: Bool = false, effective: Date? = nil) -> IncomeEntry {
        IncomeEntry(id: id, ownerID: owner ?? me, sourceName: source, friendlyName: friendly, amount: amount, frequency: frequency,
                    effectiveDate: effective ?? day(2026, 1, 1), attributedToUserID: attributedUser,
                    attributedToName: attributedName, autoDetected: auto, aiSuggested: ai)
    }

    private let household = Household(id: "h1", name: "The Smiths", headID: "u-me", members: [
        Member(id: "u-me", displayName: "Test"), Member(id: "u-ann", displayName: "Ann Smith"),
    ])

    private func api(inHousehold: Bool = true, _ entries: [IncomeEntry]? = nil) -> StubAPI {
        let api = StubAPI()
        api.householdResult = .success(inHousehold ? household : nil)
        api.incomeList = entries ?? [
            entry("i1", "ACME PAYROLL", friendly: "Salary", amount: 4200.5, auto: true, effective: day(2026, 3, 1)),
            entry("i2", "Consulting", frequency: .oneTime, ai: true, effective: day(2026, 2, 1)),
            entry("i3", "Ann pay", owner: "u-ann", attributedUser: me, effective: day(2026, 1, 15)),
            entry("i4", "Side gig", attributedName: "Jane", effective: day(2026, 1, 1)),
            entry("i5", "Partner job", frequency: .annually, attributedUser: "u-ann", effective: day(2025, 12, 1)),
        ]
        return api
    }

    private func model(_ api: StubAPI) async -> IncomeModel {
        let m = IncomeModel(api: api, selfID: { self.me }, calendar: calendar)
        await m.load()
        return m
    }

    // MARK: List

    @Test func rowShowsFriendlyNameWithTheSourceNameBeneath() async {
        let m = await model(api())
        let salary = m.rows.first { $0.id == "i1" }!
        #expect(salary.title == "Salary")
        #expect(salary.rawSourceName == "ACME PAYROLL")
        #expect(salary.amountText == "$4,200.50")
        let consulting = m.rows.first { $0.id == "i2" }!
        #expect(consulting.title == "Consulting")
        #expect(consulting.rawSourceName == nil)
    }

    @Test func rowsMarkAutoDetectedAISuggestedAndTheAttribution() async {
        let m = await model(api())
        func marks(_ id: String) -> [String] { m.rows.first { $0.id == id }!.marks }
        #expect(marks("i1") == ["Auto-detected"])
        #expect(marks("i2") == ["AI suggested"])
        #expect(marks("i3") == ["Test"])
        #expect(marks("i4") == ["Jane"])
        #expect(marks("i5") == ["Ann Smith"])
    }

    @Test func rowsReadFrequencyAndEffectiveDateInTheWebsWords() async {
        let m = await model(api())
        #expect(m.rows.map(\.frequencyLabel) == ["Monthly", "One-time", "Monthly", "Monthly", "Annually"])
        #expect(m.rows[0].effectiveText == "Mar 1, 2026")
        #expect(IncomeModel.label(.biweekly) == "Biweekly")
        #expect(IncomeModel.label(.weekly) == "Weekly")
    }

    @Test func loadFailureShowsTheMessageAndRetryRecovers() async {
        let api = api()
        api.moneyErrors["incomeEntries"] = .message("Failed to load income")
        let m = await model(api)
        #expect(m.loadError == "Failed to load income")
        api.moneyErrors["incomeEntries"] = nil
        await m.load()
        #expect(m.loadError == nil)
        #expect(m.rows.count == 5)
    }

    @Test func membersComeFromTheHouseholdAndAreEmptyWithoutOne() async {
        #expect(await model(api()).members.map(\.displayName) == ["Ann Smith", "Test"])
        #expect(await model(api(inHousehold: false)).members.isEmpty)
    }

    @Test func aFailedHouseholdLookupStillShowsTheIncome() async {
        let api = api()
        api.householdResult = .failure(.offline)
        let m = await model(api)
        #expect(m.loadError == nil)
        #expect(m.rows.count == 5)
        #expect(m.members.isEmpty)
    }

    @Test func anEndedSessionIsHandedToTheApp() async {
        let api = api()
        api.moneyErrors["incomeEntries"] = .unauthorized
        let m = IncomeModel(api: api, selfID: { self.me })
        var ended = false
        m.onSessionEnded = { ended = true }
        await m.load()
        #expect(ended)
        #expect(m.loadError == nil)
    }

    // MARK: Who can delete

    @Test func onlyTheOwnerCanDelete() async {
        let m = await model(api())
        #expect(m.canDelete(m.entries.first { $0.id == "i1" }!))
        // Attributed to you but owned by Ann: you can edit it, not delete it.
        #expect(!m.canDelete(m.entries.first { $0.id == "i3" }!))
    }

    // MARK: Form

    private func filled() -> IncomeForm {
        var form = IncomeForm(today: day(2026, 11, 1), locale: us)
        form.sourceName = "Salary"
        form.amountText = "4200.50"
        return form
    }

    @Test func newFormDefaultsLikeTheWeb() {
        let form = IncomeForm(today: day(2026, 11, 1), locale: us)
        #expect(form.frequency == .monthly)
        #expect(form.effectiveDate == day(2026, 11, 1))
        #expect(form.attribution == .me)
        #expect(!form.hasEndDate)
        #expect(!form.canSave)
    }

    @Test func formNeedsASourceAndAnAmountAboveZero() {
        var f = filled()
        #expect(f.canSave)
        f.sourceName = "  "
        #expect(!f.canSave)
        f = filled(); f.amountText = "0"
        #expect(!f.canSave)
        f.amountText = "abc"
        #expect(!f.canSave)
    }

    @Test func meDefaultSendsNoAttribution() throws {
        let draft = try #require(filled().draft())
        #expect(draft.attributedToUserID == nil)
        #expect(draft.attributedToName == nil)
    }

    @Test func householdMemberSendsAttributedToUserID() throws {
        var f = filled()
        f.attribution = .member
        #expect(!f.canSave)
        f.memberID = "u-ann"
        let draft = try #require(f.draft())
        #expect(draft.attributedToUserID == "u-ann")
        #expect(draft.attributedToName == nil)
    }

    @Test func customNameSendsAttributedToNameTrimmed() throws {
        var f = filled()
        f.attribution = .custom
        #expect(!f.canSave)
        f.customName = "  Jane "
        let draft = try #require(f.draft())
        #expect(draft.attributedToName == "Jane")
        #expect(draft.attributedToUserID == nil)
    }

    @Test func switchingBackToMeClearsBothOnTheWire() throws {
        // Editing an entry attributed to a member, then choosing "Me (default)": both fields go as explicit nulls,
        // or the server keeps the old attribution (the same partial-update trap as the bill interval).
        var f = IncomeForm(editing: entry("i5", "Partner job", attributedUser: "u-ann"), locale: us)
        #expect(f.attribution == .member)
        #expect(f.memberID == "u-ann")
        f.attribution = .me
        let json = String(decoding: try JSONEncoder().encode(try #require(f.draft())), as: UTF8.self)
        #expect(json.contains("\"attributed_to_user_id\":null"))
        #expect(json.contains("\"attributed_to_name\":null"))
    }

    @Test func switchingBetweenMemberAndCustomSendsOnlyTheChosenOne() throws {
        var f = IncomeForm(editing: entry("i4", "Side gig", attributedName: "Jane"), locale: us)
        #expect(f.attribution == .custom)
        #expect(f.customName == "Jane")
        f.attribution = .member
        f.memberID = "u-ann"
        let draft = try #require(f.draft())
        #expect(draft.attributedToUserID == "u-ann")
        #expect(draft.attributedToName == nil)
    }

    @Test func editingFillsTheFormFromTheEntry() {
        let e = IncomeEntry(id: "i1", ownerID: me, sourceName: "ACME", friendlyName: "Salary", amount: 4200.5, frequency: .biweekly,
                            effectiveDate: day(2026, 3, 1), endDate: day(2026, 12, 31))
        let f = IncomeForm(editing: e, locale: us)
        #expect(f.sourceName == "ACME")
        #expect(f.friendlyName == "Salary")
        #expect(f.amountText == "4200.5")
        #expect(f.frequency == .biweekly)
        #expect(f.effectiveDate == day(2026, 3, 1))
        #expect(f.hasEndDate)
        #expect(f.endDate == day(2026, 12, 31))
        #expect(f.attribution == .me)
    }

    @Test func draftCarriesTrimmedTextAndOptionalEndDate() throws {
        var f = filled()
        f.sourceName = "  Salary "
        f.friendlyName = "  "
        f.hasEndDate = true
        f.endDate = day(2027, 1, 1)
        let draft = try #require(f.draft())
        #expect(draft.sourceName == "Salary")
        #expect(draft.friendlyName == nil)
        #expect(draft.amount == 4200.5)
        #expect(draft.endDate == day(2027, 1, 1))
        f.hasEndDate = false
        #expect(try #require(f.draft()).endDate == nil)
    }

    @Test func attributionChoicesHideHouseholdMemberOutsideAHousehold() async {
        #expect(await model(api()).attributionChoices == [.me, .member, .custom])
        #expect(await model(api(inHousehold: false)).attributionChoices == [.me, .custom])
        #expect(IncomeForm.Attribution.me.title == "Me (default)")
        #expect(IncomeForm.Attribution.member.title == "Household member")
        #expect(IncomeForm.Attribution.custom.title == "Custom name")
    }

    @Test func formReadsItsAmountInTheFormsLocale() {
        var f = IncomeForm(today: day(2026, 11, 1), locale: Locale(identifier: "de_DE"))
        f.sourceName = "Salary"
        f.amountText = "1250,5"
        #expect(f.amount == 1250.5)
    }

    // MARK: Actions

    @Test func saveCreatesAndListsTheEntry() async throws {
        let api = api()
        let m = await model(api)
        var f = filled()
        f.attribution = .member
        f.memberID = "u-ann"
        let message = await m.save(try #require(f.draft()), id: nil)
        #expect(message == nil)
        #expect(api.calls.contains("saveIncome(new, Salary)"))
        #expect(m.rows.count == 6)
    }

    @Test func saveUpdatesTheEntryInPlace() async throws {
        let api = api()
        let m = await model(api)
        var f = IncomeForm(editing: m.entries.first { $0.id == "i3" }!, locale: us)
        f.sourceName = "Ann pay (raise)"
        let message = await m.save(try #require(f.draft()), id: "i3")
        #expect(message == nil)
        #expect(api.calls.contains("saveIncome(i3, Ann pay (raise))"))
        #expect(m.rows.count == 5)
        #expect(m.rows.first { $0.id == "i3" }?.title == "Ann pay (raise)")
    }

    @Test func notInYourHouseholdShowsVerbatim() async throws {
        let api = api()
        let m = await model(api)
        api.moneyErrors["saveIncome"] = .message("Attributed user is not in your household")
        var f = filled()
        f.attribution = .member
        f.memberID = "u-zed"
        let message = await m.save(try #require(f.draft()), id: nil)
        #expect(message == "Attributed user is not in your household")
        #expect(m.rows.count == 5)
    }

    @Test func deleteConfirmationNamesTheSourceName() {
        #expect(IncomeModel.deleteMessage(for: entry("i1", "ACME PAYROLL", friendly: "Salary"))
                == "Are you sure you want to delete \"ACME PAYROLL\"? This action cannot be undone.")
    }

    @Test func deleteRemovesTheEntry() async {
        let api = api()
        let m = await model(api)
        let message = await m.delete(m.entries.first { $0.id == "i2" }!)
        #expect(message == nil)
        #expect(api.calls.contains("deleteIncome(i2)"))
        #expect(m.rows.count == 4)
    }

    @Test func failedDeleteShowsTheServerTextAndKeepsTheEntry() async {
        let api = api()
        let m = await model(api)
        api.moneyErrors["deleteIncome"] = .message("Cannot delete this income entry")
        let message = await m.delete(m.entries.first { $0.id == "i2" }!)
        #expect(message == "Cannot delete this income entry")
        #expect(m.rows.count == 5)
    }

    // MARK: Attribution belongs to the owner

    @Test func theAttributionReadsInTheFormsWords() async {
        let m = await model(api())
        // i3 is Ann's, attributed to you.
        #expect(m.attributionText(of: m.entries.first { $0.id == "i3" }!) == "You")
        #expect(m.attributionText(of: m.entries.first { $0.id == "i5" }!) == "Ann Smith")
        #expect(m.attributionText(of: m.entries.first { $0.id == "i4" }!) == "Jane")
        #expect(m.attributionText(of: m.entries.first { $0.id == "i1" }!) == "Me (default)")
        #expect(IncomeModel.ownerOnlyAttribution == "Only the owner can change who this income is attributed to.")
    }

    @Test func someoneTheEntryIsAttributedToSavesWithoutTheAttribution() throws {
        // Owned by Ann, attributed to you: the server refuses an attribution change, so the draft leaves it out.
        var f = IncomeForm(editing: entry("i3", "Ann pay", owner: "u-ann", attributedUser: me), locale: us)
        f.canAttribute = false
        f.amountText = "3100"
        let draft = try #require(f.draft())
        #expect(!draft.includesAttribution)
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(draft)) as? [String: Any])
        #expect(json["attributed_to_user_id"] == nil)
        #expect(json["attributed_to_name"] == nil)
        #expect(json["amount"] as? Double == 3100)
    }

    @Test func theOwnersDraftStillCarriesTheAttribution() throws {
        let draft = try #require(IncomeForm(editing: entry("i5", "Partner job", attributedUser: "u-ann"), locale: us).draft())
        #expect(draft.includesAttribution)
        #expect(draft.attributedToUserID == "u-ann")
    }
}
