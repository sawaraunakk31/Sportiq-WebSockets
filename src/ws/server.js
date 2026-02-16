import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        client.send(JSON.stringify(payload));
    }
}

export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

    // Handle WebSocket upgrade at HTTP level (before handshake)
    server.on('upgrade', async (req, socket, head) => {
        // Only handle /ws path
        if (req.url !== '/ws') {
            socket.destroy();
            return;
        }

        // Arcjet protection before WebSocket handshake
        if (wsArcjet) {
            try {
                const decision = await wsArcjet.protect(req);
                if (decision.isDenied()) {
                    // Determine HTTP status code based on denial reason
                    let statusCode = 403;
                    let statusMessage = 'Forbidden';

                    if (decision.reason.isRateLimit()) {
                        statusCode = 429;
                        statusMessage = 'Too Many Requests';
                    } else if (decision.reason.isBot()) {
                        statusCode = 403;
                        statusMessage = 'Bots Not Allowed';
                    }

                    // Write HTTP error response before handshake
                    socket.write(
                        `HTTP/1.1 ${statusCode} ${statusMessage}\r\n` +
                        `Content-Type: application/json\r\n` +
                        `Connection: close\r\n` +
                        `\r\n` +
                        JSON.stringify({ error: statusMessage })
                    );
                    socket.destroy();
                    return;
                }
            } catch (e) {
                console.error('Arcjet WebSocket Error', e);
                socket.write(
                    'HTTP/1.1 503 Service Unavailable\r\n' +
                    'Content-Type: application/json\r\n' +
                    'Connection: close\r\n' +
                    '\r\n' +
                    JSON.stringify({ error: 'Service Unavailable' })
                );
                socket.destroy();
                return;
            }
        }

        // If protection passed, complete the WebSocket handshake
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    // Connection handler (after successful handshake and Arcjet validation)
    wss.on('connection', (socket) => {
        socket.isAlive = true;
        socket.on('pong', () => socket.isAlive = true);

        sendJson(socket, { type: 'welcome' });
        socket.on('error', console.error);
    });

    // Heartbeat interval
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        })
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: 'match_created', data: match });
    }

    return {
        broadcastMatchCreated
    }
}