import { useState, useMemo, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";

const HOURS = [17, 18, 19, 20, 21];
const HOUR_LABEL = (h) => `${String(h).padStart(2, "0")}:00`;
const MAX_HOURS_PER_BAND = 2;

function getDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getWeekDates(baseDate) {
  const start = new Date(baseDate);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
const DAY_TH = ["จ","อ","พ","พฤ","ศ","ส","อา"];
const MONTH_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const today = new Date(); today.setHours(0,0,0,0);
  const [view, setView] = useState("calendar");
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekBase, setWeekBase] = useState(today);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name:"", studentId:"", bandName:"", email:"", purpose:"", hours:1 });
  const [toast, setToast] = useState(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const [adminPwError, setAdminPwError] = useState(false);
  const [adminCodeInputs, setAdminCodeInputs] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekBase), [weekBase]);

  // ── Fetch bookings ──
  async function fetchBookings() {
    try {
      const res = await fetch(`${API}/api/bookings`);
      const data = await res.json();
      setBookings(data);
    } catch(e) { showToast("ไม่สามารถโหลดข้อมูลได้", "error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchBookings(); }, []);

  function showToast(msg, type="success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function getOccupiedSlots(b) {
    return Array.from({ length: b.hours }, (_, i) => b.hour + i);
  }
  function getBookingAtSlot(date, hour) {
    return bookings.find(b => b.date===date && b.status!=="cancelled" && getOccupiedSlots(b).includes(hour));
  }
  function bandHoursOnDate(bandName, date) {
    return bookings.filter(b => b.bandName.trim().toLowerCase()===bandName.trim().toLowerCase() && b.date===date && b.status!=="cancelled").reduce((s,b)=>s+b.hours, 0);
  }
  function getMaxConsecutive(date, startHour) {
    let max = 0;
    for (let i=0; i<HOURS.length; i++) {
      if (HOURS[i] < startHour) continue;
      if (getBookingAtSlot(date, HOURS[i])) break;
      max++; if (max===MAX_HOURS_PER_BAND) break;
    }
    return max;
  }

  function handleSlotClick(date, hour) {
    const dateKey = getDayKey(date);
    const existing = getBookingAtSlot(dateKey, hour);
    if (existing) { setModal({ type:"detail", booking:existing }); return; }
    const d = new Date(date); d.setHours(0,0,0,0);
    if (d < today) return;
    const maxH = getMaxConsecutive(dateKey, hour);
    if (maxH===0) return;
    setModal({ type:"book", date:dateKey, hour, maxHours:maxH });
    setForm({ name:"", studentId:"", bandName:"", email:"", purpose:"", hours:1 });
  }

  async function handleBook() {
    const { name, studentId, bandName, email, purpose, hours } = form;
    if (!name.trim()||!studentId.trim()||!bandName.trim()||!email.trim()||!purpose.trim()) {
      showToast("กรุณากรอกข้อมูลให้ครบ","error"); return;
    }
    if (!email.includes("@")) { showToast("อีเมลไม่ถูกต้อง","error"); return; }
    if (bandHoursOnDate(bandName, modal.date) + hours > MAX_HOURS_PER_BAND) {
      showToast(`วง "${bandName}" ใช้โควต้าครบ ${MAX_HOURS_PER_BAND} ชม./วันแล้ว`,"error"); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/bookings`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ date:modal.date, hour:modal.hour, hours, name:name.trim(), studentId:studentId.trim(), bandName:bandName.trim(), email:email.trim(), purpose:purpose.trim() })
      });
      if (!res.ok) { const e=await res.json(); showToast(e.error||"เกิดข้อผิดพลาด","error"); return; }
      const newB = await res.json();
      setBookings(prev => [...prev, newB]);
      setModal({ type:"success_pending", booking:newB });
    } catch(e) { showToast("ไม่สามารถเชื่อมต่อ server","error"); }
    finally { setSubmitting(false); }
  }

  async function handleCancel(id) {
    try {
      await fetch(`${API}/api/bookings/${id}/cancel`, { method:"PATCH" });
      setBookings(prev => prev.map(b => b.id===id ? {...b, status:"cancelled"} : b));
      setModal(null); showToast("ยกเลิกการจองแล้ว","error");
    } catch(e) { showToast("เกิดข้อผิดพลาด","error"); }
  }

  async function handleAdminLogin() {
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ password: adminPwInput })
      });
      if (res.ok) { setAdminAuth(true); setAdminPwError(false); setView("admin"); setModal(null); }
      else { setAdminPwError(true); }
    } catch(e) { setAdminPwError(true); }
  }

  async function handleAdminApprove(id) {
    const code = (adminCodeInputs[id]||"").trim().toUpperCase();
    if (code.length < 4) { showToast("กรุณากรอกรหัสก่อน (อย่างน้อย 4 ตัว)","error"); return; }
    try {
      const res = await fetch(`${API}/api/admin/bookings/${id}/approve`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ roomCode: code })
      });
      if (!res.ok) { showToast("เกิดข้อผิดพลาด","error"); return; }
      const updated = await res.json();
      setBookings(prev => prev.map(b => b.id===id ? updated : b));
      setAdminCodeInputs(prev => { const n={...prev}; delete n[id]; return n; });
      showToast(`✓ อนุมัติแล้ว — ส่งรหัสไปที่ ${updated.email} แล้ว`);
    } catch(e) { showToast("เกิดข้อผิดพลาด","error"); }
  }

  async function handleAdminReject(id) {
    try {
      await fetch(`${API}/api/admin/bookings/${id}/reject`, { method:"PATCH" });
      setBookings(prev => prev.map(b => b.id===id ? {...b, status:"cancelled"} : b));
      showToast("ปฏิเสธการจองแล้ว","error");
    } catch(e) { showToast("เกิดข้อผิดพลาด","error"); }
  }

  const pendingBookings = bookings.filter(b => b.status==="pending");
  const history = [...bookings].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));

  function renderSlotGrid() {
    const dateKey = getDayKey(selectedDate);
    const d = new Date(selectedDate); d.setHours(0,0,0,0);
    const past = d < today;
    return HOURS.map((h, idx) => {
      const booking = getBookingAtSlot(dateKey, h);
      const isStart = booking && booking.hour===h;
      const isMid = booking && booking.hour!==h;
      const isLast = idx===HOURS.length-1;
      const sc = booking ? (booking.status==="approved"?"#E8204B":booking.status==="pending"?"#E8A020":"#444") : null;
      return (
        <div key={h} onClick={() => handleSlotClick(selectedDate, h)}
          style={{ display:"flex", alignItems:"center", borderBottom:isLast?"none":"1px solid #171722", cursor:past||isMid?"default":"pointer", background:booking?(booking.status==="approved"?"#1A0810":booking.status==="pending"?"#1A1408":"transparent"):"transparent", minHeight:58, transition:"background 0.15s" }}
          onMouseEnter={e=>{ if(!past&&!booking) e.currentTarget.style.background="#141420"; }}
          onMouseLeave={e=>{ e.currentTarget.style.background=booking?(booking.status==="approved"?"#1A0810":booking.status==="pending"?"#1A1408":"transparent"):"transparent"; }}
        >
          <div style={{ width:80, padding:"0 16px", flexShrink:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:booking?sc:past?"#2E2E3A":"#666" }}>{HOUR_LABEL(h)}</div>
            <div style={{ fontSize:11, color:"#2E2E3A", marginTop:1 }}>–{HOUR_LABEL(h+1)}</div>
          </div>
          <div style={{ width:1, height:36, background:booking?sc+"55":"#1C1C28", flexShrink:0 }} />
          <div style={{ flex:1, padding:"10px 18px" }}>
            {booking&&isStart ? (
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#F0EDE8" }}>{booking.bandName} <span style={{ fontWeight:400, color:"#888" }}>· {booking.name}</span></div>
                  <div style={{ fontSize:12, color:"#777", marginTop:1 }}>{booking.purpose} · {booking.hours} ชม.</div>
                </div>
                <div style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:booking.status==="approved"?"#2A0D16":"#2A1F08", color:sc, border:`1px solid ${sc}44` }}>
                  {booking.status==="approved"?"อนุมัติแล้ว":"รออนุมัติ"}
                </div>
              </div>
            ) : booking&&isMid ? (
              <div style={{ fontSize:12, color:sc+"88", paddingLeft:4 }}>↑ ต่อเนื่องจากชั่วโมงก่อน</div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:26, height:26, borderRadius:8, border:past?"1px solid #1E1E28":"1.5px dashed #2A2A3E", display:"flex", alignItems:"center", justifyContent:"center", color:past?"#222":"#444", fontSize:16 }}>+</div>
                <span style={{ fontSize:13, color:past?"#2A2A38":"#555" }}>{past?"เลยเวลาแล้ว":"ว่าง — คลิกเพื่อจอง"}</span>
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0B0B10", color:"#F0EDE8", fontFamily:"'Sarabun', 'Noto Sans Thai', sans-serif" }}>
      <header style={{ background:"linear-gradient(135deg,#18181F,#101018)", borderBottom:"1px solid #1E1E2A", padding:"0 24px" }}>
        <div style={{ maxWidth:920, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:64 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#E8204B,#9B0E2F)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🎵</div>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>ห้องซ้อมดนตรี</div>
              <div style={{ fontSize:11, color:"#555", marginTop:-1 }}>คณะการสื่อสารมวลชน มช. · 17:00–22:00 น.</div>
            </div>
          </div>
          <nav style={{ display:"flex", gap:4 }}>
            <button onClick={()=>setView("calendar")} style={{ padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:600, background:view==="calendar"?"linear-gradient(135deg,#E8204B,#9B0E2F)":"transparent", color:view==="calendar"?"#fff":"#666" }}>📅 จองห้อง</button>
            {adminAuth && <button onClick={()=>setView("history")} style={{ padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:600, background:view==="history"?"linear-gradient(135deg,#E8204B,#9B0E2F)":"transparent", color:view==="history"?"#fff":"#666" }}>📋 ประวัติ</button>}
            <button onClick={()=>{ if(adminAuth) setView("admin"); else setModal({type:"adminLogin"}); }}
              style={{ padding:"8px 16px", borderRadius:8, border:view==="admin"?"1px solid #4B8BE8":"1px solid #1E1E2E", cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:600, background:view==="admin"?"linear-gradient(135deg,#1A3A6A,#0D2040)":"transparent", color:view==="admin"?"#7AB8FF":"#555", display:"flex", alignItems:"center", gap:6 }}>
              🔧 Admin {adminAuth&&<span style={{ width:6,height:6,borderRadius:"50%",background:"#4AE88A",display:"inline-block" }}/>}
            </button>
            {adminAuth&&<button onClick={()=>{setAdminAuth(false);if(view==="admin")setView("calendar");}} style={{ padding:"8px 10px", borderRadius:8, border:"none", background:"transparent", color:"#444", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>ออก</button>}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth:920, margin:"0 auto", padding:"28px 24px 60px" }}>
        {loading && <div style={{ textAlign:"center", padding:"60px 0", color:"#444", fontSize:14 }}>⏳ กำลังโหลด...</div>}

        {!loading && view==="calendar" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
              <button onClick={()=>{const d=new Date(weekBase);d.setDate(d.getDate()-7);setWeekBase(d);}} style={{ width:34,height:34,borderRadius:8,background:"#161620",border:"1px solid #222230",color:"#aaa",cursor:"pointer",fontSize:18 }}>‹</button>
              <span style={{ fontSize:14,fontWeight:600,minWidth:190,textAlign:"center" }}>{weekDates[0].getDate()} {MONTH_TH[weekDates[0].getMonth()]} – {weekDates[6].getDate()} {MONTH_TH[weekDates[6].getMonth()]} {weekDates[6].getFullYear()+543}</span>
              <button onClick={()=>{const d=new Date(weekBase);d.setDate(d.getDate()+7);setWeekBase(d);}} style={{ width:34,height:34,borderRadius:8,background:"#161620",border:"1px solid #222230",color:"#aaa",cursor:"pointer",fontSize:18 }}>›</button>
              <button onClick={()=>{setWeekBase(new Date(today));setSelectedDate(new Date(today));}} style={{ padding:"7px 14px",borderRadius:8,background:"#161620",border:"1px solid #222230",color:"#777",cursor:"pointer",fontSize:12,fontFamily:"inherit" }}>วันนี้</button>
              <div style={{ marginLeft:"auto",display:"flex",gap:14,fontSize:11,color:"#555" }}>
                <span>🟡 รออนุมัติ</span><span>🔴 อนุมัติแล้ว</span>
              </div>
            </div>
            <div style={{ display:"flex",gap:6,marginBottom:20 }}>
              {weekDates.map((d,i)=>{
                const isToday=getDayKey(d)===getDayKey(today),isSel=getDayKey(d)===getDayKey(selectedDate),isPast=new Date(d)<today;
                return (
                  <button key={i} onClick={()=>!isPast&&setSelectedDate(new Date(d))} style={{ flex:1,padding:"10px 4px",borderRadius:10,border:isSel?"1.5px solid #E8204B":"1px solid #1C1C26",background:isSel?"#1F0A12":"#111118",color:isPast?"#2E2E3A":isSel?"#fff":"#888",cursor:isPast?"default":"pointer",textAlign:"center",fontFamily:"inherit" }}>
                    <div style={{ fontSize:10,marginBottom:3,color:isToday?"#E8204B":"inherit" }}>{DAY_TH[i]}</div>
                    <div style={{ fontSize:17,fontWeight:700 }}>{d.getDate()}</div>
                    <div style={{ fontSize:10,color:isPast?"#222":"#444",marginTop:1 }}>{MONTH_TH[d.getMonth()]}</div>
                    {isToday&&<div style={{ width:5,height:5,borderRadius:"50%",background:"#E8204B",margin:"3px auto 0" }}/>}
                  </button>
                );
              })}
            </div>
            <div style={{ background:"#111118",borderRadius:14,border:"1px solid #1A1A26",overflow:"hidden" }}>
              {renderSlotGrid()}
            </div>
            <div style={{ marginTop:14,padding:"11px 16px",borderRadius:9,background:"#0F0F18",border:"1px solid #1A1A28",display:"flex",gap:10,alignItems:"flex-start" }}>
              <span style={{ fontSize:15 }}>ℹ️</span>
              <span style={{ fontSize:12,color:"#555",lineHeight:1.7 }}>จองได้สูงสุด <strong style={{ color:"#aaa" }}>{MAX_HOURS_PER_BAND} ชั่วโมง/วง/วัน</strong> · Admin อนุมัติและตั้งรหัส → <strong style={{ color:"#aaa" }}>รหัสส่งไปยังอีเมล</strong> ของคุณ</span>
            </div>
          </div>
        )}

        {!loading && view==="history" && (
          <div>
            <div style={{ marginBottom:18,fontSize:13,color:"#555" }}>ประวัติการจองทั้งหมด</div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {history.length===0&&<div style={{ textAlign:"center",color:"#333",padding:"60px 0",fontSize:14 }}>ยังไม่มีประวัติ</div>}
              {history.map(b=>{
                const sc=b.status==="approved"?"#E8204B":b.status==="pending"?"#E8A020":"#444";
                const sl=b.status==="approved"?"อนุมัติแล้ว":b.status==="pending"?"รออนุมัติ":"ยกเลิก";
                return (
                  <div key={b.id} style={{ background:"#111118",border:`1px solid ${b.status==="cancelled"?"#1A1A26":sc+"33"}`,borderRadius:12,padding:"16px 20px",opacity:b.status==="cancelled"?0.5:1 }}>
                    <div style={{ display:"flex",alignItems:"flex-start",gap:14 }}>
                      <div style={{ width:44,height:44,borderRadius:10,background:b.status==="cancelled"?"#161620":sc+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>🎸</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap" }}>
                          <span style={{ fontWeight:800,fontSize:14 }}>{b.bandName}</span>
                          <span style={{ fontSize:11,color:"#333" }}>·</span>
                          <span style={{ fontSize:13,color:"#777" }}>{b.date} · {HOUR_LABEL(b.hour)}–{HOUR_LABEL(b.hour+b.hours)} น.</span>
                        </div>
                        <div style={{ fontSize:13,color:"#bbb" }}>{b.name} <span style={{ color:"#444" }}>({b.studentId})</span></div>
                        <div style={{ fontSize:12,color:"#555",marginTop:2 }}>{b.purpose}</div>
                        {b.status==="approved"&&b.roomCode&&(
                          <div style={{ marginTop:10,display:"inline-flex",alignItems:"center",gap:10,padding:"8px 14px",borderRadius:8,background:"#0D0D18",border:"1px solid #E8204B44" }}>
                            <span style={{ fontSize:11,color:"#555" }}>รหัสเปิดห้อง:</span>
                            <span style={{ fontSize:18,fontWeight:900,letterSpacing:5,color:"#E8204B",fontFamily:"monospace" }}>{b.roomCode}</span>
                          </div>
                        )}
                        {b.status==="pending"&&<div style={{ marginTop:8,fontSize:12,color:"#E8A02077" }}>⏳ รอ Admin อนุมัติ — รหัสจะส่งไปที่ {b.email}</div>}
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end",flexShrink:0 }}>
                        <div style={{ padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,background:b.status==="cancelled"?"#1A1A26":sc+"22",color:sc,border:`1px solid ${sc}44` }}>{sl}</div>
                        {b.status!=="cancelled"&&<button onClick={()=>handleCancel(b.id)} style={{ padding:"5px 12px",borderRadius:8,background:"transparent",border:"1px solid #1E1E28",color:"#555",cursor:"pointer",fontSize:11,fontFamily:"inherit" }}>ยกเลิก</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && view==="admin" && adminAuth && (
          <div>
            <div style={{ marginBottom:32 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
                <h2 style={{ margin:0,fontSize:16,fontWeight:800 }}>คำขอที่รอดำเนินการ</h2>
                {pendingBookings.length>0&&<span style={{ padding:"2px 10px",borderRadius:20,background:"#2A1A08",color:"#E8A020",fontSize:12,fontWeight:700,border:"1px solid #E8A02044" }}>{pendingBookings.length} รายการ</span>}
              </div>
              {pendingBookings.length===0 ? (
                <div style={{ textAlign:"center",padding:"40px 0",color:"#333",fontSize:14,background:"#111118",borderRadius:12,border:"1px solid #1A1A26" }}>ไม่มีคำขอที่รอดำเนินการ ✓</div>
              ) : pendingBookings.map(b=>(
                <div key={b.id} style={{ background:"#111118",border:"1px solid #2A1A0844",borderRadius:12,padding:"18px 20px",marginBottom:10 }}>
                  <div style={{ display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap" }}>
                    <div style={{ flex:1,minWidth:220 }}>
                      <div style={{ fontWeight:800,fontSize:15,marginBottom:4 }}>{b.bandName}</div>
                      <div style={{ fontSize:13,color:"#bbb",marginBottom:3 }}>{b.name} · {b.studentId}</div>
                      <div style={{ fontSize:13,color:"#888",marginBottom:3 }}>📅 {b.date} · {HOUR_LABEL(b.hour)}–{HOUR_LABEL(b.hour+b.hours)} น. ({b.hours} ชม.)</div>
                      <div style={{ fontSize:13,color:"#888",marginBottom:3 }}>🎵 {b.purpose}</div>
                      <div style={{ fontSize:12,color:"#555" }}>📧 ส่งรหัสไปที่: <span style={{ color:"#aaa" }}>{b.email}</span></div>
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",gap:10,minWidth:240 }}>
                      <div>
                        <label style={{ fontSize:11,color:"#666",fontWeight:700,display:"block",marginBottom:6 }}>ตั้งรหัสเปิดห้อง</label>
                        <input value={adminCodeInputs[b.id]||""} onChange={e=>setAdminCodeInputs(p=>({...p,[b.id]:e.target.value.toUpperCase().replace(/\s/g,"").slice(0,8)}))}
                          placeholder="เช่น MX3K7P"
                          style={{ width:"100%",padding:"10px 12px",borderRadius:8,background:"#0D0D18",border:"1px solid #2A2A3A",color:"#F0EDE8",fontSize:15,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box",letterSpacing:3 }}
                          onFocus={e=>e.target.style.borderColor="#4B8BE8"} onBlur={e=>e.target.style.borderColor="#2A2A3A"}
                        />
                        <div style={{ fontSize:11,color:"#444",marginTop:4 }}>ระบบจะส่งอีเมลหาผู้จองอัตโนมัติ</div>
                      </div>
                      <div style={{ display:"flex",gap:8 }}>
                        <button onClick={()=>handleAdminReject(b.id)} style={{ flex:1,padding:"9px 0",borderRadius:8,background:"transparent",border:"1px solid #2A1A1A",color:"#E8204B",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700 }}>✕ ปฏิเสธ</button>
                        <button onClick={()=>handleAdminApprove(b.id)} style={{ flex:2,padding:"9px 0",borderRadius:8,background:"linear-gradient(135deg,#1A3A6A,#0D2040)",border:"1px solid #2A4A8A44",color:"#7AB8FF",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:800 }}>✓ อนุมัติ & ส่งรหัส</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h2 style={{ fontSize:16,fontWeight:800,marginBottom:14 }}>การจองทั้งหมด</h2>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #1E1E2A" }}>
                      {["วง","ชื่อ","วันที่","เวลา","ชม.","สถานะ","รหัสห้อง","อีเมล"].map(h=>(
                        <th key={h} style={{ padding:"8px 12px",textAlign:"left",color:"#555",fontWeight:700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(b=>{
                      const sc=b.status==="approved"?"#E8204B":b.status==="pending"?"#E8A020":"#444";
                      return (
                        <tr key={b.id} style={{ borderBottom:"1px solid #141420",opacity:b.status==="cancelled"?0.45:1 }}>
                          <td style={{ padding:"10px 12px",fontWeight:700 }}>{b.bandName}</td>
                          <td style={{ padding:"10px 12px",color:"#aaa" }}>{b.name}</td>
                          <td style={{ padding:"10px 12px",color:"#888" }}>{b.date}</td>
                          <td style={{ padding:"10px 12px",color:"#888" }}>{HOUR_LABEL(b.hour)}–{HOUR_LABEL(b.hour+b.hours)}</td>
                          <td style={{ padding:"10px 12px",color:"#777",textAlign:"center" }}>{b.hours}</td>
                          <td style={{ padding:"10px 12px" }}><span style={{ color:sc,fontWeight:700 }}>{b.status==="approved"?"✓ อนุมัติ":b.status==="pending"?"⏳ รอ":"✕ ยกเลิก"}</span></td>
                          <td style={{ padding:"10px 12px",fontFamily:"monospace",fontWeight:700,color:"#E8204B",letterSpacing:2 }}>{b.roomCode||"—"}</td>
                          <td style={{ padding:"10px 12px",color:"#555",fontSize:12 }}>{b.email}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {modal&&(
        <div onClick={()=>setModal(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#141420",border:"1px solid #222235",borderRadius:18,width:"100%",maxWidth:440,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",maxHeight:"90vh",overflowY:"auto" }}>

            {modal.type==="adminLogin"&&(
              <>
                <div style={{ padding:"24px 24px 18px",borderBottom:"1px solid #1E1E2E",textAlign:"center" }}>
                  <div style={{ fontSize:36,marginBottom:8 }}>🔧</div>
                  <div style={{ fontWeight:800,fontSize:17 }}>Admin Login</div>
                </div>
                <div style={{ padding:24 }}>
                  <label style={{ display:"block",fontSize:12,color:"#777",marginBottom:6,fontWeight:700 }}>รหัสผ่าน Admin</label>
                  <input type="password" value={adminPwInput} onChange={e=>{setAdminPwInput(e.target.value);setAdminPwError(false);}}
                    onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} placeholder="กรอกรหัสผ่าน"
                    style={{ width:"100%",padding:"11px 13px",borderRadius:9,background:"#0D0D18",border:`1px solid ${adminPwError?"#E8204B":"#222235"}`,color:"#F0EDE8",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box" }}
                  />
                  {adminPwError&&<div style={{ fontSize:12,color:"#E8204B",marginTop:6 }}>รหัสผ่านไม่ถูกต้อง</div>}
                  <div style={{ display:"flex",gap:10,marginTop:18 }}>
                    <button onClick={()=>setModal(null)} style={{ flex:1,padding:12,borderRadius:10,background:"transparent",border:"1px solid #222235",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:14 }}>ยกเลิก</button>
                    <button onClick={handleAdminLogin} style={{ flex:2,padding:12,borderRadius:10,background:"linear-gradient(135deg,#1A3A6A,#0D2040)",border:"none",color:"#7AB8FF",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:800 }}>เข้าสู่ระบบ</button>
                  </div>
                </div>
              </>
            )}

            {modal.type==="book"&&(
              <>
                <div style={{ padding:"22px 24px 16px",borderBottom:"1px solid #1E1E2E" }}>
                  <div style={{ fontWeight:800,fontSize:17,marginBottom:4 }}>จองห้องซ้อมดนตรี</div>
                  <div style={{ fontSize:13,color:"#666" }}>{modal.date} · เริ่ม {HOUR_LABEL(modal.hour)}</div>
                </div>
                <div style={{ padding:24 }}>
                  <div style={{ marginBottom:18 }}>
                    <label style={{ display:"block",fontSize:12,color:"#777",marginBottom:8,fontWeight:700 }}>จำนวนชั่วโมง (สูงสุด {modal.maxHours} ชม.)</label>
                    <div style={{ display:"flex",gap:8 }}>
                      {Array.from({length:modal.maxHours},(_,i)=>i+1).map(h=>(
                        <button key={h} onClick={()=>setForm(p=>({...p,hours:h}))} style={{ flex:1,padding:"10px 0",borderRadius:9,border:form.hours===h?"1.5px solid #E8204B":"1px solid #222235",background:form.hours===h?"#1F0A12":"#0D0D18",color:form.hours===h?"#fff":"#777",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700 }}>
                          {h} ชม.<div style={{ fontSize:10,fontWeight:400,color:"#555" }}>{HOUR_LABEL(modal.hour)}–{HOUR_LABEL(modal.hour+h)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {[{key:"bandName",label:"ชื่อวง",placeholder:"เช่น The Sunset"},{key:"name",label:"ชื่อ-นามสกุล (ผู้จอง)",placeholder:"เช่น ณัฐพล ใจดี"},{key:"studentId",label:"รหัสนักศึกษา",placeholder:"เช่น 660110001"},{key:"email",label:"อีเมล (รับรหัสเปิดห้อง)",placeholder:"เช่น student@cmu.ac.th"},{key:"purpose",label:"วัตถุประสงค์",placeholder:"เช่น ซ้อมวง, อัดเสียง"}].map(f=>(
                    <div key={f.key} style={{ marginBottom:14 }}>
                      <label style={{ display:"block",fontSize:12,color:"#777",marginBottom:5,fontWeight:700 }}>{f.label}</label>
                      <input value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                        placeholder={f.placeholder} type={f.key==="email"?"email":"text"}
                        style={{ width:"100%",padding:"10px 12px",borderRadius:8,background:"#0D0D18",border:"1px solid #222235",color:"#F0EDE8",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box" }}
                        onFocus={e=>e.target.style.borderColor="#E8204B88"} onBlur={e=>e.target.style.borderColor="#222235"}
                      />
                    </div>
                  ))}
                  <div style={{ display:"flex",gap:10,marginTop:4 }}>
                    <button onClick={()=>setModal(null)} style={{ flex:1,padding:12,borderRadius:10,background:"transparent",border:"1px solid #222235",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:14 }}>ยกเลิก</button>
                    <button onClick={handleBook} disabled={submitting} style={{ flex:2,padding:12,borderRadius:10,background:"linear-gradient(135deg,#E8204B,#9B0E2F)",border:"none",color:"#fff",cursor:submitting?"default":"pointer",fontFamily:"inherit",fontSize:14,fontWeight:800,opacity:submitting?0.7:1 }}>{submitting?"กำลังส่ง...":"ส่งคำขอจอง →"}</button>
                  </div>
                </div>
              </>
            )}

            {modal.type==="success_pending"&&modal.booking&&(
              <>
                <div style={{ padding:"28px 24px 20px",textAlign:"center",borderBottom:"1px solid #1E1E2E" }}>
                  <div style={{ fontSize:44,marginBottom:10 }}>📬</div>
                  <div style={{ fontWeight:800,fontSize:18,marginBottom:6 }}>ส่งคำขอแล้ว!</div>
                  <div style={{ fontSize:13,color:"#666" }}>{modal.booking.date} · {HOUR_LABEL(modal.booking.hour)}–{HOUR_LABEL(modal.booking.hour+modal.booking.hours)} น.</div>
                </div>
                <div style={{ padding:24 }}>
                  <div style={{ padding:16,borderRadius:12,background:"#0F1A0F",border:"1px solid #1E3022",marginBottom:20 }}>
                    <div style={{ fontSize:13,color:"#4AE88A",fontWeight:700,marginBottom:10 }}>✓ ขั้นตอนถัดไป</div>
                    {["Admin จะตรวจสอบและอนุมัติคำขอ","Admin ตั้งรหัสเปิดห้อง",`รหัสจะส่งไปที่ ${modal.booking.email}`,"ใช้รหัสกดที่แผงหน้าห้องซ้อม"].map((s,i)=>(
                      <div key={i} style={{ display:"flex",gap:10,fontSize:13,color:"#888",marginBottom:8 }}><span style={{ color:"#4AE88A",fontWeight:700,minWidth:20 }}>{i+1}.</span>{s}</div>
                    ))}
                  </div>
                  <button onClick={()=>setModal(null)} style={{ width:"100%",padding:13,borderRadius:10,background:"linear-gradient(135deg,#E8204B,#9B0E2F)",border:"none",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:800 }}>เข้าใจแล้ว ✓</button>
                </div>
              </>
            )}

            {modal.type==="detail"&&modal.booking&&(()=>{
              const b=modal.booking;
              const sc=b.status==="approved"?"#E8204B":b.status==="pending"?"#E8A020":"#444";
              return (
                <>
                  <div style={{ padding:"20px 24px 14px",borderBottom:"1px solid #1E1E2E" }}>
                    <div style={{ fontWeight:800,fontSize:16,marginBottom:4 }}>รายละเอียดการจอง</div>
                    <div style={{ fontSize:13,color:"#666" }}>{b.date} · {HOUR_LABEL(b.hour)}–{HOUR_LABEL(b.hour+b.hours)} น.</div>
                  </div>
                  <div style={{ padding:24 }}>
                    {[["ชื่อวง",b.bandName],["ผู้จอง",b.name],["รหัสนักศึกษา",b.studentId],["อีเมล",b.email],["วัตถุประสงค์",b.purpose],["จำนวน",`${b.hours} ชั่วโมง`]].map(([l,v])=>(
                      <div key={l} style={{ display:"flex",gap:12,marginBottom:11,fontSize:14 }}>
                        <span style={{ color:"#555",minWidth:110 }}>{l}</span>
                        <span style={{ color:"#F0EDE8",fontWeight:600 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display:"flex",gap:12,marginBottom:16,fontSize:14 }}>
                      <span style={{ color:"#555",minWidth:110 }}>สถานะ</span>
                      <span style={{ color:sc,fontWeight:700 }}>{b.status==="approved"?"✓ อนุมัติแล้ว":b.status==="pending"?"⏳ รออนุมัติ":"✕ ยกเลิก"}</span>
                    </div>
                    {b.status==="approved"&&b.roomCode&&(
                      <div style={{ marginBottom:20,padding:"14px 18px",borderRadius:10,background:"#0D0D18",border:"1px solid #E8204B44",textAlign:"center" }}>
                        <div style={{ fontSize:11,color:"#555",marginBottom:6 }}>รหัสเปิดห้อง (ส่งทางอีเมลแล้ว)</div>
                        <div style={{ fontSize:28,fontWeight:900,letterSpacing:8,color:"#E8204B",fontFamily:"monospace" }}>{b.roomCode}</div>
                      </div>
                    )}
                    <div style={{ display:"flex",gap:10 }}>
                      <button onClick={()=>setModal(null)} style={{ flex:1,padding:12,borderRadius:10,background:"transparent",border:"1px solid #222235",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:14 }}>ปิด</button>
                      {b.status!=="cancelled"&&<button onClick={()=>handleCancel(b.id)} style={{ flex:1,padding:12,borderRadius:10,background:"#1F0A10",border:"1px solid #E8204B44",color:"#E8204B",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700 }}>ยกเลิกการจอง</button>}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {toast&&(
        <div style={{ position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#1F0A10":"#0A1F12",border:`1px solid ${toast.type==="error"?"#E8204B":"#2AE870"}`,color:toast.type==="error"?"#E8204B":"#2AE870",padding:"12px 24px",borderRadius:10,fontSize:14,fontWeight:700,zIndex:200,whiteSpace:"nowrap",boxShadow:"0 8px 30px rgba(0,0,0,0.5)" }}>
          {toast.msg}
        </div>
      )}
      <Analytics />
    </div>
  );
}
