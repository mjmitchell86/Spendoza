import SpendozaKit
import SwiftUI

/// The Categories screen (the web's page): a ruled list, "System" on the defaults, and Edit/Delete on custom ones.
/// It first learns whether you are in a household (for the sharing switch), then shows the list. `didChange` runs
/// once a change was saved, so the Money screens behind can show the new names.
struct CategoriesView: View {
    let api: any SpendozaAPI
    let onSessionEnded: @MainActor () -> Void
    let onAccountDisabled: @MainActor (String) -> Void
    let didChange: @MainActor () -> Void
    @State private var model: CategoriesModel?
    @State private var target: Target?
    @State private var deleting: BudgetCategory?
    @State private var deleteError: String?

    /// What the form sheet is for: a new category or an existing one.
    struct Target: Identifiable {
        let category: BudgetCategory?
        var id: String { category?.id ?? "new" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Categories")
                    .font(.serif(28, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("Organize your expenses with categories")
                    .font(.sans(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.soft)
                    .padding(.top, 4)
                if let model {
                    content(model)
                } else {
                    ProgressView().tint(Theme.note)
                        .frame(maxWidth: .infinity, minHeight: 200)
                        .accessibilityLabel("Loading categories")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle("Categories")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .task { await open() }
        .refreshable { await model?.load() }
        .onDisappear { if model?.changed == true { didChange() } }
        .sheet(item: $target) { target in
            if let model { CategoryFormSheet(model: model, category: target.category) }
        }
        .alert("Delete category", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { confirmDelete() }
        } message: {
            Text(deleting.map { CategoriesModel.deleteMessage(name: $0.name) } ?? "")
        }
    }

    private func open() async {
        guard model == nil else { return }
        // A failed lookup only hides the sharing switch; the list is the screen.
        let inHousehold = (try? await api.household()) != nil
        let made = CategoriesModel(api: api, inHousehold: inHousehold)
        made.onSessionEnded = onSessionEnded
        made.onAccountDisabled = onAccountDisabled
        model = made
        await made.load()
    }

    @ViewBuilder private func content(_ model: CategoriesModel) -> some View {
        Button("New category") { target = Target(category: nil) }
            .buttonStyle(SecondaryButtonStyle())
            .padding(.top, 16)
        if let deleteError { InlineError(message: deleteError).padding(.top, 12) }
        if let error = model.shareError { AreaErrorView(error: error).padding(.top, 12) }
        if let error = model.loadError {
            AreaErrorView(error: error).padding(.top, 12)
            Button("Retry") { Task { await model.load() } }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 12)
        } else if model.isLoading && model.categories.isEmpty {
            ProgressView().tint(Theme.note)
                .frame(maxWidth: .infinity, minHeight: 120)
                .accessibilityLabel("Loading categories")
        } else if model.categories.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text("No categories yet.")
                Text("Create your first custom category to get started.")
            }
            .font(.sans(15, relativeTo: .subheadline))
            .foregroundStyle(Theme.soft)
            .padding(.top, 16)
        } else {
            VStack(spacing: 0) {
                ForEach(model.categories, id: \.id) { category in row(category, model) }
            }
            .topRule()
            .padding(.top, 16)
        }
    }

    private func row(_ category: BudgetCategory, _ model: CategoriesModel) -> some View {
        RuledRow {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(category.name)
                        .font(.sans(16, weight: .semibold, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                    if category.isSystemDefault {
                        Text("System")
                            .font(.sans(12, weight: .semibold, relativeTo: .caption))
                            .foregroundStyle(Theme.soft)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .hairlineBorder(Theme.engraving)
                    }
                    Spacer(minLength: 0)
                }
                Text(CategoriesModel.title(for: category.budgetClass))
                    .font(.sans(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.soft)
                if model.inHousehold {
                    Toggle("Shared with household", isOn: Binding(get: { model.isShared(category.id) },
                                                                  set: { value in Task { await model.setShared(category.id, value) } }))
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.note)
                        .disabled(model.isUpdating(category.id))
                        .frame(minHeight: 44)
                        .accessibilityLabel("Shared with household, \(category.name)")
                }
                if model.canEdit(category) {
                    HStack(spacing: 10) {
                        Button("Edit") { target = Target(category: category) }
                            .buttonStyle(SecondaryButtonStyle())
                            .accessibilityLabel("Edit \(category.name)")
                        Button("Delete") { deleteError = nil; deleting = category }
                            .buttonStyle(OutlinedDestructiveButtonStyle())
                            .accessibilityLabel("Delete \(category.name)")
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func confirmDelete() {
        guard let category = deleting, let model else { return }
        deleting = nil
        Task { deleteError = await model.delete(category) }
    }
}
