import Charts
import SpendozaKit
import SwiftUI

/// The admin dashboard: platform totals, signups and activity charts, and LLM token usage.
struct AdminDashboardView: View {
    @State private var model: AdminDashboardModel
    @Environment(\.dynamicTypeSize) private var typeSize

    let api: any SpendozaAPI
    /// The signed-in admin's id, so the Users screens don't offer deleting yourself.
    let selfID: String?

    init(api: any SpendozaAPI, selfID: String?) {
        self.api = api
        self.selfID = selfID
        _model = State(initialValue: AdminDashboardModel(api: api))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Admin")
                        .font(.serif(28, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("Usage, users and reports across Spendoza.")
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.soft)
                }
                if let error = model.error {
                    Text(error)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.oxblood)
                        .accessibilityLabel("Error: \(error)")
                } else if model.stats == nil {
                    Text("Loading…")
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                }
                if !model.tiles.isEmpty { tileGrid }
                NavigationLink {
                    AdminUsersView(api: api, selfID: selfID)
                } label: {
                    MeRowLabel(title: "Users", glyph: "›")
                }
                .buttonStyle(.plain)
                .topRule()
                if let trends = model.trends {
                    SignupsChart(points: model.signups)
                    ActivityChart(series: model.activitySeries)
                    LLMUsageSection(rows: trends.llmStats)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
    }

    private var tileGrid: some View {
        let columns = typeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.flexible(), spacing: 16, alignment: .top), GridItem(.flexible(), alignment: .top)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 0) {
            ForEach(model.tiles, id: \.title) { tile in
                VStack(alignment: .leading, spacing: 4) {
                    Text(tile.title)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                    Text(tile.value)
                        .font(.serif(28, relativeTo: .title))
                        .foregroundStyle(Theme.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    if let detail = tile.detail {
                        Text(detail)
                            .font(.sans(13, relativeTo: .footnote))
                            .foregroundStyle(Theme.soft)
                    }
                }
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .topRule()
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: Charts

/// About six month labels, three at the larger text sizes so they don't run together.
private func axisMonths(_ months: [String], size: DynamicTypeSize) -> [String] {
    let labels = size >= .xLarge ? 3.0 : 6.0
    let step = max(1, Int((Double(months.count) / labels).rounded(.up)))
    return months.enumerated().filter { $0.offset % step == 0 }.map(\.element)
}

private struct ChartBlock<Content: View>: View {
    let title: String
    let summary: String
    @ViewBuilder var chart: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.serif(20, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            chart
                .frame(height: 200)
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(title) chart")
                .accessibilityValue(summary)
        }
    }
}

private func axisLabel(_ value: AxisValue, showing shown: [String]) -> some AxisMark {
    AxisValueLabel {
        if let key = value.as(String.self), shown.contains(key) {
            Text(AdminDashboardModel.monthLabel(key))
                .font(.sans(12, relativeTo: .caption))
                .foregroundStyle(Theme.soft)
        }
    }
}

private struct SignupsChart: View {
    let points: [(month: String, count: Int)]
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ChartBlock(title: "User signups", summary: summary) {
            Chart(Array(points.enumerated()), id: \.offset) { _, point in
                LineMark(x: .value("Month", point.month), y: .value("New users", point.count))
                    .foregroundStyle(Theme.note)
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Month", point.month), y: .value("New users", point.count))
                    .foregroundStyle(Theme.note)
                    .symbolSize(24)
            }
            .chartXAxis {
                AxisMarks(values: points.map(\.month)) { axisLabel($0, showing: axisMonths(points.map(\.month), size: typeSize)) }
            }
            .chartYAxis {
                AxisMarks { _ in
                    AxisGridLine().foregroundStyle(Theme.engraving)
                    AxisValueLabel().font(.sans(12, relativeTo: .caption)).foregroundStyle(Theme.soft)
                }
            }
        }
    }

    private var summary: String {
        guard let last = points.last else { return "No data" }
        let total = points.reduce(0) { $0 + $1.count }
        return "\(AdminDashboardModel.number(total)) new users over \(points.count) months. "
            + "\(AdminDashboardModel.monthLabel(last.month)): \(AdminDashboardModel.number(last.count))."
    }
}

private struct ActivityChart: View {
    let series: [(month: String, metric: String, count: Int)]
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var displayScale

    private var months: [String] { Array(NSOrderedSet(array: series.map(\.month))) as? [String] ?? [] }

    /// Transactions and reports are solid; emails are the engraved hatch, so the series differ by pattern, not only colour.
    private func style(_ metric: String) -> AnyShapeStyle {
        switch metric {
        case "transactions": AnyShapeStyle(Theme.note)
        case "reports": AnyShapeStyle(Theme.amber)
        default: AnyShapeStyle(hatch)
        }
    }

    /// Diagonal `ink` lines over `card`, rendered once per scheme into a repeating tile (3:1 against the paper).
    private var hatch: ImagePaint {
        let tile = Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.card))
            var path = Path()
            for offset in stride(from: -size.height, through: size.width, by: 3) {
                path.move(to: CGPoint(x: offset, y: size.height))
                path.addLine(to: CGPoint(x: offset + size.height, y: 0))
            }
            context.stroke(path, with: .color(Theme.ink), lineWidth: 1.5)
        }
        .frame(width: 6, height: 6)
        .environment(\.colorScheme, scheme)
        let renderer = ImageRenderer(content: tile)
        renderer.scale = displayScale
        guard let image = renderer.uiImage else { return ImagePaint(image: Image(uiImage: UIImage())) }
        return ImagePaint(image: Image(uiImage: image), scale: 1 / displayScale)
    }

    var body: some View {
        ChartBlock(title: "Activity trends", summary: summary) {
            VStack(alignment: .leading, spacing: 8) {
                Chart(Array(series.enumerated()), id: \.offset) { _, point in
                    BarMark(x: .value("Month", point.month), y: .value("Count", point.count))
                        .position(by: .value("Metric", point.metric))
                        .foregroundStyle(by: .value("Metric", point.metric))
                }
                .chartForegroundStyleScale(domain: AdminDashboardModel.activityMetrics,
                                           range: AdminDashboardModel.activityMetrics.map(style))
                .chartLegend(.hidden)
                .chartXAxis {
                    AxisMarks(values: months) { axisLabel($0, showing: axisMonths(months, size: typeSize)) }
                }
                .chartYAxis {
                    AxisMarks { _ in
                        AxisGridLine().foregroundStyle(Theme.engraving)
                        AxisValueLabel().font(.sans(12, relativeTo: .caption)).foregroundStyle(Theme.soft)
                    }
                }
                legend
            }
        }
    }

    private var legend: some View {
        let items = ForEach(AdminDashboardModel.activityMetrics, id: \.self) { metric in
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 1).fill(style(metric)).frame(width: 12, height: 12)
                    .overlay(RoundedRectangle(cornerRadius: 1).strokeBorder(Theme.ink.opacity(metric == "emails" ? 1 : 0), lineWidth: 0.5))
                Text(metric.capitalized)
                    .font(.sans(12, relativeTo: .caption))
                    .foregroundStyle(Theme.soft)
                    .fixedSize()
            }
        }
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 16) { items }
            VStack(alignment: .leading, spacing: 6) { items }
        }
        .accessibilityHidden(true)
    }

    private var summary: String {
        guard let month = series.last?.month else { return "No data" }
        let parts = series.filter { $0.month == month }.map { "\(AdminDashboardModel.number($0.count)) \($0.metric)" }
        return "\(AdminDashboardModel.monthLabel(month)): " + parts.joined(separator: ", ") + "."
    }
}

