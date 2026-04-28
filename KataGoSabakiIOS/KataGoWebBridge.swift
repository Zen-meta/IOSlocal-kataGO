import Foundation
import Darwin
import Metal
import UIKit
import UniformTypeIdentifiers
import WebKit
import KatagoMobile

private final class AnalysisStreamBox {
    weak var bridge: KataGoWebBridge?
    let streamID: String
    let positionSignature: String
    let startedAt: DispatchTime
    let profile: String
    let profileSettings: [String: Any]
    let profileWarnings: [String]

    private let lock = NSLock()
    private var cancelledValue = false

    init(
        bridge: KataGoWebBridge,
        streamID: String,
        positionSignature: String,
        startedAt: DispatchTime,
        profile: String,
        profileSettings: [String: Any],
        profileWarnings: [String]
    ) {
        self.bridge = bridge
        self.streamID = streamID
        self.positionSignature = positionSignature
        self.startedAt = startedAt
        self.profile = profile
        self.profileSettings = profileSettings
        self.profileWarnings = profileWarnings
    }

    var isCancelled: Bool {
        lock.lock()
        let value = cancelledValue
        lock.unlock()
        return value
    }

    func cancel() {
        lock.lock()
        cancelledValue = true
        lock.unlock()
    }
}

final class KataGoWebBridge: NSObject, WKScriptMessageHandler, URLSessionDownloadDelegate {
    weak var webView: WKWebView?

    private let activeModelPathKey = "local.katago.sabaki.activeModelPath"
    private let activeModelIDKey = "com.goaireview.activeModelID"
    private let queue = DispatchQueue(label: "local.katago.sabaki.bridge", qos: .userInitiated)
    private let stopQueue = DispatchQueue(label: "local.katago.sabaki.bridge.stop", qos: .userInitiated)
    private let engineLock = NSLock()
    private let streamLock = NSLock()
    private lazy var downloadSession = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    private var engine: OpaquePointer?
    private var boardSize = 19
    private var engineModelPath: String?
    private var engineProfileID: String?
    private var engineProfileSummary = "mobile-default"
    private var engineProfileSettings: [String: Any] = [:]
    private var engineProfileWarnings: [String] = []
    private var enginePositionSignature: String?
    private var activeAnalysisStream: AnalysisStreamBox?
    private var analysisStreamSequence = 0
    private var activeDownloadTask: URLSessionDownloadTask?
    private var activeDownloadRequestID: String?
    private var activeDownloadDestination: URL?
    private var activeDownloadName: String?
    private var pendingImportRequestID: String?

    deinit {
        activeDownloadTask?.cancel()
        downloadSession.invalidateAndCancel()
        _ = stopActiveAnalysisStream()
        if let engine {
            kg_mobile_engine_destroy(engine)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "katago",
              let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let action = body["action"] as? String else {
            return
        }

        let payload = body["payload"] as? [String: Any] ?? [:]

        if action == "stopAnalysis" {
            stopQueue.async {
                let stopped = self.stopActiveAnalysisStream()
                self.respond(id: id, result: [
                    "ok": true,
                    "stopped": stopped,
                ])
            }
            return
        }

        queue.async {
            switch action {
            case "analyze":
                self.handleAnalyze(id: id, payload: payload)
            case "startOnlineAnalysis":
                self.handleStartOnlineAnalysis(id: id, payload: payload)
            case "resolveInference":
                self.handleResolveInference(id: id, payload: payload)
            case "listModels":
                self.handleListModels(id: id)
            case "downloadModel":
                self.handleDownloadModel(id: id, payload: payload)
            case "cancelModelDownload":
                self.handleCancelModelDownload(id: id)
            case "importModel":
                self.handleImportModel(id: id)
            case "selectModel":
                self.handleSelectModel(id: id, payload: payload)
            case "deleteModel":
                self.handleDeleteModel(id: id, payload: payload)
            case "openURL":
                self.handleOpenURL(id: id, payload: payload)
            case "hardwareInfo":
                self.handleHardwareInfo(id: id)
            case "version":
                self.respond(id: id, result: [
                    "ok": true,
                    "version": String(cString: kg_mobile_version()),
                ])
            default:
                self.respond(id: id, result: [
                    "ok": false,
                    "error": "Unknown action: \(action)",
                ])
            }
        }
    }

    private func handleHardwareInfo(id: String) {
        let device = MTLCreateSystemDefaultDevice()
        let profile = Self.devicePerformanceProfile()
        var result: [String: Any] = [
            "ok": true,
            "deviceIdentifier": profile.identifier,
            "cpuCores": profile.cpuCores,
            "activeCpuCores": ProcessInfo.processInfo.activeProcessorCount,
            "memoryGB": Self.physicalMemoryGB(),
            "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "thermalState": Self.thermalStateName(ProcessInfo.processInfo.thermalState),
            "metalSupported": device != nil,
            "gpuName": device?.name ?? "Unavailable",
        ]
        if let performanceCpuCores = profile.performanceCpuCores {
            result["performanceCpuCores"] = performanceCpuCores
        }
        if let efficiencyCpuCores = profile.efficiencyCpuCores {
            result["efficiencyCpuCores"] = efficiencyCpuCores
        }
        if let gpuCores = profile.gpuCores {
            result["gpuCores"] = gpuCores
        }
        if let neuralEngineCores = profile.neuralEngineCores {
            result["neuralEngineCores"] = neuralEngineCores
        }
        respond(id: id, result: result)
    }

    private func handleOpenURL(id: String, payload: [String: Any]) {
        guard let rawURL = payload["url"] as? String,
              let url = URL(string: rawURL),
              url.scheme == "https" else {
            respond(id: id, result: [
                "ok": false,
                "error": "Only HTTPS URLs can be opened",
            ])
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                self.respond(id: id, result: [
                    "ok": opened,
                    "opened": opened,
                    "error": opened ? "" : "Unable to open URL",
                ])
            }
        }
    }

