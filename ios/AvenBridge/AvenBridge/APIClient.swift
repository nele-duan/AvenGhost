import Foundation

/// Health data to send to AvenGhost server
struct HealthStatus: Codable {
    let timestamp: String
    let heartRate: Int
    let heartRateAvg: Int
    let hrv: Int
    let isSleeping: Bool
    let sleepStart: String?
    let screenTimeToday: Int  // in minutes
    let lastActiveApp: String?
    let steps: Int?
}

/// API client for communicating with AvenGhost server
class APIClient {
    static let shared = APIClient()
    
    private let serverURL: String
    private let apiKey: String
    
    private init() {
        // Load from UserDefaults or use defaults
        self.serverURL = UserDefaults.standard.string(forKey: "serverURL") 
            ?? "https://your-server.com"
        self.apiKey = UserDefaults.standard.string(forKey: "apiKey") 
            ?? "aven-health-secret"
    }
    
    /// Update server configuration
    func configure(serverURL: String, apiKey: String) {
        UserDefaults.standard.set(serverURL, forKey: "serverURL")
        UserDefaults.standard.set(apiKey, forKey: "apiKey")
    }
    
    /// Push health status to server
    func pushHealthStatus(_ status: HealthStatus) async throws {
        guard let url = URL(string: "\(serverURL)/api/health") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(status)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            print("[API] Health data pushed successfully")
        case 401:
            throw APIError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.serverError(httpResponse.statusCode, message)
        }
    }
}

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case serverError(Int, String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .invalidResponse:
            return "Invalid server response"
        case .unauthorized:
            return "Invalid API key"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        }
    }
}
