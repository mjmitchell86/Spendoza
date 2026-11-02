import SpendozaKit
import SwiftUI

/// Add or edit an income entry (the web's income dialog). Stays open with the server's text when saving or deleting
/// fails. Delete is offered to the owner only: someone an entry is attributed to can edit it but not delete it.
struct IncomeFormSheet: View {
    let model: IncomeModel
    let entry: IncomeEntry?
    @Environment(\.dismiss) private var dismiss
    @State private var form: IncomeForm
    @State private var saving = false
    @State private var deleting = false
    @State private var confirmingDelete = false
    @State private var error: String?

    init(model: IncomeModel, entry: IncomeEntry?) {
        self.model = model
        self.entry = entry
        _form = State(initialValue: entry.map { IncomeForm(editing: $0) } ?? IncomeForm(today: model.today))
    }

    private var canDelete: Bool { entry.map(model.canDelete) ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(entry == nil ? "Add income" : "Edit income")
                    .font(.serif(22, relativeTo: .title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                field("Source name") {
                    textField("e.g. Salary, Freelance", text: $form.sourceName, label: "Source name")
                }
                field("Friendly name (optional)") {
                    textField("e.g. Salary, Freelance Income", text: $form.friendlyName, label: "Friendly name (optional)")
                    Text("A short display name shown instead of the raw source name")
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
                field("Amount") {
                    textField("0.00", text: $form.amountText, label: "Amount", keyboard: .decimalPad)
                }
                field("Frequency") { frequencyMenu }
                field("Effective date") {
                    DatePicker("Effective date", selection: $form.effectiveDate, displayedComponents: .date)
                        .labelsHidden()
                        .tint(Theme.note)
                        .frame(minHeight: 44, alignment: .leading)
                }
                endDate
                field("Attributed to (optional)") { attributionFields }
                if let error { InlineError(message: error) }
                buttons
            }
            .padding(20)
        }
        .background(Theme.paper.ignoresSafeArea())
        .presentationDetents([.large])
        .alert("Delete income entry", isPresented: $confirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { delete() }
        } message: {
            Text(entry.map(IncomeModel.deleteMessage) ?? "")
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

    private var frequencyMenu: some View {
        menu(title: IncomeModel.label(form.frequency), label: "Frequency") {
            ForEach(IncomeFrequency.allCases, id: \.self) { frequency in
                Button { form.frequency = frequency } label: { checked(IncomeModel.label(frequency), form.frequency == frequency) }
            }
        }
    }

    @ViewBuilder private var attributionFields: some View {
        menu(title: form.attribution.title, label: "Attributed to") {
            ForEach(attributionChoices, id: \.self) { choice in
                Button { form.attribution = choice } label: { checked(choice.title, form.attribution == choice) }
            }
        }
        if form.attribution == .member {
            let name = form.memberID.map(memberName)
            menu(title: name ?? "Select member", label: "Household member", placeholder: name == nil) {
                ForEach(model.members) { member in
                    Button { form.memberID = member.id } label: { checked(member.displayName, form.memberID == member.id) }
                }
            }
        }
        if form.attribution == .custom {
            textField("e.g. Jane, Partner", text: $form.customName, label: "Custom name")
        }
    }

    /// "Household member" also stays offered while editing an entry already attributed to one.
    private var attributionChoices: [IncomeForm.Attribution] {
        model.attributionChoices.contains(.member) || form.attribution != .member ? model.attributionChoices : [.me, .member, .custom]
    }

    private func memberName(_ id: String) -> String {
        model.members.first { $0.id == id }?.displayName ?? "Household member"
    }

    @ViewBuilder private func checked(_ title: String, _ on: Bool) -> some View {
        if on { Label(title, systemImage: "checkmark") } else { Text(title) }
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
            Button(saving ? "Saving…" : (entry == nil ? "Add income" : "Update"), action: save)
                .buttonStyle(PrimaryButtonStyle())
                .disabled(saving || deleting || !form.canSave)
                .opacity(form.canSave ? 1 : 0.5)
            Button("Cancel") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(saving || deleting)
            if canDelete {
                Button(deleting ? "Deleting…" : "Delete income") { confirmingDelete = true }
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
            if let message = await model.save(draft, id: entry?.id) { error = message } else { dismiss() }
            saving = false
        }
    }

    private func delete() {
        guard !deleting, let entry else { return }
        deleting = true
        error = nil
        Task {
            if let message = await model.delete(entry) { error = message } else { dismiss() }
            deleting = false
        }
    }
}
