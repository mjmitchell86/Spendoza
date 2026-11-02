import Foundation
import Testing
@testable import Spendoza

@MainActor
struct MoneySheetRouterTests {
    @Test func withNoOtherSheetUpTheUploadSheetOpensAtOnce() {
        let router = MoneySheetRouter()
        router.showUpload()
        #expect(router.showingUpload)
        #expect(!router.othersMustClose)
    }

    @Test func aFileArrivingOverAnotherSheetClosesItFirstThenOpensTheUploadSheet() {
        let router = MoneySheetRouter()
        let billForm = UUID()
        router.sheetAppeared(billForm)
        router.showUpload()
        // SwiftUI can't present over the open sheet: it is asked to close instead.
        #expect(!router.showingUpload)
        #expect(router.othersMustClose)
        router.sheetDisappeared(billForm)
        #expect(router.showingUpload)
        #expect(!router.othersMustClose)
    }

    @Test func theUploadSheetWaitsForEveryOtherSheetToClose() {
        let router = MoneySheetRouter()
        let form = UUID(), picker = UUID()
        router.sheetAppeared(form)
        router.sheetAppeared(picker)
        router.showUpload()
        router.sheetDisappeared(picker)
        #expect(!router.showingUpload)
        router.sheetDisappeared(form)
        #expect(router.showingUpload)
    }

    @Test func closingASheetWithNothingWaitingOpensNothing() {
        let router = MoneySheetRouter()
        let form = UUID()
        router.sheetAppeared(form)
        router.sheetDisappeared(form)
        #expect(!router.showingUpload)
        #expect(!router.othersMustClose)
    }

    @Test func aSheetOpenedLaterIsNotClosedByAnOldRequest() {
        let router = MoneySheetRouter()
        let form = UUID()
        router.sheetAppeared(form)
        router.showUpload()
        router.sheetDisappeared(form)
        router.showingUpload = false
        router.sheetAppeared(UUID())
        #expect(!router.othersMustClose)
    }
}
