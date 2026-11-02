import Foundation

public enum StatementStatus: String, Decodable, Sendable {
    case uploaded, processing, parsed, failed
}

/// Why a statement failed: the server's text and the step it failed at.
public struct StatementFailure: Sendable, Equatable {
    /// `parsed_data.error`.
    public let reason: String
    /// `parsed_data.failed_step`.
    public let step: String?
    public let retryCount: Int

    public init(reason: String, step: String? = nil, retryCount: Int = 0) {
        self.reason = reason
        self.step = step
        self.retryCount = retryCount
    }
}

/// A row of `GET /api/bank-statements`. The server has no file name or error text.
public struct Statement: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let status: StatementStatus
    /// "pdf" or "csv".
    public let fileType: String
    public let bankName: String?
    public let accountLabel: String?
    public let createdAt: Date
    /// `parsed_data.pipeline_step`, when the server reports progress.
    public let pipelineStep: String?
    /// A multi-month CSV the server split into one statement per month (`parsed_data.is_parent_split`).
    public let isParentSplit: Bool
    /// `parsed_data.child_count` for a split statement.
    public let childCount: Int?
    /// The month the statement covers (`statement_month`); nil until the server knows it.
    public let statementMonth: Month?
    /// A statement for a household account (`is_shared_account`).
    public let isShared: Bool
    /// Set when `status` is `.failed`: `parsed_data.error` with the step it failed at.
    public let failure: StatementFailure?
    /// `parsed_data.retry_count`: how many times the server has retried it so far.
    public let retryCount: Int

    public init(id: String, status: StatementStatus, fileType: String, bankName: String? = nil,
                accountLabel: String? = nil, createdAt: Date, pipelineStep: String? = nil,
                isParentSplit: Bool = false, childCount: Int? = nil, statementMonth: Month? = nil,
                isShared: Bool = false, failure: StatementFailure? = nil, retryCount: Int = 0) {
        self.statementMonth = statementMonth
        self.isShared = isShared
        self.failure = failure
        self.retryCount = retryCount
        self.isParentSplit = isParentSplit
        self.childCount = childCount
        self.id = id
        self.status = status
        self.fileType = fileType
        self.bankName = bankName
        self.accountLabel = accountLabel
        self.createdAt = createdAt
        self.pipelineStep = pipelineStep
    }

    enum CodingKeys: String, CodingKey {
        case id, status
        case fileType = "file_type"
        case bankName = "bank_name"
        case accountLabel = "account_label"
        case createdAt = "created_at"
        case parsedData = "parsed_data"
        case statementMonth = "statement_month"
        case isShared = "is_shared_account"
    }

    private struct ParsedData: Decodable {
        let pipelineStep: String?
        let isParentSplit: Bool?
        let childCount: Int?
        let error: String?
        let failedStep: String?
        let retryCount: Int?
        enum CodingKeys: String, CodingKey {
            case error
            case failedStep = "failed_step"
            case retryCount = "retry_count"
            case pipelineStep = "pipeline_step"
            case isParentSplit = "is_parent_split"
            case childCount = "child_count"
        }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decode(StatementStatus.self, forKey: .status)
        fileType = try c.decode(String.self, forKey: .fileType)
        bankName = try c.decodeIfPresent(String.self, forKey: .bankName)
        accountLabel = try c.decodeIfPresent(String.self, forKey: .accountLabel)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        // parsed_data is an arbitrary object (or null); tolerate any shape.
        let parsed = try? c.decodeIfPresent(ParsedData.self, forKey: .parsedData)
        pipelineStep = parsed?.pipelineStep
        isParentSplit = parsed?.isParentSplit ?? false
        childCount = parsed?.childCount
        retryCount = parsed?.retryCount ?? 0
        if status == .failed {
            failure = StatementFailure(reason: parsed?.error ?? "", step: parsed?.failedStep, retryCount: retryCount)
        } else {
            failure = nil
        }
        // A plain date or a timestamp: only the year and month matter.
        statementMonth = (try? c.decodeIfPresent(String.self, forKey: .statementMonth)).flatMap { $0 }
            .flatMap { Month(apiString: String($0.prefix(10))) }
        isShared = try c.decodeIfPresent(Bool.self, forKey: .isShared) ?? false
    }
}
