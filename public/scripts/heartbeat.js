function sendHeartbeat() {
fetch('/heartbeat', { method: 'POST' })
    .catch(err => console.error("Heartbeat error:", err));
}

// Enviamos un ping cada 10 segundos
setInterval(sendHeartbeat, 10 * 1000);
// Y uno inmediato al cargar
sendHeartbeat();