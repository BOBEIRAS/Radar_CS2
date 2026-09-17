import { WebSocketServer } from "ws";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar config.json dinamicamente (raiz do projeto ou pastas superiores)
const loadConfig = () => {
  const possiblePaths = [
    path.resolve(__dirname, "../../config.json"),
    path.resolve(__dirname, "../config.json"),
    path.resolve(__dirname, "config.json"),
    path.resolve(process.cwd(), "config.json"),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        console.log(`[config] loaded from '${configPath}'`);
        return parsed;
      }
    } catch (e) {
      console.warn(`[config] error reading '${configPath}':`, e.message);
    }
  }

  return {};
};

const config = loadConfig();
const port = config?.server?.port || 22006;
const wsEndpoint = config?.server?.endpoint || "/cs2_webradar";
const staticRoot = path.resolve(__dirname, "../dist");
const avatarCache = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const serveStatic = (urlPath, res) => {
  if (!fs.existsSync(staticRoot)) {
    res.statusCode = 503;
    return res.end("Frontend build not found. Run npm run build before packaging.");
  }

  const requestedPath = decodeURIComponent(urlPath.split("?")[0]);
  const safePath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");

  let filePath = path.join(staticRoot, safePath || "index.html");
  const relativePath = path.relative(staticRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(staticRoot, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
};

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

  return serveStatic(url.pathname, res);
});

const web_socket_server = new WebSocketServer({
  server: server,
  path: wsEndpoint,
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
console.info(`serving frontend from '${staticRoot}'`);
