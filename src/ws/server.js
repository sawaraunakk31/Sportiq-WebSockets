import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const matchSubscribers = new Map();

function subscribe(matchId, socket) {
    if (!matchSubscribers.has(matchId)) {
        matchSubscribers.set(matchId, new Set());
    }
    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
    const subscribers = matchSubscribers.get(matchId);
    if (!subscribers) return;
    subscribers.delete(socket);
    if (subscribers.size === 0) {
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscription(socket) {
    for (const matchId of socket.subscriptions) {
        unsubscribe(matchId, socket);
    }
}


function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        client.send(JSON.stringify(payload));
    }
}

function broadcastToMatch(matchId, payload) {
    const subscribers = matchSubscribers.get(matchId);
    if (!subscribers || subscribers.size === 0) return;
    const message = JSON.stringify(payload);
    for (const client of subscribers) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

function handleMessage(socket, data) {
    let message;
    try {
        message = JSON.parse(data.toString());
    } catch (e) {
        sendJson(socket, { type: 'error', message: 'Invalid JSON' });
        return;
    }
    const matchId = Number(message?.matchId);
    if (message?.type === "subscribe" && Number.isInteger(matchId)) {
        subscribe(matchId, socket);
        socket.subscriptions.add(matchId);
        sendJson(socket, { type: 'subscribed', matchId });
        return;
    }
    if (message?.type === "unsubscribe" && Number.isInteger(matchId)) {
        unsubscribe(matchId, socket);
        socket.subscriptions.delete(matchId);
        sendJson(socket, { type: 'unsubscribed', matchId });
        return;
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

        socket.subscriptions = new Set();
        sendJson(socket, { type: 'welcome' });
        socket.on('message', (data) => handleMessage(socket, data));
        socket.on('error', () => socket.terminate());
        socket.on('close', () => cleanupSubscription(socket));
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
        broadcastToAll(wss, { type: 'match_created', data: match });
    }

    function broadcastCommentary(matchId, comment) {
        broadcastToMatch(matchId, { type: 'commentary', data: comment });
    }
    return {
        broadcastMatchCreated,
        broadcastCommentary
    }
}