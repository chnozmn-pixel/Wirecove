import Foundation
import NetworkExtension
import os

// Experimental TCP bridge. Forwarding stays disabled unless explicitly enabled
// in provider configuration.
final class WirecoveTransparentProxyProvider: NETransparentProxyProvider {
    private let logger = Logger(subsystem: "org.wirecove", category: "transparent-proxy")
    private var policy = SitePolicy(domains: [])
    private var forwardingEnabled = false
    private var bridges: [UUID: TCPConnectBridge] = [:]
    private let bridgeLock = NSLock()

    override func startProxy(options: [String: Any]?, completionHandler: @escaping (Error?) -> Void) {
        let configuration = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration
        let values = options ?? configuration ?? [:]
        policy = SitePolicy(domains: values["domains"] as? [String] ?? [],
                            signingIdentifiers: values["signingIdentifiers"] as? [String] ?? [])
        forwardingEnabled = values["enableTCP"] as? Bool == true
        logger.notice("Proxy starting with \(self.policy.domains.count) domains; forwarding=\(self.forwardingEnabled)")
        guard !policy.domains.isEmpty || !policy.signingIdentifiers.isEmpty else {
            completionHandler(NSError(domain: "Wirecove", code: 1,
                                      userInfo: [NSLocalizedDescriptionKey: "No valid domains configured"]))
            return
        }
        let settings = NETransparentProxyNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
        var rules = policy.domains.map { domain in
            NENetworkRule(destinationHost: NWHostEndpoint(hostname: domain, port: "0"), protocol: .any)
        }
        if !policy.signingIdentifiers.isEmpty {
            for address in ["0.0.0.0", "::"] {
                for port in ["80", "443"] {
                    rules.append(NENetworkRule(destinationNetwork: NWHostEndpoint(hostname: address, port: port),
                                               prefix: 0, protocol: .TCP))
                }
            }
        }
        settings.includedNetworkRules = rules
        if forwardingEnabled {
            LocalProxyProbe.check { [weak self] available in
                guard let self else { return }
                guard available else {
                    completionHandler(NSError(domain: "Wirecove", code: 2,
                                              userInfo: [NSLocalizedDescriptionKey: "Local proxy is unavailable"]))
                    return
                }
                self.setTunnelNetworkSettings(settings, completionHandler: completionHandler)
            }
        } else {
            setTunnelNetworkSettings(settings, completionHandler: completionHandler)
        }
    }

    override func stopProxy(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        forwardingEnabled = false
        completionHandler()
    }

    override func handleNewFlow(_ flow: NEAppProxyFlow) -> Bool {
        guard forwardingEnabled, let tcp = flow as? NEAppProxyTCPFlow,
              let endpoint = tcp.remoteEndpoint as? NWHostEndpoint,
              let port = UInt16(endpoint.port), port == 80 || port == 443 else { return false }
        let host = flow.remoteHostname ?? endpoint.hostname
        guard policy.matches(host: host, signingIdentifier: flow.metaData.sourceAppSigningIdentifier) else { return false }
        let id = UUID()
        guard let bridge = TCPConnectBridge(flow: tcp, host: host, port: port, onFinish: { [weak self] in
            guard let self else { return }
            self.bridgeLock.lock()
            self.bridges.removeValue(forKey: id)
            self.bridgeLock.unlock()
        }) else { return false }
        bridgeLock.lock()
        bridges[id] = bridge
        bridgeLock.unlock()
        logger.notice("Selected TCP flow claimed")
        bridge.start()
        return true
    }
}
