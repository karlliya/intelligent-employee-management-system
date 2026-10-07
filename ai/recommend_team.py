import sys
import json

def calculate_match(required_skills, emp_skills):
    req_set = set(x.strip().lower() for x in required_skills.split(",") if x.strip())
    emp_set = set(x.strip().lower() for x in emp_skills.split(",") if x.strip())
    
    if not req_set:
        return 0.0
    
    intersection = req_set.intersection(emp_set)
    jaccard = len(intersection) / len(req_set)
    return jaccard

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Insufficient parameters"}))
        return

    required_skills = sys.argv[1]
    employees_raw = sys.argv[2]

    try:
        employees = json.loads(employees_raw)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid employee data"}))
        return

    scored_candidates = []
    for emp in employees:
        skills = emp.get("skills", "")
        match_score = calculate_match(required_skills, skills)
        
        # Calculate final weighted score
        # 60% skills match, 20% experience (up to 10 years capped), 20% average performance score (out to 10)
        exp = min(float(emp.get("experience_duration", 0)), 10.0) / 10.0
        perf = min(float(emp.get("avg_performance", 8.0)), 10.0) / 10.0
        
        final_score = (match_score * 0.6) + (exp * 0.2) + (perf * 0.2)
        
        # Reason generation
        matched_items = list(set(required_skills.lower().split(",")).intersection(set(skills.lower().split(","))))
        if matched_items:
            reason = f"The candidate matches {len(matched_items)} required skill(s): {', '.join(matched_items)}. Experience level is relevant at {emp.get('experience_duration', 0)} years."
        else:
            reason = f"The candidate has {emp.get('experience_duration', 0)} years of relevant engineering experience, but has limited direct skill overlap with the stated requirements."
        
        scored_candidates.append({
            "emp_id": emp["emp_id"],
            "name": emp["name"],
            "skills": skills,
            "match_score": round(final_score * 100, 1),
            "recommendation": "Strongly Recommended" if final_score >= 0.85 else "Recommended" if final_score >= 0.65 else "Partially Recommended",
            "risk_level": "Low" if final_score >= 0.65 else "Medium" if final_score >= 0.4 else "High",
            "reason": reason
        })

    # Sort descending by match score
    scored_candidates.sort(key=lambda x: x["match_score"], reverse=True)

    print(json.dumps(scored_candidates[:5]))

if __name__ == "__main__":
    main()
