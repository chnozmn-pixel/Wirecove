import Foundation

enum HTTPConnect {
    static func request(host: String, port: UInt16) -> Data? {
        guard let domain = SitePolicy.normalizedDomain(host), port > 0 else { return nil }
        return Data("CONNECT \(domain):\(port) HTTP/1.1\r\nHost: \(domain):\(port)\r\nProxy-Connection: keep-alive\r\n\r\n".utf8)
    }

    // nil means that more bytes are needed. A malformed or failed response throws.
    static func responseEnd(in data: Data) throws -> Int? {
        guard data.count <= 8192 else { throw ConnectError.invalidResponse }
        guard let range = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        guard let firstLineEnd = data.range(of: Data("\r\n".utf8)) else {
            throw ConnectError.invalidResponse
        }
        let firstLine = String(decoding: data[..<firstLineEnd.lowerBound], as: UTF8.self)
        let parts = firstLine.split(separator: " ", omittingEmptySubsequences: true)
        guard parts.count >= 2, parts[0] == "HTTP/1.1" || parts[0] == "HTTP/1.0",
              let status = Int(parts[1]), status == 200 else {
            throw ConnectError.rejected
        }
        return range.upperBound
    }

    enum ConnectError: Error { case invalidResponse, rejected }
}
