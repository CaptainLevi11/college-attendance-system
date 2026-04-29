
CREATE DATABASE IF NOT EXISTS attendance_system;

USE attendance_system;

CREATE TABLE users (
id INT AUTO_INCREMENT PRIMARY KEY,
user_id VARCHAR(20) UNIQUE,
google_id VARCHAR(255) UNIQUE,
email VARCHAR(100) UNIQUE,
name VARCHAR(100),
password VARCHAR(100) NULL,
role VARCHAR(20)
);

CREATE TABLE students (
id INT AUTO_INCREMENT PRIMARY KEY,
student_id VARCHAR(20),
name VARCHAR(100),
department VARCHAR(50),
semester INT
);

CREATE TABLE attendance (
id INT AUTO_INCREMENT PRIMARY KEY,
student_id VARCHAR(20),
subject VARCHAR(100),
date DATE,
status VARCHAR(10)
);

CREATE TABLE auth_sessions (
id INT AUTO_INCREMENT PRIMARY KEY,
session_hash CHAR(64) NOT NULL UNIQUE,
user_id INT NOT NULL,
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
expires_at DATETIME NOT NULL,
revoked_at DATETIME NULL,
last_seen_at DATETIME NULL,
INDEX idx_auth_sessions_user_id (user_id),
INDEX idx_auth_sessions_expires_at (expires_at),
CONSTRAINT fk_auth_sessions_user
FOREIGN KEY (user_id) REFERENCES users(id)
ON DELETE CASCADE
);

INSERT INTO users (user_id,email,name,password,role) VALUES
('admin1','admin@example.com','Admin User','1234','Admin'),
('faculty1','faculty@example.com','Dr Sharma','1234','Faculty'),
('student1','student@example.com','Rahul','1234','Student');
