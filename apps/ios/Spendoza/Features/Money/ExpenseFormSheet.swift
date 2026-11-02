import SpendozaKit
import SwiftUI

/// Add or edit a bill (the web's expense dialog). Stays open with the server's text when saving or deleting fails.
struct ExpenseFormSheet: View {
    let model: ExpensesModel
    let bill: Expense?
    @Environment(\.dismiss) private var dismiss
    @State private var form: ExpenseForm
    @State private var saving = false
    @State private var deleting = false
    @State private var confirmingDelete = false
    @State private var error: String?

    init(model: ExpensesModel, bill: Expense?) {
        self.model = model
        self.bill = bill
        _form = State(initialValue: bill.map { ExpenseForm(editing: $0) } ?? ExpenseForm(today: model.today))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(bill == nil ? "Add expense" : "Edit expense")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                field("Description") {
                    textField("e.g. Rent, Netflix", text: $form.description, label: "Description")
                }
                field("Friendly name (optional)") {
                    textField("e.g. Netflix, Gym membership", text: $form.friendlyName, label: "Friendly name (optional)")
                    Text("A short display name shown instead of the raw description")
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
                field("Amount") {
                    textField("0.00", text: $form.amountText, label: "Amount", keyboard: .decimalPad)
                }
                field("Category") { categoryMenu }
                field("Type") {
                    Picker("Type", selection: $form.frequency) {
                        Text("One-time").tag(ExpenseFrequency.oneTime)
                        Text("Recurring").tag(ExpenseFrequency.recurring)
                    }
                    .pickerStyle(.segmented)
                }
                if form.frequency == .recurring {
                    field("Recurrence interval") { intervalMenu }
                }
                field("Next due date") {
                    DatePicker("Next due date", selection: $form.nextDueDate, displayedComponents: .date)
                        .labelsHidden()
                        .tint(Theme.note)
                        .frame(minHeight: 44, alignment: .leading)
                }
                endDate
                if let error { InlineError(message: error) }
                buttons
            }
            .padding(20)
        }
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.large])
        .alert("Delete expense", isPresented: $confirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { delete() }
        } message: {
            Text(bill.map(ExpensesModel.deleteMessage) ?? "")
        }
    }

    // MARK: Fields

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                .foregroundStyle(Theme.ink)
                .accessibilityHidden(true)
            content()
        }
    }

    private func textField(_ prompt: String, text: Binding<String>, label: String,
                           keyboard: UIKeyboardType = .default) -> some View {
        TextField("", text: text, prompt: Text(prompt).foregroundStyle(Theme.soft))
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(Theme.ink)
            .tint(Theme.note)
            .keyboardType(keyboard)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving)
            .accessibilityLabel(label)
    }

    private var categoryMenu: some View {
        let title = form.categoryID.map { id in model.categoryChoices.first { $0.id == id }?.name ?? model.categoryName(for: id) }
        return menu(title: title ?? "Select category", label: "Category", placeholder: title == nil) {
            ForEach(model.categoryChoices, id: \.id) { category in
                Button { form.categoryID = category.id } label: {
                    if form.categoryID == category.id { Label(category.name, systemImage: "checkmark") } else { Text(category.name) }
                }
            }
        }
    }

    private var intervalMenu: some View {
        menu(title: ExpensesModel.label(form.interval), label: "Recurrence interval") {
            ForEach(RecurrenceInterval.allCases, id: \.self) { interval in
                Button { form.interval = interval } label: {
                    if form.interval == interval {
                        Label(ExpensesModel.label(interval), systemImage: "checkmark")
                    } else {
                        Text(ExpensesModel.label(interval))
                    }
                }
            }
        }
    }

    private func menu<Items: View>(title: String, label: String, placeholder: Bool = false,
                                   @ViewBuilder items: () -> Items) -> some View {
        Menu {
            items()
        } label: {
            HStack(spacing: 8) {
                Text(title).lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
            }
            .font(.sans(16, relativeTo: .body))
            .foregroundStyle(placeholder ? Theme.soft : Theme.ink)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner))
            .hairlineBorder(Theme.engraving)
        }
        .accessibilityLabel("\(label), \(title)")
    }

    private var endDate: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $form.hasEndDate) {
                Text("End date (optional)")
                    .font(.sans(14, weight: .semibold, relativeTo: .footnote))
                    .foregroundStyle(Theme.ink)
            }
            .tint(Theme.note)
            .frame(minHeight: 44)
            if form.hasEndDate {
                DatePicker("End date", selection: $form.endDate, displayedComponents: .date)
                    .labelsHidden()
                    .tint(Theme.note)
                    .frame(minHeight: 44, alignment: .leading)
            }
        }
    }

    // MARK: Buttons

    private var buttons: some View {
        VStack(spacing: 10) {
            Button(saving ? "Saving…" : (bill == nil ? "Add expense" : "Update"), action: save)
                .buttonStyle(PrimaryButtonStyle())
                .disabled(saving || deleting || !form.canSave)
                .opacity(form.canSave ? 1 : 0.5)
            Button("Cancel") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(saving || deleting)
            if bill != nil {
                Button(deleting ? "Deleting…" : "Delete expense") { confirmingDelete = true }
                    .buttonStyle(OutlinedDestructiveButtonStyle())
                    .disabled(saving || deleting)
            }
        }
        .padding(.top, 4)
    }

    private func save() {
        guard !saving, let draft = form.draft() else { return }
        saving = true
        error = nil
        Task {
            if let message = await model.save(draft, id: bill?.id) { error = message } else { dismiss() }
            saving = false
        }
    }

    private func delete() {
        guard !deleting, let bill else { return }
        deleting = true
        error = nil
        Task {
            if let message = await model.delete(bill) { error = message } else { dismiss() }
            deleting = false
        }
    }
}
