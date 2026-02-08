import Foundation
import HealthKit

/// Manager for all HealthKit data access
class HealthManager: ObservableObject {
    let healthStore = HKHealthStore()
    
    @Published var heartRate: Int = 0
    @Published var heartRateAvg: Int = 0
    @Published var hrv: Int = 0
    @Published var isSleeping: Bool = false
    @Published var sleepStart: Date? = nil
    @Published var steps: Int = 0
    @Published var lastUpdate: Date? = nil
    @Published var isAuthorized: Bool = false
    
    // Types we want to read
    private let typesToRead: Set<HKSampleType> = [
        HKQuantityType(.heartRate),
        HKQuantityType(.heartRateVariabilitySDNN),
        HKQuantityType(.stepCount),
        HKCategoryType(.sleepAnalysis)
    ]
    
    /// Request HealthKit authorization
    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthError.notAvailable
        }
        
        try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
        
        await MainActor.run {
            self.isAuthorized = true
        }
    }
    
    /// Fetch latest heart rate
    func fetchHeartRate() async throws -> Int {
        let heartRateType = HKQuantityType(.heartRate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        let query = HKSampleQuery(
            sampleType: heartRateType,
            predicate: nil,
            limit: 1,
            sortDescriptors: [sortDescriptor]
        ) { [weak self] _, samples, error in
            guard let sample = samples?.first as? HKQuantitySample else { return }
            
            let bpm = Int(sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())))
            
            DispatchQueue.main.async {
                self?.heartRate = bpm
            }
        }
        
        healthStore.execute(query)
        return heartRate
    }
    
    /// Fetch average heart rate for the last hour
    func fetchHeartRateAverage() async throws -> Int {
        let heartRateType = HKQuantityType(.heartRate)
        let oneHourAgo = Date().addingTimeInterval(-3600)
        let predicate = HKQuery.predicateForSamples(withStart: oneHourAgo, end: Date())
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: heartRateType,
                quantitySamplePredicate: predicate,
                options: .discreteAverage
            ) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                
                let avg = statistics?.averageQuantity()?.doubleValue(
                    for: HKUnit.count().unitDivided(by: .minute())
                ) ?? 0
                
                continuation.resume(returning: Int(avg))
            }
            
            healthStore.execute(query)
        }
    }
    
    /// Fetch latest HRV
    func fetchHRV() async throws -> Int {
        let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: hrvType,
                predicate: nil,
                limit: 1,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: 0)
                    return
                }
                
                let ms = Int(sample.quantity.doubleValue(for: .secondUnit(with: .milli)))
                continuation.resume(returning: ms)
            }
            
            healthStore.execute(query)
        }
    }
    
    /// Check if user is currently sleeping
    func fetchSleepStatus() async throws -> (isSleeping: Bool, sleepStart: Date?) {
        let sleepType = HKCategoryType(.sleepAnalysis)
        let now = Date()
        let sixHoursAgo = now.addingTimeInterval(-6 * 3600)
        let predicate = HKQuery.predicateForSamples(withStart: sixHoursAgo, end: now)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: sleepType,
                predicate: predicate,
                limit: 1,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                
                guard let sample = samples?.first as? HKCategorySample else {
                    continuation.resume(returning: (false, nil))
                    return
                }
                
                // Check if sleep sample is ongoing (ends in the future or very recently)
                let isOngoing = sample.endDate > now.addingTimeInterval(-300) // Within 5 min
                let sleepValue = HKCategoryValueSleepAnalysis(rawValue: sample.value)
                
                let isSleeping = isOngoing && sleepValue != .awake
                continuation.resume(returning: (isSleeping, isSleeping ? sample.startDate : nil))
            }
            
            healthStore.execute(query)
        }
    }
    
    /// Fetch today's step count
    func fetchSteps() async throws -> Int {
        let stepsType = HKQuantityType(.stepCount)
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date())
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: stepsType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                
                let steps = Int(statistics?.sumQuantity()?.doubleValue(for: .count()) ?? 0)
                continuation.resume(returning: steps)
            }
            
            healthStore.execute(query)
        }
    }
    
    /// Fetch all health data and update published properties
    @MainActor
    func refreshAllData() async {
        do {
            heartRate = try await fetchHeartRate()
            heartRateAvg = try await fetchHeartRateAverage()
            hrv = try await fetchHRV()
            let sleepStatus = try await fetchSleepStatus()
            isSleeping = sleepStatus.isSleeping
            sleepStart = sleepStatus.sleepStart
            steps = try await fetchSteps()
            lastUpdate = Date()
            
            print("[Health] Data refreshed: HR=\(heartRate), HRV=\(hrv), Sleeping=\(isSleeping)")
        } catch {
            print("[Health] Error refreshing data: \(error)")
        }
    }
    
    /// Build HealthStatus object for API
    func buildHealthStatus(screenTimeMinutes: Int = 0, lastApp: String? = nil) -> HealthStatus {
        let formatter = ISO8601DateFormatter()
        
        return HealthStatus(
            timestamp: formatter.string(from: Date()),
            heartRate: heartRate,
            heartRateAvg: heartRateAvg,
            hrv: hrv,
            isSleeping: isSleeping,
            sleepStart: sleepStart.map { formatter.string(from: $0) },
            screenTimeToday: screenTimeMinutes,
            lastActiveApp: lastApp,
            steps: steps
        )
    }
}

enum HealthError: LocalizedError {
    case notAvailable
    case notAuthorized
    
    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "HealthKit is not available on this device"
        case .notAuthorized:
            return "HealthKit access not authorized"
        }
    }
}
