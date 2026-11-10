import Foundation
import NetworkExtension

// Native boundary for Wirecove Connect / Disconnect controls.
final class ProxyConfiguration {
    private let providerIdentifier = "org.wirecove.WirecoveProxy"
    private let displayName = "Wirecove"

    func status(completion: @escaping (Result<String, Error>) -> Void) {
        NETransparentProxyManager.loadAllFromPreferences { [self] managers, error in
            if let error { completion(.failure(error)); return }
            guard let manager = managers?.first(where: { manager in
                (manager.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == providerIdentifier
            }) else {
                completion(.success("not configured"))
                return
            }
            let state: String
            switch manager.connection.status {
            case .invalid: state = "invalid"
            case .disconnected: state = "disconnected"
            case .connecting: state = "connecting"
            case .connected: state = "connected"
            case .reasserting: state = "reasserting"
            case .disconnecting: state = "disconnecting"
            @unknown default: state = "unknown"
            }
            completion(.success(state))
        }
    }

    func connect(domains: [String], signingIdentifiers: [String],
                 completion: @escaping (Result<Void, Error>) -> Void) {
        let policy = SitePolicy(domains: domains, signingIdentifiers: signingIdentifiers)
        guard !policy.domains.isEmpty || !policy.signingIdentifiers.isEmpty else {
            completion(.failure(ConfigurationError.noDomains))
            return
        }
        NETransparentProxyManager.loadAllFromPreferences { [self] managers, error in
            if let error { completion(.failure(error)); return }
            let manager = managers?.first(where: { manager in
                (manager.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == providerIdentifier
            }) ?? NETransparentProxyManager()
            let configuration = NETunnelProviderProtocol()
            configuration.providerBundleIdentifier = providerIdentifier
            configuration.serverAddress = "Wirecove local proxy"
            configuration.providerConfiguration = [
                "domains": policy.domains,
                "signingIdentifiers": policy.signingIdentifiers,
                "enableTCP": true
            ]
            manager.protocolConfiguration = configuration
            manager.localizedDescription = displayName
            manager.isEnabled = true
            manager.saveToPreferences { error in
                if let error { completion(.failure(error)); return }
                manager.loadFromPreferences { error in
                    if let error { completion(.failure(error)); return }
                    do {
                        try manager.connection.startVPNTunnel()
                        // The request was accepted; UI must observe status before showing Connected.
                        completion(.success(()))
                    } catch { completion(.failure(error)) }
                }
            }
        }
    }

    func disconnect(completion: @escaping (Result<Void, Error>) -> Void) {
        NETransparentProxyManager.loadAllFromPreferences { [self] managers, error in
            if let error { completion(.failure(error)); return }
            guard let manager = managers?.first(where: { manager in
                (manager.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == providerIdentifier
            }) else {
                completion(.success(()))
                return
            }
            manager.connection.stopVPNTunnel()
            manager.removeFromPreferences { error in
                if let error { completion(.failure(error)) }
                else { completion(.success(())) }
            }
        }
    }

    enum ConfigurationError: Error { case noDomains }
}
