
College Attendance System

Tech stack:
Node.js, Express, MySQL, plain HTML/CSS/JavaScript

Setup:

1. Install Node.js
2. Import db.sql into MySQL
3. Create a .env file if you need custom DB credentials:
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=attendance_system
   GOOGLE_CLIENT_ID=your_google_client_id
   SESSION_TIMEOUT_SECONDS=1800

Install dependencies:
npm install

Run the same project on two ports:
npm start

Open both URLs in browser:
http://localhost:3000
http://localhost:3001

Authentication/session behavior:
- Login creates one HttpOnly cookie that is shared across localhost ports.
- Session data is stored in MySQL auth_sessions.
- Dashboard pages listen to /api/session/events for instant logout/expiry updates.
- Logout from one port revokes the shared session and logs out the other port.
