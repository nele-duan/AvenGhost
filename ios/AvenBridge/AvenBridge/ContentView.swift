import SwiftUI
import Combine

struct ContentView: View {
    @StateObject private var healthManager = HealthManager()
    @State private var serverURL: String = UserDefaults.standard.string(forKey: "serverURL") ?? ""
    @State private var apiKey: String = UserDefaults.standard.string(forKey: "apiKey") ?? "aven-health-secret"
    @State private var lastSyncTime: Date? = nil
    @State private var syncError: String? = nil
    @State private var isSyncing: Bool = false
    @State private var autoSyncEnabled: Bool = UserDefaults.standard.bool(forKey: "autoSync")
    
    private let timer = Timer.publish(every: 300, on: .main, in: .common).autoconnect()  // 5 minutes
    
    var body: some View {
        NavigationView {
            List {
                // Status Section
                Section("Connection Status") {
                    HStack {
                        Image(systemName: healthManager.isAuthorized ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundColor(healthManager.isAuthorized ? .green : .red)
                        Text(healthManager.isAuthorized ? "HealthKit Authorized" : "HealthKit Not Authorized")
                    }
                    
                    if let error = syncError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    if let lastSync = lastSyncTime {
                        HStack {
                            Image(systemName: "arrow.triangle.2.circlepath")
                            Text("Last sync: \(lastSync, style: .relative) ago")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                // Health Data Section
                Section("Current Health Data") {
                    DataRow(icon: "heart.fill", label: "Heart Rate", value: "\(healthManager.heartRate) BPM", color: .red)
                    DataRow(icon: "heart.text.square", label: "1h Average", value: "\(healthManager.heartRateAvg) BPM", color: .pink)
                    DataRow(icon: "waveform.path.ecg", label: "HRV", value: "\(healthManager.hrv) ms", color: .purple)
                    DataRow(icon: healthManager.isSleeping ? "moon.zzz.fill" : "sun.max.fill", 
                           label: "Status", 
                           value: healthManager.isSleeping ? "Sleeping 💤" : "Awake 👀",
                           color: healthManager.isSleeping ? .indigo : .orange)
                    DataRow(icon: "figure.walk", label: "Steps Today", value: "\(healthManager.steps)", color: .green)
                }
                
                // Sleep History Section
                Section("Last Night's Sleep") {
                    let hours = healthManager.lastNightSleepMinutes / 60
                    let mins = healthManager.lastNightSleepMinutes % 60
                    DataRow(icon: "bed.double.fill", label: "Duration", value: "\(hours)h \(mins)m", color: .indigo)
                    
                    DataRow(icon: "moon.stars.fill", label: "Bedtime", value: formatTime(healthManager.lastNightBedtime), color: .blue)
                    
                    DataRow(icon: "sunrise.fill", label: "Wake Time", value: formatTime(healthManager.lastNightWakeTime), color: .orange)
                    
                    let weeklyHours = healthManager.weeklyAvgSleepMinutes / 60
                    let weeklyMins = healthManager.weeklyAvgSleepMinutes % 60
                    DataRow(icon: "chart.bar.fill", label: "Weekly Avg", value: "\(weeklyHours)h \(weeklyMins)m", color: .teal)
                }
                
                // Configuration Section
                Section("Server Configuration") {
                    TextField("Server URL", text: $serverURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .onChange(of: serverURL) {
                            UserDefaults.standard.set(serverURL, forKey: "serverURL")
                        }
                    
                    SecureField("API Key", text: $apiKey)
                        .onChange(of: apiKey) {
                            UserDefaults.standard.set(apiKey, forKey: "apiKey")
                        }
                    
                    Toggle("Auto Sync (every 5min)", isOn: $autoSyncEnabled)
                        .onChange(of: autoSyncEnabled) {
                            UserDefaults.standard.set(autoSyncEnabled, forKey: "autoSync")
                        }
                }
                
                // Actions Section
                Section {
                    Button(action: syncNow) {
                        HStack {
                            if isSyncing {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle())
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                            }
                            Text(isSyncing ? "Syncing..." : "Sync Now")
                        }
                    }
                    .disabled(isSyncing || serverURL.isEmpty)
                    
                    Button(action: requestPermissions) {
                        HStack {
                            Image(systemName: "heart.circle.fill")
                            Text("Request HealthKit Access")
                        }
                    }
                    .disabled(healthManager.isAuthorized)
                }
            }
            .navigationTitle("AvenBridge")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await healthManager.refreshAllData()
            }
            .onReceive(timer) { _ in
                if autoSyncEnabled && healthManager.isAuthorized {
                    syncNow()
                }
            }
            .task {
                // Initial data load
                await healthManager.refreshAllData()
            }
        }
    }
    
    private func requestPermissions() {
        Task {
            do {
                try await healthManager.requestAuthorization()
                await healthManager.refreshAllData()
            } catch {
                syncError = error.localizedDescription
            }
        }
    }
    
    private func syncNow() {
        guard !isSyncing else { return }
        isSyncing = true
        syncError = nil
        
        Task {
            do {
                // Refresh health data first
                await healthManager.refreshAllData()
                
                // Build and send status
                // TODO: Add Screen Time integration
                let status = healthManager.buildHealthStatus(screenTimeMinutes: 0, lastApp: nil)
                
                // Configure API client
                APIClient.shared.configure(serverURL: serverURL, apiKey: apiKey)
                
                // Push to server
                try await APIClient.shared.pushHealthStatus(status)
                
                await MainActor.run {
                    lastSyncTime = Date()
                    isSyncing = false
                }
            } catch {
                await MainActor.run {
                    syncError = error.localizedDescription
                    isSyncing = false
                }
            }
        }
    }
}

struct DataRow: View {
    let icon: String
    let label: String
    let value: String
    let color: Color
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(color)
                .frame(width: 30)
            Text(label)
            Spacer()
            Text(value)
                .foregroundColor(.secondary)
                .fontWeight(.medium)
        }
    }
}

// Helper function to format time
func formatTime(_ date: Date?) -> String {
    guard let date = date else { return "--:--" }
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

#Preview {
    ContentView()
}