    private func handleAnalyze(id: String, payload: [String: Any]) {
        let requestedSize = payload["boardSize"] as? Int ?? 19
        let nextColorName = payload["nextColor"] as? String ?? "black"
        let moves = payload["moves"] as? [[String: Any]] ?? []
        let inference = payload["inference"] as? [String: Any] ?? [:]

        do {
            _ = stopActiveAnalysisStream()
            let startedAt = DispatchTime.now()
            let engine = try getEngine(boardSize: requestedSize, inference: inference)
            let positionSignature = Self.positionSignature(boardSize: requestedSize, nextColor: nextColorName, moves: moves)
            if enginePositionSignature != positionSignature {
                try clearBoard(engine: engine, boardSize: requestedSize)
                try replay(moves: moves, engine: engine)
                enginePositionSignature = positionSignature
            }

            var error = [CChar](repeating: 0, count: 4096)
            var rawMoves = [KGMoveResult](repeating: KGMoveResult(), count: 10)
            var written: Int32 = 0
            let color = nextColorName == "white" ? Int32(KG_COLOR_WHITE) : Int32(KG_COLOR_BLACK)

            let status = kg_mobile_analyze(
                engine,
                color,
                &rawMoves,
                Int32(rawMoves.count),
                &written,
                &error,
                error.count
            )

            guard status == KG_OK else {
                throw BridgeError(String(cString: error))
            }

            let results = rawMoves.prefix(Int(written)).map(Self.movePayload)
            let totalVisits = results.reduce(0) { total, move in
                total + (move["visits"] as? Int ?? 0)
            }

            if let first = results.first {
                let pv = (first["pv"] as? [String] ?? []).prefix(8).joined(separator: " ")
                let elapsedMs = Self.elapsedMilliseconds(since: startedAt)
                print("Go AI Review analyze top=\(first["gtp"] ?? "?") visits=\(first["visits"] ?? 0) elapsed=\(elapsedMs)ms profile=\(engineProfileSummary) pv=\(pv)")
            }

            respond(id: id, result: [
                "ok": true,
                "moves": results,
                "elapsedMs": Self.elapsedMilliseconds(since: startedAt),
                "totalVisits": totalVisits,
                "profile": engineProfileSummary,
                "profileSettings": engineProfileSettings,
                "profileWarnings": engineProfileWarnings,
            ])
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func handleStartOnlineAnalysis(id: String, payload: [String: Any]) {
        let requestedSize = payload["boardSize"] as? Int ?? 19
        let nextColorName = payload["nextColor"] as? String ?? "black"
        let moves = payload["moves"] as? [[String: Any]] ?? []
        let inference = payload["inference"] as? [String: Any] ?? [:]
        let requestedStreamID = payload["streamId"] as? String
        let callbackPeriod = payload["callbackPeriod"] as? Double ?? 0.05
        let firstCallbackAfter = payload["firstCallbackAfter"] as? Double ?? 0.05

        do {
            _ = stopActiveAnalysisStream()
            let startedAt = DispatchTime.now()
            let engine = try getEngine(boardSize: requestedSize, inference: inference)
            let positionSignature = Self.positionSignature(boardSize: requestedSize, nextColor: nextColorName, moves: moves)
            if enginePositionSignature != positionSignature {
                try clearBoard(engine: engine, boardSize: requestedSize)
                try replay(moves: moves, engine: engine)
                enginePositionSignature = positionSignature
            }

            analysisStreamSequence += 1
            let streamID = requestedStreamID ?? "\(analysisStreamSequence)"
            let stream = AnalysisStreamBox(
                bridge: self,
                streamID: streamID,
                positionSignature: positionSignature,
                startedAt: startedAt,
                profile: engineProfileSummary,
                profileSettings: engineProfileSettings,
                profileWarnings: engineProfileWarnings
            )
            setActiveAnalysisStream(stream)

            var error = [CChar](repeating: 0, count: 4096)
            let color = nextColorName == "white" ? Int32(KG_COLOR_WHITE) : Int32(KG_COLOR_BLACK)
            let status = kg_mobile_analyze_start(
                engine,
                color,
                10,
                max(0.02, callbackPeriod),
                max(0.0, firstCallbackAfter),
                Self.analysisCallback,
                Unmanaged.passUnretained(stream).toOpaque(),
                &error,
                error.count
            )

            guard status == KG_OK else {
                clearActiveAnalysisStream(ifMatching: stream)
                throw BridgeError(String(cString: error))
            }

            respond(id: id, result: [
                "ok": true,
                "streamId": streamID,
                "profile": engineProfileSummary,
                "profileSettings": engineProfileSettings,
                "profileWarnings": engineProfileWarnings,
            ])
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func handleResolveInference(id: String, payload: [String: Any]) {
        do {
            let inference = payload["inference"] as? [String: Any] ?? [:]
            let profile = inferenceProfile(modelPath: try activeModelPath(), settings: inference)
            respond(id: id, result: [
                "ok": true,
                "profile": profile.summary,
                "profileSettings": profile.settingsPayload,
                "profileWarnings": profile.warnings,
            ])
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func handleListModels(id: String) {
        do {
            respond(id: id, result: [
                "ok": true,
                "models": try availableModels(),
            ])
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func handleDownloadModel(id: String, payload: [String: Any]) {
        do {
            guard activeDownloadTask == nil else {
                throw BridgeError("Another model download is already running")
            }

            guard let rawURL = payload["url"] as? String,
                  let url = URL(string: rawURL),
                  url.scheme == "https" else {
                throw BridgeError("Model URL must be HTTPS")
            }

            let requestedName = payload["name"] as? String
            let fileName = sanitizedModelFileName(requestedName, fallback: url.lastPathComponent)
            let destination = try modelsDirectory().appendingPathComponent(fileName, isDirectory: false)

            if FileManager.default.fileExists(atPath: destination.path) {
                respond(id: id, result: [
                    "ok": true,
                    "reused": true,
                    "downloadedID": "local:\(fileName)",
                    "models": try availableModels(),
                ])
                return
            }

            let task = downloadSession.downloadTask(with: url)
            activeDownloadTask = task
            activeDownloadRequestID = id
            activeDownloadDestination = destination
            activeDownloadName = fileName
            sendDownloadProgress(name: fileName, written: 0, expected: 0)
            task.resume()
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func handleCancelModelDownload(id: String) {
        guard let activeDownloadTask else {
            respond(id: id, result: [
                "ok": true,
                "canceled": false,
            ])
            return
        }

        activeDownloadTask.cancel()
        respond(id: id, result: [
            "ok": true,
            "canceled": true,
        ])
    }

    private func handleImportModel(id: String) {
        guard pendingImportRequestID == nil else {
            respond(id: id, result: [
                "ok": false,
                "error": "Another model import is already open",
            ])
            return
        }

        pendingImportRequestID = id
        DispatchQueue.main.async {
            let pickerTypes: [UTType] = [
                UTType(filenameExtension: "gz") ?? .gzip,
                .data,
            ]
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: pickerTypes, asCopy: true)
            picker.delegate = self
            picker.allowsMultipleSelection = false
            guard let presenter = Self.topViewController() else {
                self.pendingImportRequestID = nil
                self.respond(id: id, result: [
                    "ok": false,
                    "error": "Unable to present document picker",
                ])
                return
            }
            presenter.present(picker, animated: true)
        }
    }

    private func handleSelectModel(id: String, payload: [String: Any]) {
        do {
            guard let modelID = payload["id"] as? String else {
                throw BridgeError("Model id is missing")
            }

            let modelURL = try modelURL(id: modelID)
            guard FileManager.default.fileExists(atPath: modelURL.path) else {
                throw BridgeError("Model is missing")
            }
            UserDefaults.standard.set(modelID, forKey: activeModelIDKey)
            UserDefaults.standard.set(modelURL.path, forKey: activeModelPathKey)

            destroyEngine()
            respond(id: id, result: [
                "ok": true,
                "models": try availableModels(),
            ])
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func handleDeleteModel(id: String, payload: [String: Any]) {
        do {
            guard let modelID = payload["id"] as? String else {
                throw BridgeError("Model id is missing")
            }

            guard modelID.hasPrefix("local:") || !modelID.contains(":") else {
                throw BridgeError("Bundled models cannot be deleted")
            }

            let modelURL = try modelURL(id: modelID)
            let wasActive = UserDefaults.standard.string(forKey: activeModelPathKey) == modelURL.path

            if FileManager.default.fileExists(atPath: modelURL.path) {
                try FileManager.default.removeItem(at: modelURL)
            }

            if wasActive {
                UserDefaults.standard.removeObject(forKey: activeModelIDKey)
                UserDefaults.standard.removeObject(forKey: activeModelPathKey)
                destroyEngine()
            }

            respond(id: id, result: [
                "ok": true,
                "models": try availableModels(),
            ])
        } catch {
            respond(id: id, result: [
                "ok": false,
                "error": error.localizedDescription,
            ])
        }
    }

    private func getEngine(boardSize: Int, inference: [String: Any]) throws -> OpaquePointer {
        let modelPath = try activeModelPath()
        let profile = inferenceProfile(modelPath: modelPath, settings: inference)
        if let engine,
           self.boardSize == boardSize,
           self.engineModelPath == modelPath,
           self.engineProfileID == profile.id {
            return engine
        }

        destroyEngine()

        guard let configPath = Bundle.main.path(forResource: "mobile_example", ofType: "cfg") else {
            throw BridgeError("mobile_example.cfg is missing from app bundle")
        }

        var activeProfile = profile
        var createResult = createEngine(modelPath: modelPath, configPath: configPath, boardSize: boardSize, profile: activeProfile)

        if createResult.engine == nil {
            let originalError = createResult.errorMessage
            for fallback in mediatedProfiles(from: profile, originalError: originalError) {
                createResult = createEngine(modelPath: modelPath, configPath: configPath, boardSize: boardSize, profile: fallback)
                if createResult.engine != nil {
                    activeProfile = fallback
                    break
                }
            }
        }

        guard let created = createResult.engine else {
            throw BridgeError("\(createResult.errorMessage). Try lowering Threads, Batch, or Cache.")
        }

        self.engine = created
        setLockedEngine(created)
        self.boardSize = boardSize
        self.engineModelPath = modelPath
        self.engineProfileID = activeProfile.id
        self.engineProfileSummary = activeProfile.summary
        self.engineProfileSettings = activeProfile.settingsPayload
        self.engineProfileWarnings = activeProfile.warnings
        print("Go AI Review engine profile=\(activeProfile.summary) modelBytes=\(fileSize(path: modelPath)) memoryGB=\(String(format: "%.1f", Self.physicalMemoryGB()))")
        return created
    }

    private func createEngine(
        modelPath: String,
        configPath: String,
        boardSize: Int,
        profile: InferenceProfile
    ) -> (engine: OpaquePointer?, errorMessage: String) {
        var options = KGEngineOptions()
        kg_mobile_default_options(&options)
        options.board_x_size = Int32(boardSize)
        options.board_y_size = Int32(boardSize)
        options.max_visits = profile.maxVisits
        options.max_time = profile.maxTime
        options.num_search_threads = profile.searchThreads
        options.nn_max_batch_size = profile.nnMaxBatchSize
        options.nn_cache_size_power_of_two = profile.nnCacheSizePowerOfTwo
        options.disable_fp16 = 0
        options.komi = Float(profile.komi)

        var error = [CChar](repeating: 0, count: 4096)
        let rules = profile.rules
        let created: OpaquePointer? = modelPath.withCString { modelCStr in
            configPath.withCString { configCStr in
                rules.withCString { rulesCStr in
                    options.model_path = modelCStr
                    options.config_path = configCStr
                    options.rules = rulesCStr
                    options.use_coreml = 0
                    options.coreml_model_path = nil
                    return kg_mobile_engine_create(&options, &error, error.count)
                }
            }
        }
        return (created, String(cString: error))
    }

    private func mediatedProfiles(from profile: InferenceProfile, originalError: String) -> [InferenceProfile] {
        [
            profile.adjustedForMediation(threads: min(profile.searchThreads, 4), batch: min(profile.nnMaxBatchSize, 8), cache: min(profile.nnCacheSizePowerOfTwo, 18), originalError: originalError),
            profile.adjustedForMediation(threads: min(profile.searchThreads, 2), batch: min(profile.nnMaxBatchSize, 4), cache: min(profile.nnCacheSizePowerOfTwo, 16), originalError: originalError),
            profile.adjustedForMediation(threads: 1, batch: min(profile.nnMaxBatchSize, 2), cache: min(profile.nnCacheSizePowerOfTwo, 15), originalError: originalError),
            profile.adjustedForMediation(threads: 1, batch: 1, cache: 13, originalError: originalError),
        ]
    }

    private func destroyEngine() {
        _ = stopActiveAnalysisStream()
        if let engine {
            setLockedEngine(nil)
            kg_mobile_engine_destroy(engine)
            self.engine = nil
        }
        engineModelPath = nil
        engineProfileID = nil
        engineProfileSettings = [:]
        engineProfileWarnings = []
        enginePositionSignature = nil
    }

    private func setLockedEngine(_ engine: OpaquePointer?) {
        engineLock.lock()
        self.engine = engine
        engineLock.unlock()
    }

    private func lockedEngine() -> OpaquePointer? {
        engineLock.lock()
        let engine = self.engine
        engineLock.unlock()
        return engine
    }

    private func setActiveAnalysisStream(_ stream: AnalysisStreamBox?) {
        streamLock.lock()
        activeAnalysisStream = stream
        streamLock.unlock()
    }

    private func currentActiveAnalysisStream() -> AnalysisStreamBox? {
        streamLock.lock()
        let stream = activeAnalysisStream
        streamLock.unlock()
        return stream
    }

    private func clearActiveAnalysisStream(ifMatching stream: AnalysisStreamBox) {
        streamLock.lock()
        if activeAnalysisStream === stream {
            activeAnalysisStream = nil
        }
        streamLock.unlock()
    }

    private func stopActiveAnalysisStream() -> Bool {
        let stream = currentActiveAnalysisStream()
        stream?.cancel()
        guard let engine = lockedEngine() else {
            if let stream {
                clearActiveAnalysisStream(ifMatching: stream)
                return true
            }
            return false
        }
        kg_mobile_stop(engine)
        if let stream {
            clearActiveAnalysisStream(ifMatching: stream)
        }
        return true
    }

    private func activeModelPath() throws -> String {
        if let modelID = UserDefaults.standard.string(forKey: activeModelIDKey),
           let url = try? modelURL(id: modelID),
           FileManager.default.fileExists(atPath: url.path) {
            UserDefaults.standard.set(url.path, forKey: activeModelPathKey)
            return url.path
        }
        if let path = UserDefaults.standard.string(forKey: activeModelPathKey),
           FileManager.default.fileExists(atPath: path) {
            return path
        }
        UserDefaults.standard.removeObject(forKey: activeModelIDKey)
        UserDefaults.standard.removeObject(forKey: activeModelPathKey)
        if let first = try bundledModelFiles().first {
            UserDefaults.standard.set("bundle:\(first.lastPathComponent)", forKey: activeModelIDKey)
            UserDefaults.standard.set(first.path, forKey: activeModelPathKey)
            return first.path
        }
        if let first = try localModelFiles().first {
            UserDefaults.standard.set("local:\(first.lastPathComponent)", forKey: activeModelIDKey)
            UserDefaults.standard.set(first.path, forKey: activeModelPathKey)
            return first.path
        }
        throw BridgeError("Import or bundle a KataGo model before starting analysis.")
    }

    private func availableModels() throws -> [[String: Any]] {
        let activeID = UserDefaults.standard.string(forKey: activeModelIDKey)
        let activePath = UserDefaults.standard.string(forKey: activeModelPathKey)
        let bundledFiles = try bundledModelFiles()
        let localFiles = try localModelFiles()
        let allFiles = bundledFiles + localFiles
        if let activePath, !allFiles.contains(where: { $0.path == activePath }) {
            UserDefaults.standard.removeObject(forKey: activeModelIDKey)
            UserDefaults.standard.removeObject(forKey: activeModelPathKey)
        }
        let selectedID = UserDefaults.standard.string(forKey: activeModelIDKey) ?? activeID
        let selectedPath = UserDefaults.standard.string(forKey: activeModelPathKey)

        var models: [[String: Any]] = []
        for file in bundledFiles {
            var model: [String: Any] = [
                "id": "bundle:\(file.lastPathComponent)",
                "name": file.lastPathComponent,
                "source": "Bundled",
                "selected": selectedID == "bundle:\(file.lastPathComponent)" || selectedPath == file.path,
                "bytes": fileSize(path: file.path),
                "deletable": false,
            ]
            model.merge(modelRuntimeMetadata(path: file.path)) { _, new in new }
            models.append(model)
        }
        for file in localFiles {
            var model: [String: Any] = [
                "id": "local:\(file.lastPathComponent)",
                "name": file.lastPathComponent,
                "source": "Imported",
                "selected": selectedID == "local:\(file.lastPathComponent)" || selectedPath == file.path,
                "bytes": fileSize(path: file.path),
                "deletable": true,
            ]
            model.merge(modelRuntimeMetadata(path: file.path)) { _, new in new }
            models.append(model)
        }

        return models
    }

    private func modelRuntimeMetadata(path: String) -> [String: Any] {
        return [
            "accelerators": ["Metal"],
        ]
    }

    private func modelsDirectory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = base.appendingPathComponent("KataGoModels", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func bundledModelFiles() throws -> [URL] {
        var candidates: [URL] = []
        if let modelsURL = Bundle.main.resourceURL?.appendingPathComponent("Models", isDirectory: true) {
            candidates.append(modelsURL)
        }
        if let resourceURL = Bundle.main.resourceURL {
            candidates.append(resourceURL)
        }

        var files: [URL] = []
        for directory in candidates {
            let entries = (try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.fileSizeKey],
                options: [.skipsHiddenFiles]
            )) ?? []
            files.append(contentsOf: entries.filter { $0.lastPathComponent.hasSuffix(".bin.gz") || $0.lastPathComponent.hasSuffix(".txt.gz") })
        }
        return files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
    }

    private func localModelFiles() throws -> [URL] {
        let directory = try modelsDirectory()
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        )) ?? []
        return files
            .filter { $0.lastPathComponent.hasSuffix(".bin.gz") || $0.lastPathComponent.hasSuffix(".txt.gz") }
            .sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
    }

    private func sanitizedModelFileName(_ requestedName: String?, fallback: String) -> String {
        let candidate = (requestedName?.isEmpty == false ? requestedName : fallback) ?? "katago-model.bin.gz"
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_")
        let sanitized = candidate.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
        let name = String(sanitized).trimmingCharacters(in: CharacterSet(charactersIn: ".-"))
        return name.isEmpty ? "katago-model.bin.gz" : name
    }

    private func modelURL(id: String) throws -> URL {
        if id.hasPrefix("bundle:") {
            let name = String(id.dropFirst("bundle:".count))
            guard name == sanitizedModelFileName(name, fallback: name), !name.contains("/") else {
                throw BridgeError("Invalid model id")
            }
            if let file = try bundledModelFiles().first(where: { $0.lastPathComponent == name }) {
                return file
            }
            throw BridgeError("Bundled model is missing")
        }

        let name = id.hasPrefix("local:") ? String(id.dropFirst("local:".count)) : id
        guard name == sanitizedModelFileName(name, fallback: name), !name.contains("/") else {
            throw BridgeError("Invalid model id")
        }
        return try modelsDirectory().appendingPathComponent(name, isDirectory: false)
    }

    private func fileSize(path: String) -> Int64 {
        let attributes = try? FileManager.default.attributesOfItem(atPath: path)
        return attributes?[.size] as? Int64 ?? 0
    }

    private func inferenceProfile(modelPath: String, settings: [String: Any]) -> InferenceProfile {
        let modelBytes = fileSize(path: modelPath)
        let memoryGB = Self.physicalMemoryGB()
        let hardwareProfile = Self.devicePerformanceProfile()
        let processorCount = hardwareProfile.cpuCores
        let highEndGPU = (hardwareProfile.gpuCores ?? 0) >= 6
        let constrained = ProcessInfo.processInfo.isLowPowerModeEnabled || Self.isThermallyConstrained()
        let accelerator = "metal"
        let maxAllowedThreads = Int32(max(1, min(12, processorCount)))
        let maxAllowedBatch: Int32 = {
            if memoryGB >= 8 && highEndGPU {
                return 32
            }
            if memoryGB >= 6 && highEndGPU {
                return 24
            }
            return 16
        }()
        let maxAllowedVisits: Int64 = 1_000_000
        let maxAllowedTime = 60.0
        let maxAllowedCache: Int32 = 20

        let modelClass: String
        let defaultVisits: Int64
        let defaultTime: Double
        let defaultThreads: Int32
        let defaultBatch: Int32
        let defaultCache: Int32

        if modelBytes >= 180_000_000 {
            modelClass = "large"
            defaultVisits = constrained || memoryGB < 6 ? 12 : (memoryGB >= 8 ? 48 : 24)
            defaultTime = constrained ? 4.0 : (memoryGB >= 8 ? 10.0 : 6.0)
            defaultThreads = processorCount >= 6 && memoryGB >= 8 && !constrained ? 3 : 1
            defaultBatch = memoryGB < 6 ? 1 : (memoryGB >= 8 && highEndGPU ? 8 : (memoryGB >= 8 ? 4 : 2))
            defaultCache = memoryGB < 6 ? 13 : (memoryGB >= 8 ? 15 : 14)
        } else if modelBytes >= 60_000_000 {
            modelClass = "medium"
            defaultVisits = constrained ? 20 : (highEndGPU ? 64 : 32)
            defaultTime = constrained ? 3.0 : (highEndGPU ? 6.0 : 4.5)
            defaultThreads = processorCount >= 6 && !constrained ? 3 : 1
            defaultBatch = memoryGB < 4 ? 2 : (highEndGPU ? 12 : 4)
            defaultCache = memoryGB < 4 ? 14 : 15
        } else {
            modelClass = "small"
            defaultVisits = constrained ? 40 : (highEndGPU ? 96 : 64)
            defaultTime = constrained ? 2.0 : (highEndGPU ? 4.0 : 3.0)
            defaultThreads = processorCount >= 6 && !constrained ? 3 : 1
            defaultBatch = memoryGB < 4 ? 4 : (highEndGPU ? 16 : 8)
            defaultCache = memoryGB < 4 ? 16 : 17
        }

        let preset = (settings["preset"] as? String) ?? "balanced"
        let requestedRules = Self.settingString(settings, key: "rules") ?? "chinese"
        let (rules, rulesLabel, rulesWasFallback) = Self.normalizedRules(requestedRules)
        let komi = Self.clampDouble(Self.settingDouble(settings, key: "komi") ?? Self.defaultKomi(for: rules), min: -99.5, max: 99.5)
        let onlineMode = Self.settingBool(settings, key: "online")
        let multiplier: Double
        switch preset {
        case "fast":
            multiplier = 0.55
        case "strong":
            multiplier = 4.0
        default:
            multiplier = 1.0
        }

        let presetVisits = Int64((Double(defaultVisits) * multiplier).rounded())
        let presetTime = defaultTime * (preset == "fast" ? 0.75 : (preset == "strong" ? 3.0 : 1.0))
        let presetThreads = preset == "fast"
            ? min(defaultThreads, 1)
            : (preset == "strong" ? min(maxAllowedThreads, max(defaultThreads + 2, 4)) : defaultThreads)
        let presetBatch = preset == "strong" ? min(maxAllowedBatch, max(defaultBatch, defaultBatch * 2)) : defaultBatch
        let presetCache = preset == "strong" ? min(maxAllowedCache, defaultCache + 1) : defaultCache
        let requestedBatchSetting = Self.settingInt32(settings, key: "nnMaxBatchSize")

        let maxVisits = onlineMode
            ? Int64(-1)
            : Self.clampInt64(Self.settingInt64(settings, key: "maxVisits") ?? presetVisits, min: 4, max: maxAllowedVisits)
        let maxTime = onlineMode
            ? -1.0
            : Self.clampDouble(Self.settingDouble(settings, key: "maxTime") ?? presetTime, min: 1.0, max: maxAllowedTime)
        let searchThreads = Self.clampInt32(Self.settingInt32(settings, key: "searchThreads") ?? presetThreads, min: 1, max: maxAllowedThreads)
        let nnMaxBatchSize = Self.clampInt32(requestedBatchSetting ?? presetBatch, min: 1, max: maxAllowedBatch)
        let nnCacheSizePowerOfTwo = Self.clampInt32(Self.settingInt32(settings, key: "nnCacheSizePowerOfTwo") ?? presetCache, min: 12, max: maxAllowedCache)
        let effectiveAccelerator = "metal"
        var warnings = Self.profileWarnings(
            modelClass: modelClass,
            memoryGB: memoryGB,
            constrained: constrained,
            maxVisits: maxVisits,
            searchThreads: searchThreads,
            nnMaxBatchSize: nnMaxBatchSize,
            nnCacheSizePowerOfTwo: nnCacheSizePowerOfTwo,
            hardwareProfile: hardwareProfile
        )
        if rulesWasFallback {
            warnings.append("Unsupported rules '\(requestedRules)' requested; using Chinese rules.")
        }
        if onlineMode {
            warnings.append("Online mode ignores manual visits/time and refreshes analysis in short time slices.")
        }
        if searchThreads > processorCount {
            warnings.append("Threads above CPU core count are expert overcommit and may compete with Metal work.")
        }
        if MTLCreateSystemDefaultDevice() == nil {
            warnings.append("Metal device is unavailable; performance may be limited on this runtime.")
        }

        let mode = onlineMode ? "online" : (constrained ? "constrained" : "normal")
        let acceleratorSummary = accelerator == effectiveAccelerator ? accelerator : "\(accelerator)->\(effectiveAccelerator)"
        let id = [
            modelClass,
            mode,
            preset,
            accelerator,
            effectiveAccelerator,
            "\(maxVisits)",
            "\(String(format: "%.2f", maxTime))",
            "\(searchThreads)",
            "\(nnMaxBatchSize)",
            "\(nnCacheSizePowerOfTwo)",
            rules,
            "\(String(format: "%.1f", komi))",
        ].joined(separator: ":")
        let limitSummary = onlineMode ? "streaming" : "visits=\(maxVisits) time=\(String(format: "%.1f", maxTime))s"
        let summary = "\(modelClass)-\(mode)-\(preset) accel=\(acceleratorSummary) rules=\(rulesLabel) komi=\(String(format: "%.1f", komi)) \(limitSummary) threads=\(searchThreads) batch=\(nnMaxBatchSize) cache=2^\(nnCacheSizePowerOfTwo)"
        return InferenceProfile(
            id: id,
            summary: summary,
            maxVisits: maxVisits,
            maxTime: maxTime,
            searchThreads: searchThreads,
            nnMaxBatchSize: nnMaxBatchSize,
            nnCacheSizePowerOfTwo: nnCacheSizePowerOfTwo,
            preset: preset,
            accelerator: accelerator,
            effectiveAccelerator: effectiveAccelerator,
            rules: rules,
            rulesLabel: rulesLabel,
            komi: komi,
            onlineMode: onlineMode,
            maxAllowedVisits: maxAllowedVisits,
            maxAllowedTime: maxAllowedTime,
            maxAllowedThreads: maxAllowedThreads,
            maxAllowedBatch: maxAllowedBatch,
            maxAllowedCache: maxAllowedCache,
            warnings: warnings
        )
    }

    private static func profileWarnings(
        modelClass: String,
        memoryGB: Double,
        constrained: Bool,
        maxVisits: Int64,
        searchThreads: Int32,
        nnMaxBatchSize: Int32,
        nnCacheSizePowerOfTwo: Int32,
        hardwareProfile: DevicePerformanceProfile
    ) -> [String] {
        var warnings: [String] = []
        if constrained {
            warnings.append("Device is thermally or power constrained; high settings may be slow.")
        }
        if maxVisits > 65_536 {
            warnings.append("Very high visits can run for a long time and may heat the iPhone.")
        } else if maxVisits > 16_384 {
            warnings.append("High visits may use noticeably more battery and time.")
        }
        if let performanceCpuCores = hardwareProfile.performanceCpuCores,
           searchThreads > performanceCpuCores {
            warnings.append("Threads above the performance-core count will use efficiency cores too.")
        }
        if modelClass == "large" && searchThreads > 2 {
            warnings.append("Large model with Threads > 2 may heat up or slow UI.")
        } else if searchThreads >= 5 {
            warnings.append("High thread count may compete with UI and Metal work.")
        }
        if modelClass == "large" && nnMaxBatchSize > 4 {
            warnings.append("Large model with Batch > 4 can raise memory pressure.")
        } else if nnMaxBatchSize >= 24 {
            warnings.append("Very high batch can increase Metal memory pressure and analysis latency.")
        } else if nnMaxBatchSize >= 12 {
            warnings.append("High batch can improve throughput but increases latency and memory use.")
        }
        if modelClass == "large" && nnCacheSizePowerOfTwo > 16 {
            warnings.append("Large model cache above 2^16 may use substantial memory.")
        } else if nnCacheSizePowerOfTwo >= 19 {
            warnings.append("Cache 2^\(nnCacheSizePowerOfTwo) may consume significant memory.")
        }
        if memoryGB < 6 && (nnMaxBatchSize > 4 || nnCacheSizePowerOfTwo > 17) {
            warnings.append("This device has limited memory for the selected batch/cache.")
        }
        return warnings
    }

    private static func physicalMemoryGB() -> Double {
        Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824.0
    }

    private static func isThermallyConstrained() -> Bool {
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical:
            return true
        default:
            return false
        }
    }

    private static func thermalStateName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal:
            return "nominal"
        case .fair:
            return "fair"
        case .serious:
            return "serious"
        case .critical:
            return "critical"
        @unknown default:
            return "unknown"
        }
    }

    private static func settingInt64(_ settings: [String: Any], key: String) -> Int64? {
        if let value = settings[key] as? Int {
            return Int64(value)
        }
        if let value = settings[key] as? Double {
            return Int64(value)
        }
        if let value = settings[key] as? String, let parsed = Int64(value) {
            return parsed
        }
        return nil
    }

    private static func settingInt32(_ settings: [String: Any], key: String) -> Int32? {
        guard let value = settingInt64(settings, key: key) else { return nil }
        return Int32(max(Int64(Int32.min), min(Int64(Int32.max), value)))
    }

    private static func settingDouble(_ settings: [String: Any], key: String) -> Double? {
        if let value = settings[key] as? Double {
            return value
        }
        if let value = settings[key] as? Int {
            return Double(value)
        }
        if let value = settings[key] as? String, let parsed = Double(value) {
            return parsed
        }
        return nil
    }

    private static func settingString(_ settings: [String: Any], key: String) -> String? {
        guard let value = settings[key] as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func settingBool(_ settings: [String: Any], key: String) -> Bool {
        if let value = settings[key] as? Bool {
            return value
        }
        if let value = settings[key] as? String {
            return value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "true"
        }
        if let value = settings[key] as? Int {
            return value != 0
        }
        return false
    }

    private static func normalizedRules(_ rawValue: String) -> (rules: String, label: String, fallback: Bool) {
        let key = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch key {
        case "chinese":
            return ("chinese", "Chinese", false)
        case "japanese", "korean":
            return ("japanese", "Japanese", false)
        case "aga", "bga", "french":
            return ("aga", "AGA", false)
        case "new-zealand", "new_zealand", "newzealand", "new zealand", "nz":
            return ("new-zealand", "New Zealand", false)
        case "tromp-taylor", "tromp_taylor", "tromptaylor", "tromp taylor":
            return ("tromp-taylor", "Tromp-Taylor", false)
        default:
            return ("chinese", "Chinese", true)
        }
    }

    private static func defaultKomi(for rules: String) -> Double {
        rules == "japanese" ? 6.5 : 7.5
    }

    private static func devicePerformanceProfile() -> DevicePerformanceProfile {
        let identifier = deviceIdentifier()
        let cpuCores = ProcessInfo.processInfo.processorCount
        switch identifier {
        case "iPhone17,1", "iPhone17,2":
            return DevicePerformanceProfile(
                identifier: identifier,
                cpuCores: 6,
                performanceCpuCores: 2,
                efficiencyCpuCores: 4,
                gpuCores: 6,
                neuralEngineCores: 16
            )
        case "iPhone17,3", "iPhone17,4", "iPhone17,5":
            return DevicePerformanceProfile(
                identifier: identifier,
                cpuCores: 6,
                performanceCpuCores: 2,
                efficiencyCpuCores: 4,
                gpuCores: 5,
                neuralEngineCores: 16
            )
        default:
            return DevicePerformanceProfile(
                identifier: identifier,
                cpuCores: cpuCores,
                performanceCpuCores: nil,
                efficiencyCpuCores: nil,
                gpuCores: nil,
                neuralEngineCores: nil
            )
        }
    }

    private static func deviceIdentifier() -> String {
        if let simulatorIdentifier = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"],
           !simulatorIdentifier.isEmpty {
            return simulatorIdentifier
        }

        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafeBytes(of: &systemInfo.machine) { rawBuffer -> String in
            let bytes = rawBuffer.bindMemory(to: CChar.self)
            return String(cString: bytes.baseAddress!)
        }
        return machine.isEmpty ? "unknown" : machine
    }

    private static func clampInt64(_ value: Int64, min minimum: Int64, max maximum: Int64) -> Int64 {
        Swift.max(minimum, Swift.min(maximum, value))
    }

    private static func clampInt32(_ value: Int32, min minimum: Int32, max maximum: Int32) -> Int32 {
        Swift.max(minimum, Swift.min(maximum, value))
    }

    private static func clampDouble(_ value: Double, min minimum: Double, max maximum: Double) -> Double {
        Swift.max(minimum, Swift.min(maximum, value))
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        queue.async {
            guard self.activeDownloadTask?.taskIdentifier == downloadTask.taskIdentifier else { return }
            self.sendDownloadProgress(
                name: self.activeDownloadName ?? "KataGo model",
                written: totalBytesWritten,
                expected: totalBytesExpectedToWrite
            )
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        // URLSession only guarantees this temporary file while this delegate
        // callback is running, so the move must complete before returning.
        queue.sync {
            guard self.activeDownloadTask?.taskIdentifier == downloadTask.taskIdentifier,
                  let requestID = self.activeDownloadRequestID,
                  let destination = self.activeDownloadDestination else {
                return
            }

            do {
                if let httpResponse = downloadTask.response as? HTTPURLResponse,
                   !(200..<300).contains(httpResponse.statusCode) {
                    throw BridgeError("Download failed with HTTP \(httpResponse.statusCode)")
                }

                try FileManager.default.createDirectory(
                    at: destination.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                if FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.removeItem(at: destination)
                }
                try FileManager.default.moveItem(at: location, to: destination)

                self.clearActiveDownload()
                self.sendDownloadProgress(name: destination.lastPathComponent, written: 1, expected: 1)
                self.respond(id: requestID, result: [
                    "ok": true,
                    "reused": false,
                    "downloadedID": "local:\(destination.lastPathComponent)",
                    "models": try self.availableModels(),
                ])
            } catch {
                self.clearActiveDownload()
                self.respond(id: requestID, result: [
                    "ok": false,
                    "error": error.localizedDescription,
                ])
            }
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        queue.async {
            guard self.activeDownloadTask?.taskIdentifier == task.taskIdentifier,
                  let requestID = self.activeDownloadRequestID,
                  let error else {
                return
            }

            self.clearActiveDownload()
            let nsError = error as NSError
            let message = nsError.code == NSURLErrorCancelled ? "Download canceled" : error.localizedDescription
            self.respond(id: requestID, result: [
                "ok": false,
                "error": message,
            ])
        }
    }

    private func clearActiveDownload() {
        activeDownloadTask = nil
        activeDownloadRequestID = nil
        activeDownloadDestination = nil
        activeDownloadName = nil
    }

    private func sendDownloadProgress(name: String, written: Int64, expected: Int64) {
        let progress = expected > 0 ? max(0, min(1, Double(written) / Double(expected))) : 0
        let payload: [String: Any] = [
            "name": name,
            "bytesWritten": written,
            "bytesExpected": expected,
            "progress": progress,
        ]

        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        let script = "window.katagoNativeDownloadProgress && window.katagoNativeDownloadProgress(\(json));"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(script)
        }
    }

    private func clearBoard(engine: OpaquePointer, boardSize: Int) throws {
        var error = [CChar](repeating: 0, count: 1024)
        let status = kg_mobile_clear_board(
            engine,
            Int32(boardSize),
            Int32(boardSize),
            &error,
            error.count
        )
        guard status == KG_OK else {
            throw BridgeError(String(cString: error))
        }
    }

    private func replay(moves: [[String: Any]], engine: OpaquePointer) throws {
        for move in moves {
            let colorName = move["color"] as? String ?? "black"
            let color = colorName == "white" ? Int32(KG_COLOR_WHITE) : Int32(KG_COLOR_BLACK)
            let x = move["x"] as? Int ?? Int(KG_COORD_PASS)
            let y = move["y"] as? Int ?? Int(KG_COORD_PASS)
            var error = [CChar](repeating: 0, count: 1024)
            let status = kg_mobile_play(engine, color, Int32(x), Int32(y), &error, error.count)
            guard status == KG_OK else {
                throw BridgeError(String(cString: error))
            }
        }
    }

    private static func positionSignature(boardSize: Int, nextColor: String, moves: [[String: Any]]) -> String {
        var parts = ["b\(boardSize)", "n\(nextColor == "white" ? "w" : "b")"]
        parts.reserveCapacity(moves.count + 2)
        for move in moves {
            let color = (move["color"] as? String) == "white" ? "w" : "b"
            let x = move["x"] as? Int ?? Int(KG_COORD_PASS)
            let y = move["y"] as? Int ?? Int(KG_COORD_PASS)
            parts.append("\(color):\(x),\(y)")
        }
        return parts.joined(separator: "|")
    }

    private static let analysisCallback: KGAnalysisCallback = { results, resultsWritten, userData in
        guard let userData else {
            return
        }
        let stream = Unmanaged<AnalysisStreamBox>.fromOpaque(userData).takeUnretainedValue()
        guard !stream.isCancelled, let bridge = stream.bridge else {
            return
        }
        guard let results, resultsWritten > 0 else {
            return
        }

        let count = Int(resultsWritten)
        let buffer = UnsafeBufferPointer(start: results, count: count)
        let moves = buffer.map(KataGoWebBridge.movePayload)
        let totalVisits = moves.reduce(0) { total, move in
            total + (move["visits"] as? Int ?? 0)
        }
        bridge.sendAnalysisUpdate([
            "streamId": stream.streamID,
            "moves": moves,
            "totalVisits": totalVisits,
            "elapsedMs": KataGoWebBridge.elapsedMilliseconds(since: stream.startedAt),
            "profile": stream.profile,
            "profileSettings": stream.profileSettings,
            "profileWarnings": stream.profileWarnings,
        ])
    }

    private static func movePayload(_ move: KGMoveResult) -> [String: Any] {
        var copy = move
        let pv = Self.pvString(&copy)
            .split(separator: " ")
            .map(String.init)
        return [
            "gtp": Self.gtpString(copy.gtp),
            "x": Int(copy.x),
            "y": Int(copy.y),
            "isPass": copy.is_pass != 0,
            "visits": Int(copy.visits),
            "winrate": copy.winrate,
            "scoreLead": copy.score_lead,
            "scoreMean": copy.score_mean,
            "utility": copy.utility,
            "policyPrior": copy.policy_prior,
            "pv": pv,
            "pvLen": Int(copy.pv_len),
        ]
    }

    private func sendAnalysisUpdate(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        let script = "window.katagoNativeAnalysisUpdate && window.katagoNativeAnalysisUpdate(\(json));"

        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(script)
        }
    }

    private func respond(id: String, result: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(result),
              let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        let escapedID = id.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
        let script = "window.katagoNativeResponse && window.katagoNativeResponse('\(escapedID)', \(json));"

        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(script)
        }
    }

    private static func gtpString(_ tuple: (CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar, CChar)) -> String {
        var copy = tuple
        return withUnsafePointer(to: &copy) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: 16) { chars in
                String(cString: chars)
            }
        }
    }

    private static func pvString(_ result: UnsafePointer<KGMoveResult>) -> String {
        String(cString: kg_mobile_move_result_pv(result))
    }

    private static func elapsedMilliseconds(since start: DispatchTime) -> Int {
        let elapsed = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds
        return Int(elapsed / 1_000_000)
    }

    private static func topViewController(base: UIViewController? = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }?
        .rootViewController
    ) -> UIViewController? {
        if let navigation = base as? UINavigationController {
            return topViewController(base: navigation.visibleViewController)
        }
        if let tab = base as? UITabBarController,
           let selected = tab.selectedViewController {
            return topViewController(base: selected)
        }
        if let presented = base?.presentedViewController {
            return topViewController(base: presented)
        }
        return base
    }
}

extension KataGoWebBridge: UIDocumentPickerDelegate {
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let requestID = pendingImportRequestID else { return }
        pendingImportRequestID = nil
        guard let source = urls.first else {
            respond(id: requestID, result: [
                "ok": false,
                "error": "No model file selected",
            ])
            return
        }

        queue.async {
            let scoped = source.startAccessingSecurityScopedResource()
            defer {
                if scoped {
                    source.stopAccessingSecurityScopedResource()
                }
            }

            do {
                let fileName = self.sanitizedModelFileName(source.lastPathComponent, fallback: "katago-model.bin.gz")
                guard fileName.hasSuffix(".bin.gz") || fileName.hasSuffix(".txt.gz") else {
                    throw BridgeError("Select a KataGo .bin.gz or .txt.gz model file")
                }
                let destination = try self.modelsDirectory().appendingPathComponent(fileName, isDirectory: false)
                if FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.removeItem(at: destination)
                }
                try FileManager.default.copyItem(at: source, to: destination)
                self.respond(id: requestID, result: [
                    "ok": true,
                    "importedID": "local:\(fileName)",
                    "models": try self.availableModels(),
                ])
            } catch {
                self.respond(id: requestID, result: [
                    "ok": false,
                    "error": error.localizedDescription,
                ])
            }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let requestID = pendingImportRequestID else { return }
        pendingImportRequestID = nil
        respond(id: requestID, result: [
            "ok": false,
            "error": "Model import canceled",
        ])
    }
}

private struct BridgeError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? {
        message
    }
}

