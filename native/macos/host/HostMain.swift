import Foundation

// Small development harness. Default command is read-only; Electron invokes
// mutating commands when the user changes the DPI lists or toggle.
@main struct HostMain {
    static func main() {
        let command = CommandLine.arguments.dropFirst().first ?? "inspect"
        switch command {
        case "inspect": inspect()
        case "activate":
            let activation = HostActivation()
            wait(seconds: 180) { done in
                activation.activate { result in
                    switch result {
                    case .success(let ready): print(ready ? "Extension active" : "Extension needs restart")
                    case .failure(let error): print("Activation failed: \(error)"); exit(1)
                    }
                    done()
                }
            }
        case "status":
            wait(seconds: 10) { done in
                ProxyConfiguration().status { result in
                    switch result {
                    case .success(let status): print("Proxy status: \(status)")
                    case .failure(let error): print("Status failed: \(error)"); exit(1)
                    }
                    done()
                }
            }
        case "connect":
            let arguments = Array(CommandLine.arguments.dropFirst(2))
            var domains: [String] = []
            var apps: [String] = []
            var index = 0
            while index < arguments.count {
                if arguments[index] == "--app", index + 1 < arguments.count {
                    apps.append(arguments[index + 1])
                    index += 2
                } else {
                    domains.append(arguments[index])
                    index += 1
                }
            }
            wait(seconds: 20) { done in
                ProxyConfiguration().connect(domains: domains, signingIdentifiers: apps) { result in
                    switch result {
                    case .success: print("Connection requested; check status")
                    case .failure(let error): print("Connection failed: \(error)"); exit(1)
                    }
                    done()
                }
            }
        case "disconnect":
            wait(seconds: 10) { done in
                ProxyConfiguration().disconnect { result in
                    switch result {
                    case .success: print("Disconnection requested")
                    case .failure(let error): print("Disconnection failed: \(error)"); exit(1)
                    }
                    done()
                }
            }
        default:
            print("Usage: WirecoveMacHost [inspect|activate|status|connect DOMAIN...|disconnect]")
            exit(2)
        }
    }

    private static func inspect() {
        let extensionURL = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Library/SystemExtensions/org.wirecove.WirecoveProxy.systemextension")
        let extensionBundle = Bundle(url: extensionURL)
        let bundled = extensionBundle?.bundleIdentifier == "org.wirecove.WirecoveProxy"
        print("WirecoveProxy bundle: \(bundled ? "present" : "missing")")
        if !bundled { exit(1) }
    }

    private static func wait(seconds: TimeInterval, start: (@escaping () -> Void) -> Void) {
        var complete = false
        start { complete = true }
        let deadline = Date().addingTimeInterval(seconds)
        while !complete && Date() < deadline {
            _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.2))
        }
        if !complete { print("Timed out"); exit(1) }
    }
}
