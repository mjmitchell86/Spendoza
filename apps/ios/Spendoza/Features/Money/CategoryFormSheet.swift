import SpendozaKit
import SwiftUI

/// Create or edit a category (the web's dialog). Stays open with the server's text when saving fails.
struct CategoryFormSheet: View {
    let model: CategoriesModel
    let category: BudgetCategory?
    @Environment(\.dismiss) private var dismiss
    @State private var form: CategoryForm
    @State private var saving = false
    @State private var error: String?

    init(model: CategoriesModel, category: BudgetCategory?) {
        self.model = model
        self.category = category
        _form = State(initialValue: category.map { CategoryForm(editing: $0, shared: model.isShared($0.id)) } ?? CategoryForm())
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(category == nil ? "New category" : "Edit category")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                field("Name") {
                    TextField("", text: $form.name, prompt: Text("e.g. Childcare, Pet Expenses").foregroundStyle(Theme.soft))
                        .font(.sans(16, relativeTo: .body))
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.note)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
                        .hairlineBorder(Theme.engraving)
                        .accessibilityLabel("Name")
                }
                // Sharing is chosen when the category is made; afterwards the list's switch changes it.
                if model.inHousehold && category == nil {
                    VStack(alignment: .leading, spacing: 4) {
                        Toggle(isOn: $form.shared) {
                            Text("Shared with household")
                                .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                                .foregroundStyle(Theme.ink)
                        }
                        .tint(Theme.note)
                        .frame(minHeight: 44)
                        Text(CategoriesModel.sharedHelp)
                            .font(.sans(13, relativeTo: .footnote))
                            .foregroundStyle(Theme.soft)
                    }
                }
                field("Budget class") {
                    classMenu
                    Text(CategoriesModel.classHelp)
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
                if let error { InlineError(message: error) }
                VStack(spacing: 10) {
                    Button(saving ? "Saving…" : (category == nil ? "Create category" : "Update"), action: save)
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(saving || !form.canSave)
                        .opacity(form.canSave ? 1 : 0.5)
                    Button("Cancel") { dismiss() }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(saving)
                }
                .padding(.top, 4)
            }
            .padding(20)
        }
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.large])
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                .foregroundStyle(Theme.ink)
                .accessibilityHidden(true)
            content()
        }
    }

    private var classMenu: some View {
        let title = CategoriesModel.title(for: form.budgetClass)
        return Menu {
            ForEach(CategoriesModel.classOptions, id: \.value) { option in
                Button { form.budgetClass = option.value } label: {
                    if option.value == form.budgetClass { Label(option.title, systemImage: "checkmark") } else { Text(option.title) }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(title).lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
            }
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving)
        }
        .accessibilityLabel("Budget class, \(title)")
    }

    private func save() {
        guard !saving, form.canSave else { return }
        saving = true
        error = nil
        Task {
            let message: String?
            if let category {
                message = await model.update(category, name: form.name, budgetClass: form.budgetClass)
            } else {
                message = await model.create(name: form.name, budgetClass: form.budgetClass, shared: form.shared)
            }
            if let message { error = message } else { dismiss() }
            saving = false
        }
    }
}