private struct DevicePerformanceProfile {
    let identifier: String
    let cpuCores: Int
    let performanceCpuCores: Int?
    let efficiencyCpuCores: Int?
    let gpuCores: Int?
    let neuralEngineCores: Int?
}

private struct InferenceProfile {
    let id: String
    let summary: String
    let maxVisits: Int64
    let maxTime: Double
    let searchThreads: Int32
    let nnMaxBatchSize: Int32
    let nnCacheSizePowerOfTwo: Int32
    let preset: String
    let accelerator: String
    let effectiveAccelerator: String
    let rules: String
    let rulesLabel: String
    let komi: Double
    let onlineMode: Bool
    let maxAllowedVisits: Int64
    let maxAllowedTime: Double
    let maxAllowedThreads: Int32
    let maxAllowedBatch: Int32
    let maxAllowedCache: Int32
    let warnings: [String]

    var settingsPayload: [String: Any] {
        let payload: [String: Any] = [
            "preset": preset,
            "accelerator": accelerator,
            "effectiveAccelerator": effectiveAccelerator,
            "rules": rules,
            "rulesLabel": rulesLabel,
            "komi": komi,
            "maxVisits": Int(maxVisits),
            "maxTime": maxTime,
            "searchThreads": Int(searchThreads),
            "nnMaxBatchSize": Int(nnMaxBatchSize),
            "nnCacheSizePowerOfTwo": Int(nnCacheSizePowerOfTwo),
            "online": onlineMode,
            "maxAllowedVisits": Int(maxAllowedVisits),
            "maxAllowedTime": maxAllowedTime,
            "maxAllowedThreads": Int(maxAllowedThreads),
            "maxAllowedBatch": Int(maxAllowedBatch),
            "maxAllowedCache": Int(maxAllowedCache),
        ]
        return payload
    }

