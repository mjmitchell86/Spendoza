import Foundation
import SpendozaKit
import Testing
@testable import Spendoza

@MainActor
struct ReportEmailsTests {
    private let start = Profile(id: "u", displayName: "Matt", onboardingCompleted: true, isAdmin: false,
                                emailReportsEnabled: true, householdID: nil, timezone: "America/Chicago",
                                emailReportDay: .saturday, emailReportHour: 9)

    @Test func turningTheToggleOffSendsDisabled() async {
        let api = StubAPI()
        let model = MeModel(api: api, profile: start, apply: { _ in })
        #expect(await model.update(ProfileChange(emailReportsEnabled: false)))
        #expect(api.calls == ["updateProfile(email: false, tz: nil)"])
        #expect(model.profile?.emailReportsEnabled == false)
    }

    @Test func aFailedUpdateKeepsTheSavedScheduleAndShowsTheError() async {
        let api = StubAPI()
        api.updateProfileError = .offline
        let model = MeModel(api: api, profile: start, apply: { _ in })
        #expect(await model.update(ProfileChange(emailReportsEnabled: false, emailReportDay: .monday, emailReportHour: 13)) == false)
        // The screen binds to these, so they are what the toggle, day and time show again.
        #expect(model.profile?.emailReportsEnabled == true)
        #expect(model.profile?.emailReportDay == .saturday)
        #expect(model.profile?.emailReportHour == 9)
        #expect(model.error == "You're offline. Check your connection and try again.")
    }

    @Test func theSummaryNamesDayHourAndZone() {
        #expect(ReportSchedule.summary(day: .saturday, hour: 9, timezone: "America/Chicago")
                == "Receive your report every Saturday at 9 AM (America/Chicago)")
    }

    @Test func theSummaryOmitsAMissingZone() {
        #expect(ReportSchedule.summary(day: .monday, hour: 0, timezone: nil) == "Receive your report every Monday at 12 AM")
    }

    @Test func hourLabels() {
        #expect(ReportSchedule.hourLabel(0) == "12 AM")
        #expect(ReportSchedule.hourLabel(9) == "9 AM")
        #expect(ReportSchedule.hourLabel(12) == "12 PM")
        #expect(ReportSchedule.hourLabel(13) == "1 PM")
        #expect(ReportSchedule.hourLabel(23) == "11 PM")
    }

    @Test func sendingATestEmailReportsSuccessOrTheError() async {
        let api = StubAPI()
        let model = MeModel(api: api, profile: start, apply: { _ in })
        await model.sendTestEmail()
        #expect(api.calls == ["sendTestEmail"])
        #expect(model.testEmailSent)
        api.testEmailError = .message("Mail is down")
        await model.sendTestEmail()
        #expect(model.testEmailSent == false)
        #expect(model.error == "Mail is down")
    }
}
