import sys
import json
import numpy as np
from sklearn.tree import DecisionTreeClassifier

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Insufficient features provided"}))
        return

    try:
        attendance_trend = float(sys.argv[1])  # Negative value means attendance is dropping
        leave_frequency = float(sys.argv[2])   # Higher means more leaves
        performance_trend = float(sys.argv[3]) # Negative means scores dropping
        engagement_score = float(sys.argv[4])  # Lower means less engagement
    except ValueError:
        print(json.dumps({"error": "Invalid feature values"}))
        return

    # Simulate model
    # Features: [attendance_trend, leave_frequency, performance_trend, engagement_score]
    X_train = np.array([
        [0.1, 0.5, 0.2, 9.0],    # Stable, low leave, good performance, highly engaged -> Low
        [-0.5, 3.0, -0.4, 4.0],  # Dropping, high leave, dropping performance, unengaged -> High
        [0.0, 1.5, 0.0, 6.0],    # Stable, medium leave, stable performance, medium engaged -> Medium
        [0.2, 0.2, 0.1, 8.0],    # Low Risk
        [-0.8, 4.0, -0.7, 3.0],  # High Risk
        [-0.2, 2.0, -0.1, 5.0],  # Medium Risk
    ])
    # Target: 0 = Low Risk, 1 = Medium Risk, 2 = High Risk
    y_train = np.array([0, 2, 1, 0, 2, 1])

    model = DecisionTreeClassifier(random_state=42)
    model.fit(X_train, y_train)

    X_test = np.array([[attendance_trend, leave_frequency, performance_trend, engagement_score]])
    prediction = int(model.predict(X_test)[0])
    probabilities = model.predict_proba(X_test)[0]
    risk_score = float(probabilities[prediction]) * 100

    categories = {0: "Low Risk", 1: "Medium Risk", 2: "High Risk"}
    
    recommendations = {
        0: "Maintain current engagement and career growth plans.",
        1: "Arrange a casual check-in session. Identify potential workload or motivation bottlenecks.",
        2: "High flight risk! Schedule an urgent feedback session, consider workspace flexibility, review compensation, and address burnout signs immediately."
    }

    output = {
        "risk_category": categories[prediction],
        "risk_score": round(risk_score, 2),
        "recommendation": recommendations[prediction]
    }

    print(json.dumps(output))

if __name__ == "__main__":
    main()
