// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024
});

// rooms structure
const rooms = {};

app.get("/", (req,res)=>res.redirect("/room/" + Math.random().toString(36).slice(2,9)));

app.get("/room/:id",(req,res)=>{
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.id}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:100vh;background:#0f0f0f;color:white;font-family:Arial;display:flex;flex-direction:column}
#videoGrid{flex:1;display:flex;flex-wrap:wrap;gap:6px;padding:6px;overflow:auto}
.participant{position:relative;background:#222;padding:2px;border-radius:6px;width:180px}
.participant video{width:100%;border-radius:6px}
.participant .name-label{text-align:center;margin-top:2px;font-size:0.9em}
#bottomBar{display:flex;gap:6px;padding:6px;background:#141414;align-items:center}
input[type=text]{flex:1;padding:6px;border-radius:6px;border:none;background:#111;color:white}
button,input[type=file]{padding:6px;border-radius:6px;border:none;background:#111;color:white;cursor:pointer}
#chatOverlay{position:absolute;bottom:60px;right:10px;width:260px;max-height:400px;background:#222;border-radius:8px;display:none;flex-direction:column;overflow:hidden}
#chatHeader{background:#333;padding:4px;text-align:center;cursor:pointer} 
#chatMessages{flex:1;padding:4px;overflow-y:auto;font-size:0.85em}
#chatInputBar{display:flex;gap:4px;padding:4px}
#chatInputBar input{flex:1;padding:4px;background:#111;color:white;border:none;border-radius:4px}
</style>
</head>
<body>

<div id="videoGrid"></div>

<div id="chatOverlay">
  <div id="chatHeader">Chat (click to close)</div>
  <div id="chatMessages"></div>
  <div id="chatInputBar">
    <input id="chatInput" placeholder="Type message...">
    <button id="chatSend">Send</button>
  </div>
</div>

<div id="bottomBar">
  <input type="text" id="msgInput" placeholder="Type message...">
  <button id="sendBtn">Send</button>
  <button id="muteBtn">Mic: ON</button>
  <button id="deafenBtn">Hear: ON</button>
  <button id="screenBtn">Screen Share</button>
  <button id="chatToggle">Chat</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const room = "${req.params.id}";
let name = "";

const videoGrid = document.getElementById("videoGrid");
const chatOverlay = document.getElementById("chatOverlay");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const msgInput = document.getElementById("msgInput");

let localStream;
let muted=false;
let deafened=false;
const peers={};
const participantElements={};

// ===== PARTICIPANTS =====
function addParticipant(id, pname, mstream, isScreen=false){
  let div = participantElements[id];
  if(!div){
    div=document.createElement("div");
    div.className="participant"; div.id="p_"+id;
    const video=document.createElement("video"); video.autoplay=true; video.playsInline=true;
    if(id==="local" && !isScreen) video.muted=true;
    div.appendChild(video);
    const label=document.createElement("div"); label.className="name-label"; label.textContent=pname;
    div.appendChild(label);
    // screen shares on top
    if(isScreen){
      videoGrid.insertBefore(div, videoGrid.firstChild);
    } else videoGrid.appendChild(div);
    participantElements[id]=div;
  }
  div.querySelector("video").srcObject = mstream;
}
function removeParticipant(id){
  const div = participantElements[id];
  if(div){ div.remove(); delete participantElements[id]; }
}

// ===== CHAT =====
function addMsg(html){ const d=document.createElement("div"); d.innerHTML=html;
  chatMessages.appendChild(d); chatMessages.scrollTop=chatMessages.scrollHeight;
}
function sendMsg(){ if(!msgInput.value.trim()) return; socket.emit("msg",msgInput.value); addMsg("<b>You:</b> "+msgInput.value); msgInput.value="";}
msgInput.onkeydown=e=>{if(e.key==="Enter") sendMsg();};
document.getElementById("sendBtn").onclick=sendMsg;
document.getElementById("chatToggle").onclick=()=>{chatOverlay.style.display="flex";};
document.getElementById("chatHeader").onclick=()=>{chatOverlay.style.display="none";};
document.getElementById("chatSend").onclick=()=>{
  if(!chatInput.value.trim()) return;
  socket.emit("msg",chatInput.value);
  addMsg("<b>You:</b> "+chatInput.value); chatInput.value="";
};

// ===== MEDIA =====
navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(s=>{
  localStream=s;
  addParticipant("local","You",localStream);
  socket.emit("join",{room,name});
  initMeter();
}).catch(()=>alert("Mic/Camera denied"));

// MUTE / DEAFEN
document.getElementById("muteBtn").onclick=()=>{
  muted=!muted; localStream.getAudioTracks().forEach(t=>t.enabled=!muted);
  document.getElementById("muteBtn").textContent = muted?"Mic: OFF":"Mic: ON";
};
document.getElementById("deafenBtn").onclick=()=>{
  deafened=!deafened;
  Object.values(participantElements).forEach(p=>p.querySelector("video").muted=deafened);
  document.getElementById("deafenBtn").textContent = deafened?"Hear: OFF":"Hear: ON";
};

// SCREEN SHARE
document.getElementById("screenBtn").onclick=async ()=>{
  try{
    const sstream=await navigator.mediaDevices.getDisplayMedia({video:true});
    addParticipant("screen_"+socket.id,name+" (Screen)",sstream,true);
    // add track to local stream
    sstream.getTracks().forEach(track=>{
      for(const pid in peers) peers[pid].addTrack(track, sstream);
    });
    // renegotiate
    for(const pid in peers){
      const pc=peers[pid];
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer",{to:pid,o:offer});
    }
    sstream.getVideoTracks()[0].onended=()=>{ 
      socket.emit("stopScreen"); removeParticipant("screen_"+socket.id);
    };
  }catch(e){console.warn(e);}
};

// ===== PEERS =====
function createPeer(id){
  const pc=new RTCPeerConnection({
    iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"turn:numb.viagenie.ca",username:"webrtc",credential:"webrtc"} // TURN for strict NAT
    ]
  });
  peers[id]=pc;
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>addParticipant(id,id,e.streams[0]);
  pc.onicecandidate=e=>{ if(e.candidate) socket.emit("ice",{to:id,c:e.candidate}); };
  return pc;
}

// ===== SOCKET EVENTS =====
socket.on("new",async id=>{
  const pc=createPeer(id);
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  socket.emit("offer",{to:id,o:offer});
});

socket.on("offer",async d=>{
  const pc=createPeer(d.from); await pc.setRemoteDescription(d.o);
  const answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
  socket.emit("answer",{to:d.from,a:answer});
});

socket.on("answer",d=>peers[d.from].setRemoteDescription(d.a));
socket.on("ice",d=>peers[d.from]?.addIceCandidate(d.c));

socket.on("msg",m=>addMsg("<b>"+m.name+":</b> "+m.text));

socket.on("users",list=>{
  list.forEach(u=>{
    if(u.id!==socket.id) addParticipant(u.id,u.name,participantElements[u.id]?.querySelector("video")?.srcObject || null);
  });
});
socket.on("remove",id=>removeParticipant(id));

// ===== MIC METER =====
function initMeter(){
  const ctx=new AudioContext();
  const analyser=ctx.createAnalyser(); analyser.fftSize=256;
  const src=ctx.createMediaStreamSource(localStream);
  src.connect(analyser);
  const data=new Uint8Array(analyser.frequencyBinCount);
  function tick(){ analyser.getByteFrequencyData(data);
    const avg=data.reduce((a,b)=>a+b,0)/data.length;
    const glow=Math.min(20,avg/4);
    document.getElementById("muteBtn").style.boxShadow="0 0 "+glow+"px lime";
    requestAnimationFrame(tick);
  }
  document.body.onclick=()=>ctx.resume();
  tick();
}
</script>
</body>
</html>`);
});

// ===== SERVER SOCKET =====
io.on("connection",s=>{
  s.on("join",({room,name})=>{
    s.join(room);
    if(!rooms[room]) rooms[room]={admin:s.id,users:[]};

    // Assign Guest names if blank
    if(!name || !name.trim()){
      const guestCount = rooms[room].users.filter(u=>u.name.startsWith("Guest")).length + 1;
      name = "Guest "+guestCount;
    }

    rooms[room].users.push({id:s.id,name,admin:s.id===rooms[room].admin});
    s.to(room).emit("new",s.id);
    io.to(room).emit("users",rooms[room].users);
  });

  s.on("msg",text=>{
    const room=[...s.rooms].find(r=>r!==s.id); if(!room) return;
    const user=rooms[room].users.find(u=>u.id===s.id);
    io.to(room).emit("msg",{name:user.name,text});
  });

  s.on("offer",d=>s.to(d.to).emit("offer",{from:s.id,o:d.o}));
  s.on("answer",d=>s.to(d.to).emit("answer",{from:s.id,a:d.a}));
  s.on("ice",d=>s.to(d.to).emit("ice",{from:s.id,c:d.c}));

  s.on("disconnect",()=>{
    for(const r in rooms){
      rooms[r].users=rooms[r].users.filter(u=>u.id!==s.id);
      io.to(r).emit("users",rooms[r].users);
      io.to(r).emit("remove",s.id);
      if(!rooms[r].users.length) delete rooms[r];
    }
  });
});

// Listen on Render
server.listen(process.env.PORT || 3000,"0.0.0.0",()=>console.log("✅ Render call server live"));
