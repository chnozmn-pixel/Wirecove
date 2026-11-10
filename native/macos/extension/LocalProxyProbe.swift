import Foundation
import Network

enum LocalProxyProbe {
    static func check(port: UInt16 = 18089, timeout: TimeInterval = 2,
                      completion: @escaping (Bool) -> Void) {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            completion(false)
            return
        }
        let connection = NWConnection(host: "127.0.0.1", port: endpointPort, using: .tcp)
        let queue = DispatchQueue(label: "wirecove.proxy.probe")
        var resolved = false
        func finish(_ available: Bool) {
            guard !resolved else { return }
            resolved = true
            connection.stateUpdateHandler = nil
            connection.cancel()
            completion(available)
        }
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready: finish(true)
            case .failed, .cancelled: finish(false)
            default: break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + timeout) { finish(false) }
    }
}
