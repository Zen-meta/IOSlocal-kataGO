import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        SabakiWebView()
            .ignoresSafeArea(.container, edges: .bottom)
            .background(Color(red: 0.13, green: 0.12, blue: 0.10))
    }
}

struct SabakiWebView: UIViewRepresentable {
    func makeCoordinator() -> KataGoWebBridge {
        KataGoWebBridge()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "katago")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = webView

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            webView.loadHTMLString("<html><body>Missing Web/index.html</body></html>", baseURL: nil)
            return webView
        }

        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

