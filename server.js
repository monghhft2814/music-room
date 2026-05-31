const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const bookingsCol = db.collection("bookings");

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

function toClient(doc) {
  return { id: doc.id, ...doc.data() };
}

async function sendRoomCodeEmail({ to, name, bandName, roomCode, date, hour, hours }) {
  const hourLabel = (h) => `${String(h).padStart(2,"0")}:00`;
  await resend.emails.send({
    from: "ห้องซ้อมดนตรี มช. <onboarding@resend.dev>",
    to,
    subject: `[ห้องซ้อมดนตรี] รหัสเปิดห้องของคุณ — ${date}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0B0B10;color:#F0EDE8;padding:32px;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:48px">🎵</div>
          <h1 style="font-size:22px;margin:8px 0 4px">การจองได้รับอนุมัติแล้ว!</h1>
          <p style="color:#888;font-size:14px">ห้องซ้อมดนตรี คณะการสื่อสารมวลชน มช.</p>
        </div>
        <div style="background:#1A1A24;border-radius:12px;padding:20px;margin-bottom:20px">
          <p style="font-size:16px;font-weight:700;margin-bottom:16px">เรียน ${name} (${bandName})</p>
          <p style="color:#888;font-size:13px;margin-bottom:4px">วันที่: ${date}</p>
          <p style="color:#888;font-size:13px">เวลา: ${hourLabel(hour)} – ${hourLabel(hour+hours)} น. (${hours} ชั่วโมง)</p>
        </div>
        <div style="background:#0D0D18;border:2px solid #E8204B66;border-radius:14px;padding:24px;text-align:center;margin-bottom:20px">
          <p style="color:#888;font-size:12px;letter-spacing:2px;margin-bottom:10px">รหัสเปิดห้องของคุณ</p>
          <p style="font-size:42px;font-weight:900;letter-spacing:14px;color:#E8204B;font-family:monospace;margin:0">${roomCode}</p>
          <p style="color:#555;font-size:12px;margin-top:10px">ใช้ได้เฉพาะ ${hourLabel(hour)}–${hourLabel(hour+hours)} น.</p>
        </div>
        <p style="color:#444;font-size:12px;text-align:center">คณะการสื่อสารมวลชน มหาวิทยาลัยเชียงใหม่</p>
      </div>
    `,
  });
}

app.get("/api/bookings", async (req, res) => {
  try {
    const snap = await bookingsCol.orderBy("createdAt","desc").get();
    res.json(snap.docs.map(toClient));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const { date, hour, hours, name, studentId, bandName, email, purpose } = req.body;
    if (!date||!hour||!hours||!name||!studentId||!bandName||!email||!purpose)
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

    const snap = await bookingsCol.where("date","==",date).where("status","in",["pending","approved"]).get();
    const existing = snap.docs.map(d=>d.data());
    for (const b of existing) {
      const bSlots = Array.from({length:b.hours},(_,i)=>b.hour+i);
      const newSlots = Array.from({length:hours},(_,i)=>hour+i);
      if (bSlots.some(s=>newSlots.includes(s)))
        return res.status(409).json({ error: "ช่วงเวลานี้ถูกจองแล้ว" });
    }

    const bandSnap = await bookingsCol.where("date","==",date).where("bandName","==",bandName).where("status","in",["pending","approved"]).get();
    const usedHours = bandSnap.docs.reduce((s,d)=>s+d.data().hours, 0);
    if (usedHours + hours > 2)
      return res.status(400).json({ error: `วง "${bandName}" ใช้โควต้าครบ 2 ชม./วันแล้ว` });

    const docRef = await bookingsCol.add({ date, hour, hours, name, studentId, bandName, email, purpose, status:"pending", roomCode:null, createdAt:new Date().toISOString() });
    const doc = await docRef.get();
    res.status(201).json(toClient(doc));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/bookings/:id/cancel", async (req, res) => {
  try {
    await bookingsCol.doc(req.params.id).update({ status:"cancelled" });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
});

app.patch("/api/admin/bookings/:id/approve", async (req, res) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode) return res.status(400).json({ error: "กรุณาระบุรหัสห้อง" });

    const docRef = bookingsCol.doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "ไม่พบการจอง" });

    await docRef.update({ status:"approved", roomCode });
    const updated = toClient(await docRef.get());

    try {
      await sendRoomCodeEmail({ to:updated.email, name:updated.name, bandName:updated.bandName, roomCode, date:updated.date, hour:updated.hour, hours:updated.hours });
      console.log("Email sent to", updated.email);
    } catch(emailErr) {
      console.error("Email error:", emailErr.message);
    }

    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/bookings/:id/reject", async (req, res) => {
  try {
    await bookingsCol.doc(req.params.id).update({ status:"cancelled" });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
