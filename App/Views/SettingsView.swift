import LimitenKit
import SwiftUI

/// Dashboard URL, widget token, connection test and clearing the token.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var urlText = ""
    @State private var tokenText = ""
    @State private var isTesting = false
    @State private var testResult: ConnectionTestResult?
    @State private var confirmingClear = false

    private var urlIsValid: Bool {
        DashboardURL.normalize(urlText) != nil
    }

    private var canTest: Bool {
        urlIsValid && !isTesting && (model.hasToken || !tokenText.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://mijn-dashboard.netlify.app", text: $urlText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.URL)
                } header: {
                    Text("Dashboard-URL")
                } footer: {
                    if !urlText.isEmpty && !urlIsValid {
                        Text("Gebruik een https-adres.")
                    }
                }

                Section {
                    SecureField(
                        model.hasToken ? "Opgeslagen (leeg laten om te behouden)" : "Plak je widgettoken",
                        text: $tokenText
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                } header: {
                    Text("Widgettoken")
                } footer: {
                    Text("De token wordt alleen in de Keychain van dit toestel bewaard, en pas na een geslaagde test.")
                }

                Section {
                    Button {
                        Task { await runTest() }
                    } label: {
                        HStack {
                            Text("Verbinding testen")
                            if isTesting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!canTest)

                    if let testResult {
                        TestResultView(result: testResult)
                    }
                }

                Section {
                    Button("Token wissen", role: .destructive) {
                        confirmingClear = true
                    }
                    .disabled(!model.hasToken)
                }
            }
            .navigationTitle("Instellingen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Klaar") { dismiss() }
                }
            }
            .confirmationDialog("Token wissen?", isPresented: $confirmingClear, titleVisibility: .visible) {
                Button("Token wissen", role: .destructive) {
                    model.clearToken()
                    tokenText = ""
                    testResult = nil
                }
            } message: {
                Text("De app en widgets tonen daarna geen gegevens meer tot je een nieuwe token invult.")
            }
            .onAppear {
                urlText = model.dashboardURLText
            }
        }
    }

    private func runTest() async {
        isTesting = true
        testResult = nil
        let result = await model.testConnection(urlText: urlText, newToken: tokenText)
        if case .success = result {
            tokenText = ""
            urlText = model.dashboardURLText
        }
        testResult = result
        isTesting = false
    }
}

/// Clear outcome of the connection test: icon + words, not color alone.
private struct TestResultView: View {
    let result: ConnectionTestResult

    var body: some View {
        switch result {
        case let .success(count):
            Label {
                Text("Verbonden. \(count) \(count == 1 ? "limiet" : "limieten") opgehaald.")
            } icon: {
                Image(systemName: Level.ok.symbolName).foregroundStyle(Level.ok.color)
            }
        case let .failure(error):
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(for: error)).font(.subheadline.weight(.semibold))
                    Text(error.message).font(.footnote).foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: icon(for: error)).foregroundStyle(Level.danger.color)
            }
        }
    }

    private func title(for error: WidgetAPIError) -> String {
        switch error {
        case .unauthorized: "Token geweigerd"
        case .offline, .timeout, .hostNotFound, .network: "Netwerkfout"
        case .invalidURL, .missingToken: "Gegevens onvolledig"
        default: "Mislukt"
        }
    }

    private func icon(for error: WidgetAPIError) -> String {
        switch error {
        case .unauthorized: "key.slash"
        case .offline, .timeout, .hostNotFound, .network: "wifi.exclamationmark"
        default: "exclamationmark.triangle.fill"
        }
    }
}

#Preview("Instellingen") {
    SettingsView()
        .environment(AppModel.preview())
}

#Preview("Token geweigerd") {
    SettingsView()
        .environment(AppModel.preview(statusCode: 401, body: Data(#"{"error":"Unauthorized"}"#.utf8)))
}
