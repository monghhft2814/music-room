# 📖 คู่มือติดตั้งระบบจองห้องซ้อมดนตรี
**คณะการสื่อสารมวลชน มหาวิทยาลัยเชียงใหม่**

---

## ภาพรวมระบบ

```
[ผู้จอง] → Frontend (Vercel ฟรี)
                ↓
         Backend (Render.com ฟรี)
                ↓
         Firebase (ฐานข้อมูล ฟรี)
                ↓
         Gmail (ส่งอีเมล ฟรี)
```

---

## ขั้นตอนที่ 1 — ติดตั้งโปรแกรมที่จำเป็น

1. ดาวน์โหลด **Node.js** จาก https://nodejs.org (เลือก LTS)
2. ดาวน์โหลด **Git** จาก https://git-scm.com
3. ติดตั้งตามปกติ กด Next ไปเรื่อยๆ

---

## ขั้นตอนที่ 2 — สร้าง Firebase (ฐานข้อมูล)

1. ไปที่ https://console.firebase.google.com
2. คลิก **"Create a project"** → ตั้งชื่อ เช่น `music-room-masscom`
3. ปิด Google Analytics → คลิก **Create project**
4. ในเมนูซ้าย คลิก **Firestore Database** → **Create database**
   - เลือก **Start in production mode** → Next → เลือก region `asia-southeast1` → Enable
5. ไปที่ **Project Settings** (ไอคอนเฟือง) → แท็บ **Service accounts**
6. คลิก **"Generate new private key"** → ดาวน์โหลดไฟล์ JSON มา
7. เปิดไฟล์ JSON ที่ดาวน์โหลด จะเห็นข้อมูลแบบนี้:
   ```json
   {
     "project_id": "music-room-masscom",
     "client_email": "firebase-adminsdk-xxx@music-room-masscom.iam.gserviceaccount.com",
     "private_key": "-----BEGIN PRIVATE KEY-----\n..."
   }
   ```
   เก็บข้อมูลเหล่านี้ไว้ใช้ในขั้นตอนถัดไป

---

## ขั้นตอนที่ 3 — ตั้งค่า Gmail App Password

> ⚠️ ต้องเปิด **2-Step Verification** ก่อน

1. ไปที่ https://myaccount.google.com
2. คลิก **Security** → **2-Step Verification** → เปิดใช้งาน
3. กลับมาที่ Security → เลื่อนลงหา **"App passwords"**
4. เลือก App: **Mail** / Device: **Other** → พิมพ์ `Music Room` → **Generate**
5. จะได้รหัส 16 ตัว เช่น `abcd efgh ijkl mnop` → **เก็บไว้ใช้ในขั้นตอนถัดไป**

---

## ขั้นตอนที่ 4 — สร้าง GitHub Repository

1. สมัคร https://github.com (ถ้ายังไม่มี)
2. คลิก **New repository** → ตั้งชื่อ `music-room` → **Create repository**
3. เปิด Terminal แล้วพิมพ์:

```bash
# คัดลอกโฟลเดอร์ทั้งหมดไปยังที่ที่ต้องการ แล้วเข้าโฟลเดอร์
cd music-room-system

# เริ่ม git
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/music-room.git
git push -u origin main
```
> แทน `YOUR_USERNAME` ด้วยชื่อ GitHub ของคุณ

---

## ขั้นตอนที่ 5 — Deploy Backend บน Render.com (ฟรี)

1. ไปที่ https://render.com → **Sign up** ด้วย GitHub
2. คลิก **New** → **Web Service**
3. เชื่อมกับ GitHub repo `music-room`
4. ตั้งค่า:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. เลื่อนลงหา **Environment Variables** → คลิก **Add Environment Variable** ทีละตัว:

| Key | Value |
|-----|-------|
| `FIREBASE_PROJECT_ID` | project_id จากไฟล์ JSON |
| `FIREBASE_CLIENT_EMAIL` | client_email จากไฟล์ JSON |
| `FIREBASE_PRIVATE_KEY` | private_key จากไฟล์ JSON (ทั้งหมดรวม -----BEGIN...) |
| `GMAIL_USER` | อีเมล Gmail ของคณะ |
| `GMAIL_APP_PASSWORD` | App Password 16 ตัวที่ได้จากขั้นตอน 3 |
| `ADMIN_PASSWORD` | ตั้งรหัสผ่าน Admin เอง เช่น `masscom@2567` |
| `FRONTEND_URL` | ใส่ `*` ไปก่อน แก้ทีหลัง |

6. คลิก **Create Web Service**
7. รอ deploy เสร็จ (~3 นาที) จะได้ URL เช่น `https://music-room-backend.onrender.com`
8. **คัดลอก URL นี้ไว้**

---

## ขั้นตอนที่ 6 — Deploy Frontend บน Vercel (ฟรี)

1. ไปที่ https://vercel.com → **Sign up** ด้วย GitHub
2. คลิก **New Project** → เลือก repo `music-room`
3. ตั้งค่า:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
4. คลิก **Environment Variables** → เพิ่ม:
   - Key: `VITE_API_URL`
   - Value: URL จาก Render ขั้นตอน 5 เช่น `https://music-room-backend.onrender.com`
5. คลิก **Deploy**
6. รอ deploy เสร็จ (~2 นาที) จะได้ URL เช่น `https://music-room.vercel.app`

---

## ขั้นตอนที่ 7 — อัปเดต CORS ใน Render

1. กลับไปที่ Render → เปิด Web Service → **Environment**
2. แก้ `FRONTEND_URL` เป็น URL จาก Vercel เช่น `https://music-room.vercel.app`
3. คลิก **Save Changes** → รอ redeploy

---

## ✅ ทดสอบระบบ

1. เปิด URL Vercel → ลองจองห้องดู
2. ไปที่ Admin → ใส่รหัสผ่านที่ตั้งไว้ → ลองอนุมัติ + ตั้งรหัส
3. เช็คอีเมลว่าได้รับรหัสห้องหรือเปล่า

---

## 🔧 แก้ปัญหาที่พบบ่อย

**หน้าเว็บโหลดได้แต่ข้อมูลไม่ขึ้น**
→ เช็ค `VITE_API_URL` ใน Vercel ว่าตรงกับ URL ของ Render

**ส่งอีเมลไม่ได้**
→ เช็ค App Password ว่าถูกต้อง และเปิด 2-Step Verification แล้ว

**Login Admin ไม่ได้**
→ เช็ค `ADMIN_PASSWORD` ใน Render Environment Variables

**Render หยุดทำงานหลังไม่ใช้งาน 15 นาที (free tier)**
→ ปกติสำหรับ plan ฟรี ครั้งแรกที่เข้าจะช้า ~30 วินาที ถ้าต้องการให้เร็วตลอดต้อง upgrade ($7/เดือน)

---

## 📞 ต้องการความช่วยเหลือ

หากติดปัญหาขั้นตอนไหน สามารถถามกลับมาได้เลยค่ะ
หรือหาน้องๆ IT/CS ในมหาวิทยาลัยมาช่วยดำเนินการตามขั้นตอนนี้ได้เลย
ใช้เวลาประมาณ **30-60 นาที** ในการติดตั้งทั้งหมด
