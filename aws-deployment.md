# Ultimate Guide: Deploying to AWS EC2

This guide will walk you through exactly how to host your College Attendance System on a public Cloud Server using AWS, and how to configure Google OAuth so it actually works on the live internet.

## Part 1: Setting up your AWS EC2 Instance

1. Log into your [AWS Management Console](https://console.aws.amazon.com/).
2. Navigate to **EC2** and click **Launch Instances**.
3. **Name your server**: e.g. `Attendance-Server`.
4. **Choose an OS**: Select `Ubuntu Server 24.04 LTS` (or 22.04 LTS). 
5. **Instance Type**: Select `t2.micro` (Eligibility for free tier).
6. **Key Pair**: Create a new key pair (RSA, .pem) and download it. You will need this to log into the server.
7. **Network Settings**:
   - Check the box to **Allow SSH traffic** (Port 22).
   - Check the box to **Allow HTTP traffic from the internet** (Port 80) <- Extremely important.
   - Click Edit on network settings, add an extra custom TCP rule for **Port 8080** and set it to Anywhere (`0.0.0.0/0`).
8. Click **Launch Instance**. Wait a few minutes for it to boot.

## Part 2: Installing Docker and Downloading your Code

1. View your running instance on the AWS dashboard and find the **Public IPv4 address** (e.g. `54.212.x.x`). 
2. Connect to your instance via SSH:
   ```bash
   ssh -i "your-downloaded-key.pem" ubuntu@YOUR-PUBLIC-IP
   ```
3. Once logged into the AWS terminal, install Docker quickly by running these exact commands one by one:
   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose
   sudo systemctl enable docker
   sudo usermod -aG docker ubuntu
   ```
4. Now, download your code from GitHub:
   ```bash
   git clone https://github.com/CaptainLevi11/college-attendance-system.git
   cd college-attendance-system
   ```

## Part 3: Fixing Google OAuth for the Live Site!

Because your app is now hosted on the real internet, you MUST register the new AWS IP Address with Google so it allows the popup to work.

1. Open the [Google Cloud Credentials Panel](https://console.cloud.google.com/apis/credentials).
2. Click on your existing OAuth 2.0 Client ID (the one starting with `1008875525897...`).
3. Scroll down to **Authorized JavaScript origins**.
4. Click **ADD URI** and type: `http://YOUR-PUBLIC-IP:8080` (Replace with your actual AWS Public IP!)
5. *If you also want to use it on your personal computer testing locally, also add `http://localhost:8080` as an origin if you haven't already.*
6. Click **SAVE** at the bottom. **Note: Google takes about 5 minutes to fully update origin settings.**

## Part 4: Add your `.env` File Secretly

To ensure security, your `.env` file does not exist on GitHub, so you must create it on the AWS server manually.

1. While inside the `college-attendance-system` directory on your EC2 instance, create the `.env` file:
   ```bash
   nano .env
   ```
2. Paste the following configuration exactly (Modify `YOUR-GOOGLE-CLIENT-ID-HERE` to match your actual ID):
   ```ini
   GOOGLE_CLIENT_ID=YOUR-GOOGLE-CLIENT-ID-HERE
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=Hello@1
   DB_NAME=attendance_system
   ```
3. Press `Ctrl + X`, then `Y`, then `Enter` to save and close the file.

## Part 5: Starting the Final Deployment

You are ready! Turn on the whole system:

```bash
docker-compose up --build -d
```

**Congratulations!** 🚀
You can now share your app with anyone on the internet by giving them this link:  
**`http://YOUR-PUBLIC-IP:8080`**