    func adjustedForMediation(threads: Int32, batch: Int32, cache: Int32, originalError: String) -> InferenceProfile {
        let nextThreads = max(1, min(searchThreads, threads))
        let nextBatch = max(1, min(nnMaxBatchSize, batch))
        let nextCache = max(12, min(nnCacheSizePowerOfTwo, cache))
        let mediatedWarning = "Engine start failed; reduced to threads=\(nextThreads), batch=\(nextBatch), cache=2^\(nextCache)."
        let errorWarning = originalError.isEmpty ? nil : "Original error: \(originalError)"
        var nextWarnings = warnings.filter { !$0.hasPrefix("Engine start failed;") && !$0.hasPrefix("Original error:") }
        nextWarnings.append(mediatedWarning)
        if let errorWarning {
            nextWarnings.append(errorWarning)
        }
        let nextSummary = summary.replacingOccurrences(
            of: #"threads=\d+ batch=\d+ cache=2\^\d+"#,
            with: "threads=\(nextThreads) batch=\(nextBatch) cache=2^\(nextCache)",
            options: .regularExpression
        )
        let nextID = [
            id,
            "mediated",
            "\(nextThreads)",
            "\(nextBatch)",
            "\(nextCache)",
        ].joined(separator: ":")
        return InferenceProfile(
            id: nextID,
            summary: nextSummary,
            maxVisits: maxVisits,
            maxTime: maxTime,
            searchThreads: nextThreads,
            nnMaxBatchSize: nextBatch,
            nnCacheSizePowerOfTwo: nextCache,
            preset: preset,
            accelerator: accelerator,
            effectiveAccelerator: effectiveAccelerator,
            rules: rules,
            rulesLabel: rulesLabel,
            komi: komi,
            onlineMode: onlineMode,
            maxAllowedVisits: maxAllowedVisits,
            maxAllowedTime: maxAllowedTime,
            maxAllowedThreads: maxAllowedThreads,
            maxAllowedBatch: maxAllowedBatch,
            maxAllowedCache: maxAllowedCache,
            warnings: nextWarnings
        )
    }
}
