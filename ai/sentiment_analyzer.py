import sys
import json
import re

# Transparent keyword rules for a prototype, not a calibrated prediction model.
POSITIVE_WORDS = {"good", "great", "excellent", "happy", "love", "supportive", "learning", "growth", "satisfied", "motivated", "safe", "helpful"}
NEGATIVE_WORDS = {"bad", "poor", "unhappy", "stress", "stressed", "stressful", "exhausted", "burnout", "overworked", "overwhelmed", "unfair", "ignored", "toxic", "angry", "unsafe"}

def analyze_sentiment(text):
    words = re.findall(r"[a-z]+", text.lower())
    pos_count = sum(word in POSITIVE_WORDS for word in words)
    neg_count = sum(word in NEGATIVE_WORDS for word in words)
    
    if pos_count > neg_count:
        sentiment = "Positive"
    elif neg_count > pos_count:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"
    return {
        "sentiment": sentiment,
        "confidence": None,
        "positive_signals": pos_count,
        "negative_signals": neg_count,
        "analysis_method": "Rule-based prototype"
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Feedback text is required"}))
        sys.exit(2)

    print(json.dumps(analyze_sentiment(sys.argv[1])))

if __name__ == "__main__":
    main()
