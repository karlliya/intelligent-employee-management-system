import sys
import json
import numpy as np
from sklearn.ensemble import RandomForestClassifier

def main():
    if len(sys.argv) < 6:
        print(json.dumps({"error": "Insufficient features provided"}))
        return

    try:
        attendance_rate = float(sys.argv[1])
        leave_frequency = float(sys.argv[2])
        kpi_score = float(sys.argv[3])
        performance_score = float(sys.argv[4])
        experience_duration = float(sys.argv[5])
    except ValueError:
        print(json.dumps({"error": "Invalid feature values"}))
        return

    # Create dummy training data to simulate a fit model
    # Features: [Attendance Rate, Leave Frequency, KPI Score, Performance Score, Experience Duration]
    X_train = np.array([
        [98.0, 0, 95.0, 9.0, 5],
        [95.0, 1, 90.0, 8.0, 3],
        [99.0, 0, 98.0, 10.0, 8],
        [85.0, 3, 75.0, 6.0, 2],
        [70.0, 5, 55.0, 4.0, 1],
        [90.0, 2, 80.0, 7.0, 4],
        [80.0, 4, 60.0, 5.0, 1]
    ])
    # Target: 0 = Needs Improvement, 1 = Good, 2 = Excellent
    y_train = np.array([2, 1, 2, 1, 0, 1, 0])

    model = RandomForestClassifier(n_estimators=10, random_state=42)
    model.fit(X_train, y_train)

    X_test = np.array([[attendance_rate, leave_frequency, kpi_score, performance_score, experience_duration]])
    prediction = model.predict(X_test)[0]
    probabilities = model.predict_proba(X_test)[0]
    confidence = float(probabilities[prediction]) * 100

    categories = {0: "Needs Improvement", 1: "Good", 2: "Excellent"}

    output = {
        "prediction": categories[prediction],
        "confidence": round(confidence, 2)
    }

    print(json.dumps(output))

if __name__ == "__main__":
    main()
