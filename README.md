# 🩸 UET-lifesavers — Blood Donor Directory & Community Network

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
   git commit -m "Initial commit of UET-lifesavers Blood Donor Directory"
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


## Donor self-service and request coordination

Open `/community.html` from the directory or admin page. Registration now supplies a private access link; save it securely because anyone holding it can edit that donor profile. Only a SHA-256 hash of its random key is stored in MongoDB. Coordinators can issue replacement links after verifying identity; replacement revokes the previous link. Existing donors need a coordinator-issued link.

Donors can edit contact/location details, record their last donation date, confirm availability, or pause by selecting Unavailable. The directory shows the last confirmation date. This is a manual check-in; no SMS or WhatsApp notifications are sent.

Donors can volunteer for open requests or withdraw. Coordinators can confirm, decline, or record completed donations and mark requests fulfilled. Completion counts represent recorded donor outcomes, not verified units collected. New requests expire after 48 hours; expiry is applied when requests are read. Existing requests retain their existing status until closed by a coordinator. Donation completion does not automatically change the donor's recorded donation date.

Run permission and validation tests with `node --test test/community.test.js`. MongoDB configuration is required for live use. Set ADMIN_PASSWORD and ADMIN_TOKEN_SECRET before deployment.


## Basic SEO

The directory and registration pages have unique titles, descriptions, canonical paths and text sharing metadata. Duplicate entry URLs redirect permanently to `/` or `/register`. Admin and community pages use `noindex`; API responses use an `X-Robots-Tag` header. These directives control search indexing, not access permissions.

Once the production domain is decided, replace the root-relative canonical paths with absolute production URLs and publish a sitemap containing only `/` and `/register`. No placeholder domain or private donor/request URLs are included.


## Urgent request board

`/urgent` provides city, blood-group and status filters, urgency ordering, direct calls, shareable request links, donor responses and a public request form. `/community.html` retains coordinator controls. New requests expire after 48 hours. Include `/urgent` when creating the production sitemap.


## Shared design and expiry

Public pages share the navigation, Plus Jakarta Sans typography, rose/slate colors and controls in `styles.css`; page-specific layouts live in `urgent.css` and `community.css`. Admin retains its workspace controls with shared site navigation.

Open requests expire 48 hours after creation. Older requests without a deadline receive one on the next request-list read. Expired requests leave open lists and counts, while history remains available. Public open views update at the deadline even without reloading; the admin request table refreshes every 15 seconds. Status persistence is updated on API reads, so a scheduled background job is unnecessary for hiding expired requests.
