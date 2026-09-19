# 🩸 LifePulse — Blood Donor Directory & Community Network

A clean, modern, and minimal platform to connect voluntary blood donors with patients and hospitals in real-time.

---

## ✨ Features

- **Shareable Registration Link (`/register`)**:
  - Anyone can register as a voluntary donor (Name, Blood Group, Phone, WhatsApp, City, Area, Last Donation Date).
  - Built-in QR Code generator & 1-click WhatsApp/System share.
  - Automatic cooldown calculation (90-day cooldown period).
  - Instant digital donor badge upon registration.
- **Public Directory & Search (`/`)**:
  - Filter by Blood Group (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
  - "Include Compatible Types" toggle (e.g. finds O- and O+ donors for an O+ patient).
  - Filter by City and Availability status ("Available", "Emergency Only").
  - "Eligible Now" filter (last donation > 90 days).
  - 1-Click direct **Call** and **WhatsApp** with pre-filled emergency template message.
  - Emergency Broadcast Alert Banner.
  - Built-in Blood Compatibility Reference Guide.
- **Admin Management Console (`/admin`)**:
  - Secure master password protection (Default: `admin123`, changeable).
  - Live statistics and blood group inventory distribution.
  - Manage donors: toggle verified status, edit details, delete, or add offline donors.
  - 1-Click Export to CSV.
  - Manage and resolve public emergency requests.

---

## 🚀 How to Deploy on Vercel (Fast & Easy)

This repository is pre-configured with `vercel.json` and serverless API handlers in `/api` for instant 1-click Vercel deployment.

### Option A: Via GitHub & Vercel Dashboard (Recommended)
1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of LifePulse Blood Donor Directory"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/blood-donor-directory.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. **Add MongoDB Connection (Recommended for permanent cloud persistence)**:
   - In Vercel Project Settings → **Environment Variables**, add:
     - `MONGODB_URI`: `mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/blood_directory?retryWrites=true&w=majority`
   - *(If `MONGODB_URI` is omitted, the app will run with high-speed built-in serverless storage automatically!)*
5. Click **Deploy**.
6. Your platform is live in under 60 seconds with a free `.vercel.app` domain!

---

## 🍃 MongoDB Atlas Setup (Free in 2 Minutes)

1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) (100% Free M0 Cluster).
2. Create a free shared cluster.
3. Under **Database Access**, create a user & password.
4. Under **Network Access**, click **Add IP Address** → choose **Allow Access from Anywhere** (`0.0.0.0/0`) so Vercel serverless functions can connect.
5. Click **Connect** → **Drivers** → copy the connection string.
6. Paste the connection string into your Vercel Environment Variables as `MONGODB_URI` (or in local `.env`).

### Option B: Via Vercel CLI
If you have Vercel CLI installed:
```bash
npm install -g vercel
vercel
```
Follow the prompts and select default options.

---

## 💻 Running Locally

### On Windows
Double click `start.bat`, or in terminal:
```bash
agy-node server.js
# or if you have standard node installed:
node server.js
```
Then open:
- Directory: `http://localhost:3000/`
- Register Donor: `http://localhost:3000/register`
- Admin Console: `http://localhost:3000/admin` (Default password: `admin123`)

---

## 📁 Project Architecture

```
├── api/
│   └── index.js           # Serverless API handler for Vercel
├── public/
│   ├── index.html         # Public Donor Search Directory & Emergency Board
│   ├── register.html      # Sharable Donor Registration Page
│   ├── admin.html         # Administrator Management Console
│   ├── app.js             # Shared compatibility logic, WhatsApp, QR generator
│   └── styles.css         # Modern, clean, minimal design system
├── vercel.json            # Vercel deployment configuration & routing
├── server.js              # Native Node.js HTTP server & SQLite DB for local runs
├── start.bat              # 1-Click Windows starter
├── package.json           # Project metadata
└── README.md              # Project documentation
```
