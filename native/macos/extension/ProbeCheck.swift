import Foundation

@main struct ProbeCheck {
    static func main() {
        let port = UInt16(CommandLine.arguments.dropFirst().first ?? "") ?? 18089
        let semaphore = DispatchSemaphore(value: 0)
        LocalProxyProbe.check(port: port) { available in
            print("127.0.0.1:\(port) \(available ? "ready" : "unavailable")")
            semaphore.signal()
        }
        guard semaphore.wait(timeout: .now() + 4) == .success else {
            fatalError("Probe timed out")
        }
    }
}
