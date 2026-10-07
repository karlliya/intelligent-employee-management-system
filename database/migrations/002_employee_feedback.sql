-- Optional one-time migration for existing databases. Backend startup performs the
-- same checks automatically; this script is safe to run again.
DROP PROCEDURE IF EXISTS migrate_employee_feedback;
DELIMITER $$
CREATE PROCEDURE migrate_employee_feedback()
BEGIN
  DECLARE fk_to_replace VARCHAR(64) DEFAULT NULL;
  CREATE TABLE IF NOT EXISTS sentiment_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(50) DEFAULT NULL,
    legacy_emp_id VARCHAR(50) DEFAULT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    feedback_text TEXT NOT NULL,
    is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
    sentiment VARCHAR(50) DEFAULT NULL,
    confidence DECIMAL(5,4) DEFAULT NULL,
    key_concern VARCHAR(255) DEFAULT NULL,
    recommendation TEXT,
    analysis_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analyzed_at DATETIME DEFAULT NULL,
    KEY idx_feedback_status (analysis_status, submitted_at),
    CONSTRAINT fk_sentiment_feedback_employee FOREIGN KEY (emp_id)
      REFERENCES employees(emp_id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'legacy_emp_id') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN legacy_emp_id VARCHAR(50) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'category') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'General';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'is_anonymous') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'confidence') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN confidence DECIMAL(5,4) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'key_concern') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN key_concern VARCHAR(255) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'recommendation') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN recommendation TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'analysis_status') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN analysis_status VARCHAR(20) NOT NULL DEFAULT 'Pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'analyzed_at') THEN
    ALTER TABLE sentiment_feedback ADD COLUMN analyzed_at DATETIME DEFAULT NULL;
  END IF;

  SELECT (SELECT k.constraint_name
    FROM information_schema.key_column_usage k
    JOIN information_schema.referential_constraints r
      ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name
    WHERE k.table_schema = DATABASE() AND k.table_name = 'sentiment_feedback'
      AND k.column_name = 'emp_id' AND k.referenced_table_name = 'employees'
      AND r.delete_rule <> 'SET NULL' LIMIT 1) INTO fk_to_replace;
  IF fk_to_replace IS NOT NULL THEN
    SET @drop_feedback_fk = CONCAT('ALTER TABLE sentiment_feedback DROP FOREIGN KEY `', REPLACE(fk_to_replace, '`', '``'), '`');
    PREPARE drop_feedback_fk FROM @drop_feedback_fk;
    EXECUTE drop_feedback_fk;
    DEALLOCATE PREPARE drop_feedback_fk;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'emp_id' AND is_nullable = 'NO') THEN
    ALTER TABLE sentiment_feedback MODIFY emp_id VARCHAR(50) NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'sentiment' AND is_nullable = 'NO') THEN
    ALTER TABLE sentiment_feedback MODIFY sentiment VARCHAR(50) NULL;
  END IF;

  UPDATE sentiment_feedback f LEFT JOIN employees e ON e.emp_id = f.emp_id
    SET f.legacy_emp_id = f.emp_id, f.emp_id = NULL
    WHERE f.emp_id IS NOT NULL AND e.emp_id IS NULL;
  UPDATE sentiment_feedback
    SET analysis_status = 'Analyzed', analyzed_at = COALESCE(analyzed_at, submitted_at)
    WHERE sentiment IS NOT NULL AND analysis_status = 'Pending';

  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND index_name = 'idx_feedback_status') THEN
    ALTER TABLE sentiment_feedback ADD INDEX idx_feedback_status (analysis_status, submitted_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'sentiment_feedback' AND column_name = 'emp_id' AND referenced_table_name = 'employees') THEN
    ALTER TABLE sentiment_feedback ADD CONSTRAINT fk_sentiment_feedback_employee FOREIGN KEY (emp_id)
      REFERENCES employees(emp_id) ON DELETE SET NULL;
  END IF;
END$$
DELIMITER ;
CALL migrate_employee_feedback();
DROP PROCEDURE migrate_employee_feedback;
