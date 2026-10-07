CREATE TABLE IF NOT EXISTS `otp_verifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `otp_code` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `verified` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_otp_user_active` (`user_id`, `verified`, `expires_at`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
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
