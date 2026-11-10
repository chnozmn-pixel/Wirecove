import Foundation
import SystemExtensions

// Called by the future signed host after the user enables the feature in Wirecove.
// This build never invokes it automatically.
final class HostActivation: NSObject, OSSystemExtensionRequestDelegate {
    private var request: OSSystemExtensionRequest?
    private var completion: ((Result<Bool, Error>) -> Void)?

    func activate(completion: @escaping (Result<Bool, Error>) -> Void) {
        self.completion = completion
        let request = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: "org.wirecove.WirecoveProxy", queue: .main)
        request.delegate = self
        self.request = request
        OSSystemExtensionManager.shared.submitRequest(request)
    }

    func request(_ request: OSSystemExtensionRequest,
                 actionForReplacingExtension existing: OSSystemExtensionProperties,
                 withExtension ext: OSSystemExtensionProperties) -> OSSystemExtensionRequest.ReplacementAction {
        .replace
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        print("macOS approval required in System Settings")
    }

    func request(_ request: OSSystemExtensionRequest,
                 didFinishWithResult result: OSSystemExtensionRequest.Result) {
        completion?(.success(result == .completed))
        completion = nil
        self.request = nil
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        completion?(.failure(error))
        completion = nil
        self.request = nil
    }
}
