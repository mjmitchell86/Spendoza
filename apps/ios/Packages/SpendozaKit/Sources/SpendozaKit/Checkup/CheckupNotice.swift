import Foundation

/// The once-per-month "check-up is ready" notice body (no numbers), or nil when
/// there is nothing new to announce.
public func checkupNotice(latestCheckup: Month?, lastNotified: Month?) -> String? {
    guard let latestCheckup else { return nil }
    if let lastNotified, latestCheckup <= lastNotified { return nil }
    return "Your \(latestCheckup.name) check-up is ready"
}
