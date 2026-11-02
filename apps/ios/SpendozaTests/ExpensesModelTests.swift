import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct ExpensesModelTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    private func bill(_ id: String, _ name: String, friendly: String? = nil, amount: Double = 20, category: String = "c4",
                      frequency: ExpenseFrequency = .recurring, interval: RecurrenceInterval? = .monthly,
                      due: Date? = nil, auto: Bool = false, adjusted: Bool = false, original: Double? = nil,
                      end: Date? = nil) -> Expense {
        Expense(id: id, categoryID: category, description: name, friendlyName: friendly, amount: amount, frequency: frequency,
                interval: frequency == .recurring ? interval : nil, nextDueDate: due ?? day(2026, 11, 8), endDate: end,
                autoDetected: auto, isAIAdjusted: adjusted, originalAmount: original)
    }

    private func api(_ bills: [Expense]? = nil) -> StubAPI {
        let api = StubAPI()
        api.categoryList = DrillFixture.categories
        api.expenseList = bills ?? [
            bill("e1", "NETFLIX.COM 8667", friendly: "Netflix", amount: 15.49, auto: true, adjusted: true, original: 17.99),
            bill("e2", "Rent", amount: 1800, category: "c1", due: day(2026, 11, 1)),
            bill("e3", "Car registration", amount: 120, category: "c5", frequency: .oneTime, due: day(2026, 12, 2)),
            bill("e4", "Water", amount: 40, category: "c1", interval: .quarterly, due: day(2026, 11, 20)),
        ]
        return api
    }

    private func model(_ api: StubAPI) async -> ExpensesModel {
        let m = ExpensesModel(api: api, calendar: calendar, now: { self.day(2026, 11, 1) })
        await m.load()
        return m
    }

    // MARK: List

    @Test func rowShowsFriendlyNameWithTheRawDescriptionBeneath() async {
        let m = await model(api())
        let netflix = m.rows.first { $0.id == "e1" }!
        #expect(netflix.title == "Netflix")
        #expect(netflix.rawDescription == "NETFLIX.COM 8667")
        let rent = m.rows.first { $0.id == "e2" }!
        #expect(rent.title == "Rent")
        #expect(rent.rawDescription == nil)
    }

    @Test func aBlankFriendlyNameFallsBackToTheDescription() async {
        let m = await model(api([bill("e1", "Gym", friendly: "  ")]))
        #expect(m.rows[0].title == "Gym")
        #expect(m.rows[0].rawDescription == nil)
    }

    @Test func autoDetectedAndAIAdjustedMarks() async {
        let m = await model(api())
        let netflix = m.rows.first { $0.id == "e1" }!
        #expect(netflix.isAuto && netflix.isAIAdjusted)
        let rent = m.rows.first { $0.id == "e2" }!
        #expect(!rent.isAuto && !rent.isAIAdjusted)
    }

    @Test func theOriginalAmountShowsOnlyWhenAIAdjusted() async {
        let m = await model(api([
            bill("a", "A", amount: 15.49, adjusted: true, original: 17.99),
            bill("b", "B", amount: 10, adjusted: true, original: nil),
            bill("c", "C", amount: 10, adjusted: false, original: 12),
        ]))
        #expect(m.rows.map(\.amountText) == ["$15.49", "$10.00", "$10.00"])
        #expect(m.rows.map(\.originalAmountText) == ["$17.99", nil, nil])
    }

    @Test func frequencyLabels() {
        let labels = [
            ExpensesModel.frequencyLabel(bill("1", "x", interval: .weekly)),
            ExpensesModel.frequencyLabel(bill("2", "x", interval: .biweekly)),
            ExpensesModel.frequencyLabel(bill("3", "x", interval: .monthly)),
            ExpensesModel.frequencyLabel(bill("4", "x", interval: .quarterly)),
            ExpensesModel.frequencyLabel(bill("5", "x", interval: .annually)),
            ExpensesModel.frequencyLabel(bill("6", "x", frequency: .oneTime)),
        ]
        #expect(labels == ["Weekly", "Biweekly", "Monthly", "Quarterly", "Annually", "One-time"])
    }

    @Test func rowNamesTheCategoryAndDueDate() async {
        let m = await model(api())
        let water = m.rows.first { $0.id == "e4" }!
        #expect(water.categoryName == "Housing")
        #expect(water.frequencyLabel == "Quarterly")
        #expect(water.dueText == "Nov 20, 2026")
        #expect(m.categoryName(for: "nope") == "Unknown")
    }

    @Test func listsEveryBillSoonestDueFirst() async {
        let m = await model(api())
        #expect(m.rows.map(\.id) == ["e2", "e1", "e4", "e3"])
    }

    @Test func typeAndCategoryFiltersCombine() async {
        let m = await model(api())
        m.filter = .oneTime
        #expect(m.rows.map(\.id) == ["e3"])
        m.filter = .recurring
        #expect(m.rows.map(\.id) == ["e2", "e1", "e4"])
        m.category = "c1"
        #expect(m.rows.map(\.id) == ["e2", "e4"])
        m.filter = .all
        m.category = "c5"
        #expect(m.rows.map(\.id) == ["e3"])
        #expect(m.isFiltering)
        m.category = nil
        #expect(!m.isFiltering)
    }

    @Test func loadFailureShowsTheMessage() async {
        let api = api()
        api.moneyErrors["expenses"] = .message("Failed to load expenses")
        let m = await model(api)
        #expect(m.loadError == "Failed to load expenses")
        #expect(m.rows.isEmpty)
        api.moneyErrors["expenses"] = nil
        await m.load()
        #expect(m.loadError == nil)
        #expect(m.rows.count == 4)
    }

    @Test func offlineLoadUsesTheSharedOfflineText() async {
        let api = api()
        api.moneyErrors["expenses"] = .offline
        let m = await model(api)
        #expect(m.loadError == "You're offline. Check your connection and try again.")
    }

    @Test func anEndedSessionIsHandedToTheApp() async {
        let api = api()
        api.moneyErrors["expenses"] = .unauthorized
        let m = ExpensesModel(api: api)
        var ended = false
        m.onSessionEnded = { ended = true }
        await m.load()
        #expect(ended)
        #expect(m.loadError == nil)
    }

    // MARK: Form

    private func filled() -> ExpenseForm {
        var form = ExpenseForm(today: day(2026, 11, 1), locale: us)
        form.description = "Gym"
        form.amountText = "29.50"
        form.categoryID = "c4"
        return form
    }

    @Test func formNeedsDescriptionAmountAboveZeroAndACategory() {
        #expect(filled().draft() != nil)
        #expect(filled().canSave)
        var f = filled(); f.description = "   "
        #expect(f.draft() == nil && !f.canSave)
        f = filled(); f.amountText = ""
        #expect(f.draft() == nil)
        f = filled(); f.amountText = "0"
        #expect(f.draft() == nil)
        f = filled(); f.amountText = "-5"
        #expect(f.draft() == nil)
        f = filled(); f.amountText = "abc"
        #expect(f.draft() == nil)
        f = filled(); f.categoryID = nil
        #expect(f.draft() == nil)
    }

    @Test func newFormDefaultsLikeTheWeb() {
        let form = ExpenseForm(today: day(2026, 11, 1))
        #expect(form.frequency == .oneTime)
        #expect(form.interval == .monthly)
        #expect(form.nextDueDate == day(2026, 11, 1))
        #expect(!form.hasEndDate)
    }

    @Test func recurrenceIntervalIsNullForOneTime() throws {
        var f = filled()
        f.frequency = .oneTime
        f.interval = .weekly
        let one = try #require(f.draft())
        #expect(one.interval == nil)
        let oneJSON = String(decoding: try JSONEncoder().encode(one), as: UTF8.self)
        #expect(oneJSON.contains("\"recurrence_interval\":null"))
        f.frequency = .recurring
        let many = try #require(f.draft())
        #expect(many.interval == .weekly)
        let manyJSON = String(decoding: try JSONEncoder().encode(many), as: UTF8.self)
        #expect(manyJSON.contains("\"recurrence_interval\":\"weekly\""))
    }

    // MARK: Amounts by locale

    private let us = Locale(identifier: "en_US"), de = Locale(identifier: "de_DE")

    @Test func amountsParseWithTheLocalesSeparators() {
        #expect(AmountText.parse("1,234.50", locale: us) == 1234.5)
        #expect(AmountText.parse("12.50", locale: us) == 12.5)
        #expect(AmountText.parse("1,234", locale: us) == 1234)
        #expect(AmountText.parse("12,50", locale: de) == 12.5)
        #expect(AmountText.parse("1.234,50", locale: de) == 1234.5)
        #expect(AmountText.parse("1.234", locale: de) == 1234)
        #expect(AmountText.parse(" 40 ", locale: us) == 40)
    }

    @Test func amountsThatCantBeReadAreRejectedNotGuessed() {
        #expect(AmountText.parse("12,50", locale: us) == nil)
        #expect(AmountText.parse("12.50", locale: de) == nil)
        #expect(AmountText.parse("1,2,3", locale: us) == nil)
        #expect(AmountText.parse("1.2.3", locale: us) == nil)
        #expect(AmountText.parse("1,234,5", locale: us) == nil)
        #expect(AmountText.parse("abc", locale: us) == nil)
        #expect(AmountText.parse("", locale: us) == nil)
        #expect(AmountText.parse("-5", locale: us) == nil)
    }

    @Test func aVeryLongNumberIsRejectedNotReadAsInfinity() {
        let huge = String(repeating: "9", count: 400)
        #expect(AmountText.parse(huge, locale: us) == nil)
        #expect(AmountText.parse("\(huge).5", locale: us) == nil)
        var f = ExpenseForm(today: day(2026, 11, 1), locale: us)
        f.amountText = huge
        #expect(f.amount == nil)
    }

    @Test func formattedAmountsReadBackInEveryLocale() {
        for id in ["en_US", "de_DE", "fr_FR", "ar_EG", "fa_IR", "hi_IN", "bn_BD", "ar_SA"] {
            let locale = Locale(identifier: id)
            for value in [15.49, 1234.5, 40, 0.07] {
                let text = AmountText.format(value, locale: locale)
                #expect(AmountText.parse(text, locale: locale) == value, "\(id): \(text)")
            }
        }
    }

    @Test func nativeDigitsAreReadToo() {
        let ar = Locale(identifier: "ar_EG")
        let point = ar.decimalSeparator ?? "."
        #expect(AmountText.parse("١٢\(point)٥", locale: ar) == 12.5)
        #expect(AmountText.parse("12\(point)5", locale: ar) == 12.5)
    }

    @Test func formReadsItsAmountInTheFormsLocale() {
        var f = ExpenseForm(today: day(2026, 11, 1), locale: de)
        f.amountText = "12,50"
        #expect(f.amount == 12.5)
        f.amountText = "1250,5"
        #expect(f.amount == 1250.5)
        f.amountText = "12.50"
        #expect(f.amount == nil)
    }

    @Test func editingPrefillsTheAmountInTheFormsLocale() {
        let b = bill("e1", "x", amount: 15.49)
        #expect(ExpenseForm(editing: b, locale: de).amountText == "15,49")
        #expect(ExpenseForm(editing: b, locale: us).amountText == "15.49")
        #expect(ExpenseForm(editing: bill("e2", "x", amount: 1234.5), locale: de).amountText == "1234,5")
    }

    @Test func draftCarriesTrimmedTextAmountAndEndDate() throws {
        var f = filled()
        f.description = "  Gym  "
        f.friendlyName = " The gym "
        f.amountText = "1,029.5"  // the test form is en_US
        f.hasEndDate = true
        f.endDate = day(2027, 3, 1)
        let draft = try #require(f.draft())
        #expect(draft.description == "Gym")
        #expect(draft.friendlyName == "The gym")
        #expect(draft.amount == 1029.5)
        #expect(draft.endDate == day(2027, 3, 1))
        f.hasEndDate = false
        #expect(f.draft()?.endDate == nil)
    }

    @Test func editingFillsTheFormFromTheBill() {
        let netflix = bill("e1", "NETFLIX.COM", friendly: "Netflix", amount: 15.49, due: day(2026, 11, 6))
        let form = ExpenseForm(editing: netflix, locale: us)
        #expect(form.description == "NETFLIX.COM")
        #expect(form.friendlyName == "Netflix")
        #expect(form.amountText == "15.49")
        #expect(form.categoryID == "c4")
        #expect(form.frequency == .recurring && form.interval == .monthly)
        #expect(form.nextDueDate == day(2026, 11, 6))
        #expect(!form.hasEndDate)
        let ending = ExpenseForm(editing: bill("x", "x", amount: 40, due: day(2026, 11, 6), end: day(2027, 1, 1)), locale: us)
        #expect(ending.hasEndDate && ending.endDate == day(2027, 1, 1))
        #expect(ending.amountText == "40")
    }

    // MARK: Save and delete

    @Test func saveCreatesAndListsTheBill() async throws {
        let api = api([])
        let m = await model(api)
        let draft = try #require(filled().draft())
        let message = await m.save(draft, id: nil)
        #expect(message == nil)
        #expect(api.calls.contains("saveExpense(new, Gym)"))
        #expect(m.rows.map(\.title) == ["Gym"])
    }

    @Test func saveUpdatesTheBillInPlace() async throws {
        let api = api()
        let m = await model(api)
        var form = ExpenseForm(editing: m.expenses.first { $0.id == "e2" }!, locale: us)
        form.description = "Rent (new lease)"
        let message = await m.save(try #require(form.draft()), id: "e2")
        #expect(message == nil)
        #expect(api.calls.contains("saveExpense(e2, Rent (new lease))"))
        #expect(m.rows.count == 4)
        #expect(m.rows.first { $0.id == "e2" }?.title == "Rent (new lease)")
    }

    @Test func failedSaveReturnsTheServerTextAndChangesNothing() async throws {
        let api = api()
        let m = await model(api)
        api.moneyErrors["saveExpense"] = .message("Validation failed")
        let message = await m.save(try #require(filled().draft()), id: nil)
        #expect(message == "Validation failed")
        #expect(m.rows.count == 4)
        api.moneyErrors["saveExpense"] = .offline
        let offline = await m.save(try #require(filled().draft()), id: nil)
        #expect(offline == "You're offline. Check your connection and try again.")
    }

    @Test func deleteConfirmationNamesTheBill() {
        #expect(ExpensesModel.deleteMessage(for: bill("e1", "NETFLIX.COM", friendly: "Netflix"))
                == "Are you sure you want to delete \"Netflix\"? This action cannot be undone.")
        #expect(ExpensesModel.deleteMessage(for: bill("e2", "Rent"))
                == "Are you sure you want to delete \"Rent\"? This action cannot be undone.")
    }

    @Test func deleteRemovesTheBill() async {
        let api = api()
        let m = await model(api)
        let message = await m.delete(m.expenses.first { $0.id == "e3" }!)
        #expect(message == nil)
        #expect(api.calls.contains("deleteExpense(e3)"))
        #expect(m.rows.map(\.id) == ["e2", "e1", "e4"])
    }

    @Test func failedDeleteShowsTheServerTextAndKeepsTheBill() async {
        let api = api()
        let m = await model(api)
        api.moneyErrors["deleteExpense"] = .message("Cannot delete: expense is linked to a transaction")
        let message = await m.delete(m.expenses.first { $0.id == "e3" }!)
        #expect(message == "Cannot delete: expense is linked to a transaction")
        #expect(m.rows.count == 4)
    }
}
