import { WebSocketServer } from "ws";
import http from "http";

console.log("web_server started");

const port = 22006;
const avatarCache = new Map();

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/avatar") {
    const steamId = url.searchParams.get("steamid");
    if (!steamId || steamId === "0" || steamId.length < 5) {
      res.statusCode = 404;
      return res.end("Missing or invalid steamid");
    }

    if (avatarCache.has(steamId)) {
      res.writeHead(302, { Location: avatarCache.get(steamId) });
      return res.end();
    }

    try {
      const response = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`);
      if (response.ok) {
        const xmlText = await response.text();
        const match =
          xmlText.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/) ||
          xmlText.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/) ||
          xmlText.match(/<avatarIcon><!\[CDATA\[(.*?)\]\]><\/avatarIcon>/);

        if (match && match[1]) {
          avatarCache.set(steamId, match[1]);
          res.writeHead(302, { Location: match[1] });
          return res.end();
        }
      }
    } catch (err) {
      console.error(`Error fetching avatar for ${steamId}:`, err.message);
    }

    res.statusCode = 404;
    return res.end("Avatar not found");
  }

  res.statusCode = 404;
  res.end("Not Found");
});

const web_socket_server = new WebSocketServer({
  server: server,
  path: "/cs2_webradar",
});

web_socket_server.on("connection", (web_socket, request) => {
  const client_address = request.socket.remoteAddress.replace("::ffff:", "");
  console.info(`${client_address} connected`);

  web_socket.on("message", (message) => {
    web_socket_server.clients.forEach((client) => {
      client.send(message);
    });
  });

  web_socket.on("close", () => {
    console.info(`${client_address} disconnected \n`);
  });

  web_socket.on("error", (error) => {
    console.error(error);
  });
});

server.listen(port);
console.info(`listening on port '${port}'`);