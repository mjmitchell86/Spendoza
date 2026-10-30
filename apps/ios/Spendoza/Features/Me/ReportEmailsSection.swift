import SpendozaKit
import SwiftUI

/// Wording for the weekly report schedule.
enum ReportSchedule {
    /// 0 → "12 AM", 12 → "12 PM", 13 → "1 PM".
    static func hourLabel(_ hour: Int) -> String {
        let twelve = hour % 12 == 0 ? 12 : hour % 12
        return "\(twelve) \(hour < 12 ? "AM" : "PM")"
    }

    static func summary(day: Weekday, hour: Int, timezone: String?) -> String {
        let zone = timezone.map { " (\($0))" } ?? ""
        return "Receive your report every \(day.title) at \(hourLabel(hour))\(zone)"
    }

    /// Whether the build talks to the test API (its host starts with `test-`), where "Send test email" is offered.
    static var isTestAPI: Bool {
        let base = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String
        return base.flatMap { URL(string: $0)?.host }?.hasPrefix("test-") ?? false
    }
}

/// The Reports section of Me: the weekly email schedule and the PDF reports row. The controls show the model's
/// saved profile, so a failed change leaves them (or snaps them back) at the saved values.
struct ReportsSection: View {
    let model: MeModel
    let api: any SpendozaAPI
    var offersTestEmail = ReportSchedule.isTestAPI
    /// The last failure of a change made here (the header shows `model.error`, so it is moved out of there).
    @State private var failure: String?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var profile: Profile? { model.profile }

    var body: some View {
        MeSection(title: "Reports") {
            RuledRow {
                VStack(alignment: .leading, spacing: 4) {
                    Toggle("Weekly email reports", isOn: Binding(
                        get: { profile?.emailReportsEnabled ?? false },
                        set: { on in save(ProfileChange(emailReportsEnabled: on)) }))
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.note)
                    Text("Receive your Spendoza financial report via email")
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
            }
            if let profile, profile.emailReportsEnabled {
                RuledRow {
                    pickerLayout {
                        Text("Day").font(.sans(16, relativeTo: .body)).foregroundStyle(Theme.ink)
                        if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
                        Picker("Day", selection: Binding(
                            get: { profile.emailReportDay },
                            set: { save(ProfileChange(emailReportDay: $0)) })) {
                            ForEach(Weekday.allCases, id: \.self) { Text($0.title).tag($0) }
                        }
                        .pickerStyle(.menu)
                        .tint(Theme.note)
                    }
                }
                RuledRow {
                    pickerLayout {
                        Text("Time").font(.sans(16, relativeTo: .body)).foregroundStyle(Theme.ink)
                        if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
                        Picker("Time", selection: Binding(
                            get: { profile.emailReportHour },
                            set: { save(ProfileChange(emailReportHour: $0)) })) {
                            ForEach(0..<24, id: \.self) { Text(ReportSchedule.hourLabel($0)).tag($0) }
                        }
                        .pickerStyle(.menu)
                        .tint(Theme.note)
                    }
                }
                RuledRow {
                    Text(ReportSchedule.summary(day: profile.emailReportDay, hour: profile.emailReportHour,
                                                timezone: profile.timezone))
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
            }
            if offersTestEmail { testEmail }
            if let failure {
                RuledRow {
                    Text(failure)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.oxblood)
                        .accessibilityLabel("Error: \(failure)")
                }
            }
            NavigationLink {
                PDFReportsView(api: api)
            } label: {
                MeRowLabel(title: "PDF reports", glyph: "›")
            }
            .buttonStyle(.plain)
        }
    }

    /// Label beside the picker; stacked at accessibility sizes, where the value would otherwise wrap letter by letter.
    private var pickerLayout: AnyLayout {
        typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                                     : AnyLayout(HStackLayout())
    }

    private var testEmail: some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 8) {
                Text("Send yourself a report email now to verify the email pipeline.")
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                HStack(spacing: 12) {
                    Button(model.isSendingTestEmail ? "Sending…" : "Send test email") {
                        failure = nil
                        Task {
                            await model.sendTestEmail()
                            moveError()
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(model.isSendingTestEmail)
                    if model.testEmailSent {
                        Text("Email sent")
                            .font(.sans(14, relativeTo: .subheadline))
                            .foregroundStyle(Theme.note)
                    }
                }
            }
        }
    }

    private func save(_ change: ProfileChange) {
        failure = nil
        Task {
            _ = await model.update(change)
            moveError()
        }
    }

    private func moveError() {
        failure = model.error
        model.error = nil
    }
}
