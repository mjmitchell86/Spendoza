import Foundation
import Testing
@testable import SpendozaKit

/// Shares `APIClientTests`' suite: the `StubURLProtocol` handler is process-wide.
extension APIClientTests {
    private static let expenseBody = """
    {"id":"e1","user_id":"u1","category_id":"c1","description":"NETFLIX.COM","friendly_name":"Netflix","amount":15.49,
     "frequency":"recurring","recurrence_interval":"monthly","next_due_date":"2026-11-14","end_date":null,
     "is_ai_adjusted":true,"original_amount":14.99,"auto_detected":true}
    """

    private static let incomeBody = """
    {"id":"i1","user_id":"u1","attributed_to_user_id":"u2","attributed_to_name":"Bo","source_name":"Acme payroll",
     "friendly_name":null,"amount":2400,"frequency":"biweekly","effective_date":"2026-10-02","end_date":null,
     "auto_detected":false,"is_ai_suggested":true}
    """

    private func day(_ year: Int, _ month: Int, _ day: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day))!
    }

    // MARK: bills

    @Test func expensesDecode() async throws {
        let log = stub(body: "[\(Self.expenseBody)]")
        let bills = try await client().expenses()
        #expect(log.all.first?.method == "GET")
        #expect(log.all.first?.path == "/api/expenses")
        let bill = try #require(bills.first)
        #expect(bill.id == "e1")
        #expect(bill.categoryID == "c1")
        #expect(bill.friendlyName == "Netflix")
        #expect(bill.amount == 15.49)
        #expect(bill.frequency == .recurring)
        #expect(bill.interval == .monthly)
        #expect(bill.nextDueDate == day(2026, 11, 14))
        #expect(bill.endDate == nil)
        #expect(bill.autoDetected)
        #expect(bill.isAIAdjusted)
        #expect(bill.originalAmount == 14.99)
    }

    @Test func upcomingBillsAskForRecurringFromTheDate() async throws {
        let log = stub(body: "[]")
        _ = try await client().upcomingBills(from: day(2026, 11, 1))
        #expect(log.all.first?.path == "/api/expenses")
        #expect(log.all.first?.query == ["frequency": "recurring", "from_date": "2026-11-01"])
    }

    @Test func recurringBillDraftSendsItsIntervalAndNullsEmptyOptionals() async throws {
        let log = stub(status: 201, body: Self.expenseBody)
        let draft = ExpenseDraft(categoryID: "c1", description: "NETFLIX.COM", friendlyName: "  ", amount: 15.49,
                                 frequency: .recurring, interval: .monthly, nextDueDate: day(2026, 11, 14))
        let saved = try await client().saveExpense(draft, id: nil)
        let sent = try #require(log.all.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/api/expenses")
        let json = try #require(sent.json as? [String: Any])
        #expect(json["category_id"] as? String == "c1")
        #expect(json["description"] as? String == "NETFLIX.COM")
        #expect(json["amount"] as? Double == 15.49)
        #expect(json["frequency"] as? String == "recurring")
        #expect(json["recurrence_interval"] as? String == "monthly")
        #expect(json["next_due_date"] as? String == "2026-11-14")
        #expect(json["friendly_name"] is NSNull)
        #expect(json["end_date"] is NSNull)
        #expect(saved.id == "e1")
    }

    @Test func oneTimeBillDraftOmitsTheInterval() async throws {
        let log = stub(body: Self.expenseBody)
        let draft = ExpenseDraft(categoryID: "c1", description: "Plumber", friendlyName: " Plumber visit ", amount: 120,
                                 frequency: .oneTime, interval: .monthly, nextDueDate: day(2026, 12, 1), endDate: day(2026, 12, 31))
        _ = try await client().saveExpense(draft, id: "e1")
        let sent = try #require(log.all.first)
        #expect(sent.method == "PUT")
        #expect(sent.path == "/api/expenses/e1")
        let json = try #require(sent.json as? [String: Any])
        #expect(json["frequency"] as? String == "one_time")
        #expect(json["recurrence_interval"] == nil)
        #expect(json["friendly_name"] as? String == "Plumber visit")
        #expect(json["end_date"] as? String == "2026-12-31")
    }

    @Test func deleteExpenseAccepts204() async throws {
        let log = stub(status: 204, body: "")
        try await client().deleteExpense(id: "e1")
        #expect(log.all.first?.method == "DELETE")
        #expect(log.all.first?.path == "/api/expenses/e1")
    }

    // MARK: income

    @Test func incomeEntriesDecode() async throws {
        let log = stub(body: "[\(Self.incomeBody)]")
        let entries = try await client().incomeEntries()
        #expect(log.all.first?.method == "GET")
        #expect(log.all.first?.path == "/api/income")
        let entry = try #require(entries.first)
        #expect(entry.ownerID == "u1")
        #expect(entry.sourceName == "Acme payroll")
        #expect(entry.frequency == .biweekly)
        #expect(entry.effectiveDate == day(2026, 10, 2))
        #expect(entry.attributedToUserID == "u2")
        #expect(entry.attributedToName == "Bo")
        #expect(entry.aiSuggested)
        #expect(!entry.autoDetected)
    }

    @Test func incomeDraftCarriesTheAttributedUser() async throws {
        let log = stub(status: 201, body: Self.incomeBody)
        let draft = IncomeDraft(sourceName: "Acme payroll", amount: 2400, frequency: .biweekly,
                                effectiveDate: day(2026, 10, 2), attributedToUserID: "u2", attributedToName: "Bo")
        _ = try await client().saveIncome(draft, id: nil)
        let sent = try #require(log.all.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/api/income")
        let json = try #require(sent.json as? [String: Any])
        #expect(json["source_name"] as? String == "Acme payroll")
        #expect(json["frequency"] as? String == "biweekly")
        #expect(json["effective_date"] as? String == "2026-10-02")
        #expect(json["attributed_to_user_id"] as? String == "u2")
        #expect(json["attributed_to_name"] as? String == "Bo")
        #expect(json["friendly_name"] is NSNull)
        #expect(json["end_date"] is NSNull)
    }

    @Test func updateIncomeUsesPutAndDeleteUsesDelete() async throws {
        let log = stub(body: Self.incomeBody)
        _ = try await client().saveIncome(IncomeDraft(sourceName: "Acme", amount: 1, frequency: .oneTime, effectiveDate: day(2026, 10, 2)), id: "i1")
        #expect(log.all.first?.method == "PUT")
        #expect(log.all.first?.path == "/api/income/i1")
        stub(status: 204, body: "")
        try await client().deleteIncome(id: "i1")
    }

    @Test func attributingToSomeoneOutsideTheHouseholdPassesTheServerTextThrough() async {
        stub(status: 403, body: #"{"error":"Attributed user is not in your household"}"#)
        let draft = IncomeDraft(sourceName: "Acme", amount: 1, frequency: .monthly, effectiveDate: Date(), attributedToUserID: "x")
        await expectError(.message("Attributed user is not in your household")) { try await client().saveIncome(draft, id: nil) }
    }

    // MARK: categories

    @Test func createCategorySendsNameClassAndSharing() async throws {
        let log = stub(status: 201, body: #"{"id":"c9","name":"Pets","budget_class":"want","is_shared_with_household":true,"is_system_default":false}"#)
        let made = try await client().createCategory(name: "Pets", budgetClass: .want, shared: true)
        let sent = try #require(log.all.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/api/categories")
        let json = try #require(sent.json as? [String: Any])
        #expect(json["name"] as? String == "Pets")
        #expect(json["budget_class"] as? String == "want")
        #expect(json["is_shared_with_household"] as? Bool == true)
        #expect(made.id == "c9")
        #expect(!made.isSystemDefault)
    }

    @Test func updateCategorySendsNameAndClass() async throws {
        let log = stub(body: #"{"id":"c9","name":"Pet care","budget_class":"need","is_system_default":true}"#)
        let updated = try await client().updateCategory(id: "c9", name: "Pet care", budgetClass: .need)
        #expect(log.all.first?.method == "PUT")
        #expect(log.all.first?.path == "/api/categories/c9")
        #expect(log.all.first?.json as? [String: String] == ["name": "Pet care", "budget_class": "need"])
        #expect(updated.isSystemDefault)
    }

    @Test func deletingADefaultCategoryShowsTheServerText() async {
        stub(status: 403, body: #"{"error":"Default categories cannot be deleted"}"#)
        await expectError(.message("Default categories cannot be deleted")) { try await client().deleteCategory(id: "c1") }
    }

    @Test func deleteCategoryAccepts204() async throws {
        let log = stub(status: 204, body: "")
        try await client().deleteCategory(id: "c9")
        #expect(log.all.first?.method == "DELETE")
        #expect(log.all.first?.path == "/api/categories/c9")
    }

    @Test func categoriesDecodeTheDefaultFlag() throws {
        let json = #"{"id":"c1","name":"Other","budget_class":"other","is_system_default":true}"#
        #expect(try APICoding.makeDecoder().decode(BudgetCategory.self, from: Data(json.utf8)).isSystemDefault)
        let plain = #"{"id":"c1","name":"Other","budget_class":"other"}"#
        #expect(try !APICoding.makeDecoder().decode(BudgetCategory.self, from: Data(plain.utf8)).isSystemDefault)
    }

    // MARK: report refresh

    @Test func generateReportPostsTheMonth() async throws {
        let log = stub(body: "{}")
        try await client().generateReport(Month(year: 2026, month: 9))
        #expect(log.all.first?.method == "POST")
        #expect(log.all.first?.path == "/api/reports/generate")
        #expect(log.all.first?.json as? [String: String] == ["month": "2026-09-01"])
    }

    @Test func generateReportRateLimitShowsTheServerText() async {
        stub(status: 429, body: #"{"error":"Report generation limit reached (2 per 24 hours)"}"#)
        await expectError(.message("Report generation limit reached (2 per 24 hours)")) {
            try await client().generateReport(Month(year: 2026, month: 9))
        }
    }

    // MARK: attribution

    @Test func attributeSendsTheUser() async throws {
        let log = stub(body: "{}")
        try await client().attribute(transactionID: "t1", to: "u2")
        #expect(log.all.first?.method == "PUT")
        #expect(log.all.first?.path == "/api/transactions/t1/attribute")
        #expect(log.all.first?.json as? [String: String] == ["attributed_to_user_id": "u2"])
    }

    @Test func attributeRefusalPassesTheServerTextThrough() async {
        stub(status: 403, body: #"{"error":"Attributed user is not in your household"}"#)
        await expectError(.message("Attributed user is not in your household")) {
            try await client().attribute(transactionID: "t1", to: "x")
        }
    }

    @Test func bulkAttributeMapsEachResultToItsError() async throws {
        let log = stub(body: """
        {"results":[{"transaction_id":"t1","success":true},
                    {"transaction_id":"t2","success":false,"error":"Failed to update transaction"}]}
        """)
        let results = try await client().bulkAttribute([("t1", "u2"), ("t2", "u2")])
        let sent = try #require(log.all.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/api/transactions/bulk-attribute")
        let attributions = try #require((sent.json as? [String: Any])?["attributions"] as? [[String: String]])
        #expect(attributions == [["transaction_id": "t1", "attributed_to_user_id": "u2"],
                                 ["transaction_id": "t2", "attributed_to_user_id": "u2"]])
        #expect(results.count == 2)
        #expect(results["t1"] == .some(nil))
        #expect(results["t2"] == .some("Failed to update transaction"))
    }

    // MARK: statements and transactions

    @Test func failedStatementDecodesItsReason() throws {
        let json = """
        {"id":"s1","status":"failed","file_type":"pdf","bank_name":"Chase","statement_month":"2026-09-01","is_shared_account":true,
         "account_label":"Joint","created_at":"2026-10-29T12:00:00Z",
         "parsed_data":{"error":"Could not read the PDF","failed_step":"extract_text","retry_count":2}}
        """
        let statement = try APICoding.makeDecoder().decode(Statement.self, from: Data(json.utf8))
        #expect(statement.failure == StatementFailure(reason: "Could not read the PDF", step: "extract_text", retryCount: 2))
        #expect(statement.statementMonth == Month(year: 2026, month: 9))
        #expect(statement.isShared)
        #expect(statement.accountLabel == "Joint")
    }

    @Test func processingStatementDecodesItsRetryCount() throws {
        let json = """
        {"id":"s2","status":"processing","file_type":"csv","created_at":"2026-10-29T12:00:00Z",
         "parsed_data":{"pipeline_step":"categorize","retry_count":1}}
        """
        let statement = try APICoding.makeDecoder().decode(Statement.self, from: Data(json.utf8))
        #expect(statement.failure == nil)
        #expect(statement.retryCount == 1)
        #expect(statement.pipelineStep == "categorize")
        #expect(statement.statementMonth == nil)
        #expect(!statement.isShared)
    }

    @Test func parsedStatementWithNoParsedDataHasNoFailure() throws {
        let json = #"{"id":"s3","status":"parsed","file_type":"pdf","created_at":"2026-10-29T12:00:00Z","parsed_data":null,"statement_month":null}"#
        let statement = try APICoding.makeDecoder().decode(Statement.self, from: Data(json.utf8))
        #expect(statement.failure == nil)
        #expect(statement.retryCount == 0)
    }

    @Test func transactionDecodesItsStatementAndAssignee() throws {
        let json = #"{"id":"t1","date":"2026-10-03","description":"Coffee","amount":4.5,"type":"debit","ai_category":null,"bank_statement_id":"s9","attributed_to_user_id":"u2"}"#
        let row = try APICoding.makeDecoder().decode(Transaction.self, from: Data(json.utf8))
        #expect(row.statementID == "s9")
        #expect(row.attributedTo == "u2")
    }

    @Test func sharedUploadSendsTheSharedFlagAndLabel() async throws {
        let log = stub(status: 201, body: #"{"id":"s9","file_type":"pdf","status":"uploaded","created_at":"2026-10-29T12:00:00Z"}"#)
        let url = try tempFile(bytes: 64)
        _ = try await client().uploadStatement(fileURL: url, mimeType: "application/pdf", bankName: "Chase", shared: true, accountLabel: "  Joint checking ")
        let text = String(decoding: try #require(log.all.first).body, as: UTF8.self)
        #expect(text.contains(#"name="is_shared_account""#))
        #expect(text.contains("\r\n\r\ntrue\r\n"))
        #expect(text.contains(#"name="account_label""#))
        #expect(text.contains("\r\n\r\nJoint checking\r\n"))
    }

    @Test func personalUploadSendsSharedFalseAndNoLabel() async throws {
        let log = stub(status: 201, body: #"{"id":"s9","file_type":"pdf","status":"uploaded","created_at":"2026-10-29T12:00:00Z"}"#)
        let url = try tempFile(bytes: 64)
        _ = try await client().uploadStatement(fileURL: url, mimeType: "application/pdf", bankName: nil)
        let text = String(decoding: try #require(log.all.first).body, as: UTF8.self)
        #expect(text.contains(#"name="is_shared_account""#))
        #expect(text.contains("\r\n\r\nfalse\r\n"))
        #expect(!text.contains("account_label"))
    }
}
