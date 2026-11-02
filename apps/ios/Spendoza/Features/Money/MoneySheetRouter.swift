import Foundation
import Observation
import SwiftUI

/// Money's upload sheet against its other sheets (bill, income and category forms, the category pickers). SwiftUI
/// presents one sheet at a time, so a statement opened from outside while another sheet is up would wait unseen:
/// that sheet is asked to close first, and the upload sheet opens once every other one has gone.
@MainActor @Observable
final class MoneySheetRouter {
    /// Drives the upload sheet.
    var showingUpload = false
    /// The other sheets should close (they watch this through `givesWayToOpenedFiles()`).
    private(set) var othersMustClose = false
    @ObservationIgnored private var openSheets: Set<UUID> = []
    @ObservationIgnored private var uploadWaiting = false

    /// Opens the upload sheet, at once or as soon as the other sheets have closed.
    func showUpload() {
        guard !openSheets.isEmpty else {
            showingUpload = true
            return
        }
        uploadWaiting = true
        othersMustClose = true
    }

    func sheetAppeared(_ id: UUID) { openSheets.insert(id) }

    func sheetDisappeared(_ id: UUID) {
        openSheets.remove(id)
        guard openSheets.isEmpty, uploadWaiting else { return }
        uploadWaiting = false
        othersMustClose = false
        showingUpload = true
    }
}

extension View {
    /// For a Money sheet other than the upload sheet: it closes when a statement opened from outside needs the screen.
    func givesWayToOpenedFiles() -> some View { modifier(GivesWayToOpenedFiles()) }
}

private struct GivesWayToOpenedFiles: ViewModifier {
    @Environment(MoneySheetRouter.self) private var router: MoneySheetRouter?
    @Environment(\.dismiss) private var dismiss
    @State private var id = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { router?.sheetAppeared(id) }
            .onDisappear { router?.sheetDisappeared(id) }
            .onChange(of: router?.othersMustClose == true, initial: true) { _, close in
                if close { dismiss() }
            }
    }
}