// MARK: LLM usage

private struct LLMUsageSection: View {
    let rows: [AdminTrends.LLMStat]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("LLM token usage")
                .font(.serif(20, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
            if rows.isEmpty {
                Text("No LLM calls in this period.")
                    .font(.sans(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        RuledRow {
                            VStack(alignment: .leading, spacing: 6) {
                                ViewThatFits(in: .horizontal) {
                                    HStack(alignment: .firstTextBaseline) {
                                        month(row)
                                        callType(row)
                                        Spacer(minLength: 8)
                                        cost(row)
                                    }
                                    VStack(alignment: .leading, spacing: 2) {
                                        month(row)
                                        callType(row)
                                        cost(row)
                                    }
                                }
                                .foregroundStyle(Theme.ink)
                                Text(detail(row))
                                    .font(.sans(13, relativeTo: .footnote))
                                    .foregroundStyle(Theme.soft)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .topRule()
            }
        }
    }

    private func month(_ r: AdminTrends.LLMStat) -> some View {
        Text(AdminDashboardModel.monthYearLabel(r.month)).font(.sans(16, weight: .semibold, relativeTo: .body)).fixedSize()
    }

    private func callType(_ r: AdminTrends.LLMStat) -> some View {
        Text(r.callType).font(.sans(16, relativeTo: .body)).fixedSize(horizontal: false, vertical: true)
    }

    private func cost(_ r: AdminTrends.LLMStat) -> some View {
        Text(AdminDashboardModel.cost(r.totalCost))
            .font(.sans(16, relativeTo: .body))
            .fixedSize()
            .accessibilityLabel("Estimated cost \(AdminDashboardModel.cost(r.totalCost))")
    }

    private func detail(_ r: AdminTrends.LLMStat) -> String {
        let n = AdminDashboardModel.number
        return "\(n(r.callCount)) calls · \(n(r.totalTokens)) tokens · avg \(n(r.avgTokens)) · min \(n(r.minTokens)) · max \(n(r.maxTokens))"
    }
}
