import Foundation

/// A `multipart/form-data` body: one file part, then any text fields.
enum Multipart {
    static func body(boundary: String, fileField: String, filename: String, mimeType: String, data: Data,
                     fields: [(name: String, value: String)] = []) -> Data {
        var body = Data()
        func add(_ text: String) { body.append(Data(text.utf8)) }
        // A quote or a line break in the name would end the header early (or add one).
        let safeName = filename
            .replacingOccurrences(of: "\"", with: "'")
            .filter { $0 != "\r" && $0 != "\n" && $0 != "\r\n" }
        add("--\(boundary)\r\n")
        add("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(safeName)\"\r\n")
        add("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        add("\r\n")
        for field in fields {
            add("--\(boundary)\r\n")
            add("Content-Disposition: form-data; name=\"\(field.name)\"\r\n\r\n")
            add("\(field.value)\r\n")
        }
        add("--\(boundary)--\r\n")
        return body
    }
}
