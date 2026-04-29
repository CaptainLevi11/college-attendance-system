# College Attendance System

A fully containerized web application for tracking college attendance, featuring a frontend dashboard, a backend API, and a MySQL database.

## 🚀 How to Run the Project (For the Teacher)

As an evaluator, you can run this fully deployed project with a single command without needing to install anything other than Docker.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running on your machine.
- Optional: Git installed to clone this repository.

### Quick Start (Single Command)

1. Open your terminal.
2. Clone the repository and navigate into the folder:
   ```bash
   git clone https://github.com/CaptainLevi11/college-attendance-system.git
   cd college-attendance-system
   ```
3. Run this single command to build and start the entire system:
   ```bash
   docker-compose up --build -d
   ```

### Accessing the Application

Once the command finishes running, you can access the project in your web browser:
- **Frontend / Dashboard**: [http://localhost:8080](http://localhost:8080)
- **Backend API**: [http://localhost:3000](http://localhost:3000)

*(Note: The first time you run this, it may take a minute or two to download the database and start the services.)*

### How to Stop the Project
To stop the application, simply run:
```bash
docker-compose down
```
