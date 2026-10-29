import SpendozaKit
import SwiftUI

extension ScoreBand {
    /// The band's theme colour: Low is oxblood, Fair is amber, Good is the note green.
    var color: Color {
        switch self {
        case .low: Theme.oxblood
        case .fair: Theme.amber
        case .good: Theme.note
        }
    }
}
