import LimitenKit
import SwiftUI

/// Phase 1 main screen: headline, status line and the raw list of limits.
struct ContentView: View {
    @Environment(AppModel.self) private var model
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Limieten")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showingSettings = true
                        } label: {
                            Label("Instellingen", systemImage: "gearshape")
                        }
                    }
                }
                .sheet(isPresented: $showingSettings) {
                    SettingsView()
                }
                .task {
                    if model.isConfigured {
                        await model.refresh()
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let response = model.response {
            List {
                Section {
                    Text(response.summary.headline)
                        .font(.headline)
                    statusLine
                }
                Section("Limieten") {
                    ForEach(response.limits) { limit in
                        RawLimitRow(limit: limit)
                    }
                }
                if !response.problems.isEmpty {
                    Section("Problemen bij bronnen") {
                        ForEach(response.problems, id: \.self) { problem in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(problem.name).font(.subheadline.weight(.semibold))
                                Text(problem.message).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .refreshable {
                await model.refresh()
            }
        } else if model.isLoading {
            ProgressView("Gegevens ophalen…")
        } else if model.isConfigured {
            ContentUnavailableView {
                Label("Nog geen gegevens", systemImage: "gauge.with.dots.needle.33percent")
            } description: {
                Text(model.lastError?.message ?? "Trek omlaag of tik op Vernieuwen.")
            } actions: {
                Button("Vernieuwen") {
                    Task { await model.refresh() }
                }
            }
        } else {
            ContentUnavailableView {
                Label("Nog niet ingesteld", systemImage: "gauge.with.dots.needle.33percent")
            } description: {
                Text("Vul de dashboard-URL en je widgettoken in.")
            } actions: {
                Button("Naar instellingen") {
                    showingSettings = true
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    /// "Bijgewerkt 3m geleden", plus a light note when the last refresh failed.
    private var statusLine: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let updated = model.lastUpdated {
                Text(Format.updated(updated))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let error = model.lastError {
                Label(error.message, systemImage: "wifi.exclamationmark")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// One limit, unstyled (the full rows with bars come in phase 2).
struct RawLimitRow: View {
    let limit: UsageLimit

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(limit.displayName)
                    .font(.body)
                Text(limit.leftText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    StatusLabel(level: limit.level)
                    if limit.stale {
                        Text("verouderd")
                    }
                }
                .font(.caption)
            }
            Spacer()
            Text(limit.leftPercentText)
                .font(.title3.monospacedDigit().weight(.semibold))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(limit.accessibilityLabel())
    }
}

#Preview("Met gegevens") {
    ContentView()
        .environment(AppModel.preview())
}

#Preview("Niet ingesteld") {
    ContentView()
        .environment(AppModel.preview(token: nil, loaded: false))
}

#Preview("Offline met cache") {
    ContentView()
        .environment(AppModel.preview(statusCode: 500))
}
