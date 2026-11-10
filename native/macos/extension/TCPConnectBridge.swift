import Foundation
import Network
import NetworkExtension
import os

// Copies a claimed TCP flow through the local SpoofDPI HTTP CONNECT listener.
// The provider retains this object until both directions close or an error occurs.
final class TCPConnectBridge {
    private let logger = Logger(subsystem: "org.wirecove", category: "tcp-bridge")
    private let flow: NEAppProxyTCPFlow
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "wirecove.tcp.bridge")
    private let request: Data
    private let onFinish: () -> Void
    private var header = Data()
    private var opened = false
    private var finished = false
    private var clientEnded = false
    private var serverEnded = false

    init?(flow: NEAppProxyTCPFlow, host: String, port: UInt16,
          onFinish: @escaping () -> Void) {
        guard let request = HTTPConnect.request(host: host, port: port),
              let proxyPort = NWEndpoint.Port(rawValue: 18089) else { return nil }
        self.flow = flow
        self.request = request
        self.onFinish = onFinish
        self.connection = NWConnection(host: "127.0.0.1", port: proxyPort, using: .tcp)
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.connection.send(content: self.request, completion: .contentProcessed { error in
                    if error == nil { self.readConnectResponse() } else { self.finish(error: error) }
                })
            case .failed(let error): self.finish(error: error)
            default: break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self, !self.opened else { return }
            self.finish(error: HTTPConnect.ConnectError.invalidResponse)
        }
    }

    private func readConnectResponse() {
        guard !finished else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, complete, error in
            guard let self, !self.finished else { return }
            if let error { self.finish(error: error); return }
            if let data { self.header.append(data) }
            do {
                if let end = try HTTPConnect.responseEnd(in: self.header) {
                    let pending = Data(self.header[end...])
                    self.header.removeAll()
                    self.flow.open(withLocalEndpoint: nil) { [weak self] error in
                        guard let self else { return }
                        self.queue.async {
                            if let error { self.finish(error: error); return }
                            guard !self.finished else { return }
                            self.opened = true
                            self.logger.notice("Local CONNECT established")
                            self.readFromClient()
                            if pending.isEmpty { self.readFromProxy() }
                            else { self.writeToClient(pending) }
                        }
                    }
                } else if complete {
                    self.finish(error: HTTPConnect.ConnectError.invalidResponse)
                } else {
                    self.readConnectResponse()
                }
            } catch { self.finish(error: error) }
        }
    }

    private func readFromClient() {
        guard !finished, !clientEnded else { return }
        flow.readData { [weak self] data, error in
            guard let self else { return }
            self.queue.async {
                guard !self.finished else { return }
                if let error { self.finish(error: error); return }
                guard let data, !data.isEmpty else {
                    self.clientEnded = true
                    self.connection.send(content: nil, isComplete: true,
                                         completion: .contentProcessed { error in
                        if let error { self.finish(error: error) }
                        else { self.finishIfDone() }
                    })
                    return
                }
                self.connection.send(content: data, completion: .contentProcessed { error in
                    if let error { self.finish(error: error) }
                    else { self.readFromClient() }
                })
            }
        }
    }

    private func readFromProxy() {
        guard !finished, !serverEnded else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, error in
            guard let self, !self.finished else { return }
            if let error { self.finish(error: error); return }
            if let data, !data.isEmpty {
                self.writeToClient(data, complete: complete)
            } else if complete {
                self.serverEnded = true
                self.flow.closeWriteWithError(nil)
                self.finishIfDone()
            } else {
                self.readFromProxy()
            }
        }
    }

    private func writeToClient(_ data: Data, complete: Bool = false) {
        flow.write(data) { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error { self.finish(error: error); return }
                if complete {
                    self.serverEnded = true
                    self.flow.closeWriteWithError(nil)
                    self.finishIfDone()
                } else { self.readFromProxy() }
            }
        }
    }

    private func finishIfDone() {
        if clientEnded && serverEnded { finish(error: nil) }
    }

    private func finish(error: Error?) {
        guard !finished else { return }
        finished = true
        if let error { logger.error("Selected TCP flow ended: \(String(describing: error), privacy: .public)") }
        connection.stateUpdateHandler = nil
        connection.cancel()
        flow.closeReadWithError(error)
        flow.closeWriteWithError(error)
        onFinish()
    }
}
