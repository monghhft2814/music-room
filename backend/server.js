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

function toClient(doc) { return { id: doc.id, ...doc.data() }; }

async function sendRoomCodeEmail({ to, name, bandName, roomCode, date, hour, hours }) {
  const h = (n) => `${String(n).padStart(2,"0")}:00`;
  await resend.emails.send({
    from: "ห้องซ้อมดนตรี มช. <onboarding@resend.dev>",
    to,
    subject: `[ห้องซ้อมดนตรี] รหัสเปิดห้อง — ${date}`,
    html: `<div style="font-family:sans-serif;padding:32px;background:#0B0B10;color:#F0EDE8;border-radius:16px"><h2>🎵 การจองได้รับอนุมัติแล้ว!</h2><p>เรียน ${name} (${bandName})</p><p>วันที่: ${date} · เวลา: ${h(hour)}–${h(hour+hours)} น.</p><div style="background:#0D0D18;border:2px solid #E8204B;border-radius:12px;padding:24px;text-align:center;margin:20px 0"><p style="color:#888;font-size:12px">รหัสเปิดห้อง</p><p style="font-size:40px;font-weight:900;letter-spacing:12px;color:#E8204B;font-family:monospace">${roomCode}</p></div><p style="color:#555">คณะการสื่อสารมวลชน มหาวิทยาลัยเชียงใหม่</p></div>`,
  });
}

app.get("/api/bookings", async (req, res) => {
  try { const snap = await bookingsCol.orderBy("createdAt","desc").get(); res.json(snap.docs.map(toClient)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const { date, hour, hours, name, studentId, bandName, email, purpose } = req.body;
    if (!date||!hour||!hours||!name||!studentId||!bandName||!email||!purpose) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    const snap = await bookingsCol.where("date","==",date).where("status","in",["pending","approved"]).get();
    for (const b of snap.docs.map(d=>d.data())) {
      const bSlots = Array.from({length:b.hours},(_,i)=>b.hour+i);
      const newSlots = Array.from({length:hours},(_,i)=>hour+i);
      if (bSlots.some(s=>newSlots.includes(s))) return res.status(409).json({ error: "ช่วงเวลานี้ถูกจองแล้ว" });
    }
    const bandSnap = await bookingsCol.where("date","==",date).where("bandName","==",bandName).where("status","in",["pending","approved"]).get();
    if (bandSnap.docs.reduce((s,d)=>s+d.data().hours,0) + hours > 2) return res.status(400).json({ error: `วง "${bandName}" ใช้โควต้าครบแล้ว` });
    const docRef = await bookingsCol.add({ date, hour, hours, name, studentId, bandName, email, purpose, status:"pending", roomCode:null, createdAt:new Date().toISOString() });
    res.status(201).json(toClient(await docRef.get()));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/bookings/:id/cancel", async (req, res) => {
  try { await bookingsCol.doc(req.params.id).update({ status:"cancelled" }); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok:true });
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
    try { await sendRoomCodeEmail({ to:updated.email, name:updated.name, bandName:updated.bandName, roomCode, date:updated.date, hour:updated.hour, hours:updated.hours }); }
    catch(e) { console.error("Email error:", e.message); }
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/bookings/:id/reject", async (req, res) => {
  try { await bookingsCol.doc(req.params.id).update({ status:"cancelled" }); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
