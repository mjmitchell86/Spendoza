import PhotosUI
import SwiftUI

/// The top of Me: photo (tap to change), name (tap to edit), email, and the member-since date.
struct ProfileHeader: View {
    let model: MeModel
    let email: String?
    @State private var picked: PhotosPickerItem?
    @State private var editingName = false

    private var name: String { model.profile?.displayName ?? "" }

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            PhotosPicker(selection: $picked, matching: .images) {
                AvatarCircle(name: name, url: model.profile?.avatarURL)
                    .overlay {
                        if model.isUploading {
                            ZStack {
                                Circle().fill(Theme.paper.opacity(0.6))
                                ProgressView().tint(Theme.note)
                            }
                        }
                    }
            }
            .buttonStyle(.plain)
            .disabled(model.isUploading)
            .accessibilityLabel("Change photo")
            .onChange(of: picked) { _, item in
                guard let item else { return }
                Task { await upload(item) }
            }

            VStack(alignment: .leading, spacing: 4) {
                Button { editingName = true } label: {
                    Text(name)
                        .font(.serif(24, relativeTo: .title2))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit name")
                .accessibilityValue(name)
                if let email {
                    Text(email)
                        .font(.sans(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.soft)
                }
                if let since = memberSince {
                    Text(since)
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.soft)
                }
                if let error = model.error, !editingName {
                    Text(error)
                        .font(.sans(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.oxblood)
                }
            }
            Spacer(minLength: 0)
        }
        .sheet(isPresented: $editingName) { EditNameSheet(model: model) }
    }

    private var memberSince: String? {
        model.profile?.createdAt.map { "Member since \($0.formatted(.dateTime.month(.wide).day().year()))" }
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { picked = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let jpeg = AvatarImage.jpegForUpload(data) else {
            model.error = "That photo couldn't be read. Try another."
            return
        }
        await model.uploadPhoto(jpeg)
    }
}
