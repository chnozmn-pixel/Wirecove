import Foundation

// Pure policy shared by the future extension and its local tests.
struct SitePolicy: Codable {
    let domains: [String]
    let signingIdentifiers: [String]

    init(domains: [String], signingIdentifiers: [String] = []) {
        self.domains = domains.compactMap(Self.normalizedDomain)
        self.signingIdentifiers = signingIdentifiers.filter { !$0.isEmpty }
    }

    static func normalizedDomain(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        guard value.count <= 253, value.contains("."), !value.contains(".."),
              value.split(separator: ".").allSatisfy({ label in
                  label.count <= 63 && !label.isEmpty &&
                  label.first != "-" && label.last != "-" &&
                  label.utf8.allSatisfy { byte in
                      (97...122).contains(byte) || (48...57).contains(byte) || byte == 45
                  }
              }) else { return nil }
        return value
    }

    func matches(host: String?, signingIdentifier: String?) -> Bool {
        let hostMatch = host.flatMap(Self.normalizedDomain).map { host in
            domains.contains { domain in host == domain || host.hasSuffix("." + domain) }
        } ?? false
        let appMatch = signingIdentifier.map(signingIdentifiers.contains) ?? false
        return hostMatch || appMatch
    }
}
