import Foundation

public enum StatementStatus: String, Decodable, Sendable {
    case uploaded, processing, parsed, failed
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

    public init(id: String, status: StatementStatus, fileType: String, bankName: String? = nil,
                accountLabel: String? = nil, createdAt: Date, pipelineStep: String? = nil,
                isParentSplit: Bool = false, childCount: Int? = nil) {
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
    }

    private struct ParsedData: Decodable {
        let pipelineStep: String?
        let isParentSplit: Bool?
        let childCount: Int?
        enum CodingKeys: String, CodingKey {
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
    }
}
