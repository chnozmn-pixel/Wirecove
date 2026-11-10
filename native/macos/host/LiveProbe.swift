import Foundation

// Standalone test executable, deliberately excluded from the app target.
@main struct LiveProbe {
    static func main() {
        let url = URL(string: CommandLine.arguments.dropFirst().first ?? "https://example.com/")!
        let session = URLSession(configuration: .ephemeral)
        let semaphore = DispatchSemaphore(value: 0)
        var succeeded = false
        session.dataTask(with: url) { data, response, error in
            if let error { print("request failed: \(error)") }
            else {
                let status = (response as? HTTPURLResponse)?.statusCode ?? -1
                print("status=\(status) bytes=\(data?.count ?? 0)")
                succeeded = (200...399).contains(status) && !(data?.isEmpty ?? true)
            }
            semaphore.signal()
        }.resume()
        if semaphore.wait(timeout: .now() + 20) != .success { print("request timed out") }
        session.invalidateAndCancel()
        if !succeeded { exit(1) }
    }
}
