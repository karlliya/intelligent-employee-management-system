-- IEMS Dashboard MySQL schema

CREATE DATABASE IF NOT EXISTS `employee_management` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `employee_management`;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `code` VARCHAR(20),
  `description` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(191) UNIQUE NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'Employee',
  `failed_attempts` INT DEFAULT 0,
  `lockout_until` DATETIME DEFAULT NULL,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `email_verified_at` DATETIME DEFAULT NULL,
  `password_changed_at` DATETIME DEFAULT NULL,
  `name` VARCHAR(100) DEFAULT NULL,
  `initials` VARCHAR(10) DEFAULT NULL,
  `color` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `employees` (
  `emp_id` VARCHAR(50) PRIMARY KEY,
  `user_id` INT UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `department` VARCHAR(100) DEFAULT NULL,
  `department_id` INT DEFAULT NULL,
  `position` VARCHAR(100) DEFAULT NULL,
  `role` VARCHAR(100) DEFAULT NULL,
  `email` VARCHAR(191) UNIQUE NOT NULL,
  `phone` VARCHAR(50),
  `ic_number` VARCHAR(50),
  `status` VARCHAR(50) NOT NULL DEFAULT 'Active',
  `joined_date` DATE DEFAULT NULL,
  `salary` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `leave_balance` INT NOT NULL DEFAULT 18,
  `document_path` VARCHAR(255) DEFAULT NULL,
  `photo_url` VARCHAR(255) DEFAULT NULL,
  `skills` TEXT,
  `experience_duration` INT NOT NULL DEFAULT 0,
  `project_assigned` VARCHAR(150) DEFAULT NULL,
  `site_location` VARCHAR(150) DEFAULT NULL,
  `certification` VARCHAR(255) DEFAULT NULL,
  `years_experience` INT NOT NULL DEFAULT 0,
  `employment_status` VARCHAR(50) NOT NULL DEFAULT 'Active',
  `engagement_score` INT NOT NULL DEFAULT 8,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `attendance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `emp_id` VARCHAR(50) NOT NULL,
  `date` DATE NOT NULL,
  `check_in` TIME DEFAULT NULL,
  `check_out` TIME DEFAULT NULL,
  `working_hours` DECIMAL(5,2) DEFAULT 0,
  `overtime_hours` DECIMAL(5,2) DEFAULT 0,
  `late_minutes` INT DEFAULT 0,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Present',
  `method` VARCHAR(50) DEFAULT 'QR',
  UNIQUE KEY `emp_date_unique` (`emp_id`, `date`),
  FOREIGN KEY (`emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `attendance_qr_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `action` VARCHAR(20) NOT NULL DEFAULT 'check-in',
  `created_by` INT NOT NULL,
  `target_emp_id` VARCHAR(50) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_count` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_attendance_qr_token` (`token`),
  KEY `idx_attendance_qr_expiry` (`expires_at`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`target_emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `attendance_qr_usage` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NOT NULL,
  `emp_id` VARCHAR(50) NOT NULL,
  `used_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `session_employee_unique` (`session_id`, `emp_id`),
  FOREIGN KEY (`session_id`) REFERENCES `attendance_qr_sessions`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leaves` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `emp_id` VARCHAR(50) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `from_date` DATE NOT NULL,
  `to_date` DATE NOT NULL,
  `days` INT NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Pending',
  `rejection_reason` TEXT DEFAULT NULL,
  `conflict_warning` TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (`emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `performance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `emp_id` VARCHAR(50) NOT NULL,
  `review_month` VARCHAR(7) NOT NULL,
  `kpi_score` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `task_completion_score` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `attendance_score` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `final_score` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `rating` VARCHAR(50) NOT NULL DEFAULT 'Needs Improvement',
  `hr_alert` TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY `emp_review_month_unique` (`emp_id`, `review_month`),
  FOREIGN KEY (`emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `employee_advice_notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `emp_id` VARCHAR(50) NOT NULL,
  `author_user_id` INT NOT NULL,
  `author_name` VARCHAR(100) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE CASCADE,
  FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `projects` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `required_skills` VARCHAR(255) NOT NULL,
  `department_id` INT,
  FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sentiment_feedback` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `emp_id` VARCHAR(50) DEFAULT NULL,
  `legacy_emp_id` VARCHAR(50) DEFAULT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'General',
  `feedback_text` TEXT NOT NULL,
  `is_anonymous` TINYINT(1) NOT NULL DEFAULT 0,
  `sentiment` VARCHAR(50) DEFAULT NULL,
  `confidence` DECIMAL(5,4) DEFAULT NULL,
  `key_concern` VARCHAR(255) DEFAULT NULL,
  `recommendation` TEXT,
  `analysis_status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `analyzed_at` DATETIME DEFAULT NULL,
  KEY `idx_feedback_status` (`analysis_status`, `submitted_at`),
  CONSTRAINT `fk_sentiment_feedback_employee` FOREIGN KEY (`emp_id`) REFERENCES `employees`(`emp_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_email` VARCHAR(191) DEFAULT NULL,
  `user` VARCHAR(100) DEFAULT NULL,
  `action` TEXT NOT NULL,
  `ip_address` VARCHAR(50) NOT NULL,
  `result` VARCHAR(50) NOT NULL,
  `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `ip_address` VARCHAR(50),
  `user_agent` VARCHAR(255),
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `otp_verifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `otp_code` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` INT DEFAULT 0,
  `verified` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_user_verified` (`user_id`, `verified`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `scope` VARCHAR(50) NOT NULL,
  `identifier` VARCHAR(191) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 1,
  `window_start` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `rate_scope_identifier_window` (`scope`, `identifier`, `window_start`),
  INDEX `idx_rate_lookup` (`scope`, `identifier`, `window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` VARCHAR(100) PRIMARY KEY,
  `setting_value` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `departments` (`name`, `code`, `description`) VALUES
('Civil Engineering', 'CIV', 'Civil and structural engineering'),
('Mechanical Engineering', 'MEC', 'Mechanical systems and plant engineering'),
('Electrical Engineering', 'ELE', 'Electrical, instrumentation, and controls'),
('Project Management', 'PMO', 'Engineering project planning and delivery'),
('Safety & QA/QC', 'SQA', 'Site safety, quality assurance, and quality control'),
('Administration', 'ADM', 'Corporate administration and HR')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES
('company_name', 'IEMS Dashboard'),
('work_start_time', '09:00'),
('session_timeout_minutes', '120'),
('leave_conflict_limit', '3')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);
