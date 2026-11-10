import Foundation

@main struct PolicyCheck {
    static func main() {
        let policy = SitePolicy(domains: ["Example.com", "bad..host", " funpic.hu "] ,
                                signingIdentifiers: ["com.example.Browser"])
        precondition(policy.domains == ["example.com", "funpic.hu"])
        precondition(policy.matches(host: "example.com", signingIdentifier: nil))
        precondition(policy.matches(host: "cdn.example.com", signingIdentifier: nil))
        precondition(policy.matches(host: "funpic.hu", signingIdentifier: nil))
        precondition(!policy.matches(host: "notexample.com", signingIdentifier: nil))
        precondition(!policy.matches(host: "example.com.evil.test", signingIdentifier: nil))
        precondition(policy.matches(host: nil, signingIdentifier: "com.example.Browser"))
        precondition(!policy.matches(host: nil, signingIdentifier: "com.example.Game"))
        let request = HTTPConnect.request(host: "Example.com", port: 443)
        precondition(String(decoding: request!, as: UTF8.self).hasPrefix("CONNECT example.com:443 HTTP/1.1\r\n"))
        precondition(HTTPConnect.request(host: "bad\r\nHost: evil", port: 443) == nil)
        let response = Data("HTTP/1.1 200 Connection established\r\n\r\nTLS".utf8)
        precondition(try! HTTPConnect.responseEnd(in: response) == response.count - 3)
        precondition(try! HTTPConnect.responseEnd(in: Data("HTTP/1.1 200".utf8)) == nil)
        do {
            _ = try HTTPConnect.responseEnd(in: Data("HTTP/1.1 403 Forbidden\r\n\r\n".utf8))
            fatalError("Rejected CONNECT was accepted")
        } catch HTTPConnect.ConnectError.rejected { }
        catch { fatalError("Unexpected CONNECT error: \(error)") }
        print("SitePolicy and HTTP CONNECT: 13 checks passed")
    }
}
