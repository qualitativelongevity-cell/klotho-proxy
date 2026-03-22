const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const SHEET_URL = (process.env.SHEET_URL || "").trim();

const rateLimitMap = {};
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 60 * 1000;

const blockedPatterns = [
  /\b(hack|exploit|injection|attack|malware)\b/i,
  /\b(suicide|self.harm|hurt myself)\b/i,
  /\b(credit card|bank account|password)\b/i
];

function isRateLimited(ip) {
  var now = Date.now();
  if (!rateLimitMap[ip]) { rateLimitMap[ip] = { count: 1, start: now }; return false; }
  if (now - rateLimitMap[ip].start > RATE_WINDOW) { rateLimitMap[ip] = { count: 1, start: now }; return false; }
  rateLimitMap[ip].count++;
  return rateLimitMap[ip].count > RATE_LIMIT;
}

function isHarmful(message) {
  return blockedPatterns.some(function(p) { return p.test(message); });
}

function logToSheet(userMessage, klothoReply) {
  if (https://script.google.com/macros/s/AKfycby4Aq5lJJAnfKbrrEDqLHdlqMF1Z0-UE55HTANP2-sDCsPyZoLsI1BMV7LxzB8Mcia48Q/exec) return;
  try {
    var payload = JSON.stringify({ userMessage: userMessage, klothoReply: klothoReply });
    var urlObj = new URL(SHEET_URL);
    var options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    };
    var req = https.request(options, function(res) {
      res.on("data", function() {});
      res.on("end", function() {});
    });
    req.on("error", function() {});
    req.write(payload);
    req.end();
  } catch(e) {}
}

const server = http.createServer(function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.method === "GET" && req.url === "/") {
    var fs = require("fs");
    var path = require("path");
    var filePath = path.join(__dirname, "public", "index.html");
    fs.readFile(filePath, function(err, data) {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "Klotho proxy is running" }));
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

    if (isRateLimited(ip)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many requests. Please try again later." }));
      return;
    }

    var body = "";
    req.on("data", function(chunk) { body += chunk.toString(); });
    req.on("end", function() {
      try {
        var parsed = JSON.parse(body);
        var message = parsed.message || "";
        var systemPrompt = parsed.systemPrompt || "You are Klotho, a friendly wellness coach.";

        if (isHarmful(message)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ reply: "I am here to support your wellness journey. For urgent concerns please contact a healthcare professional or emergency services directly." }));
          return;
        }

        var payload = JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: message }]
        });

        var options = {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Length": Buffer.byteLength(payload)
          }
        };

        var apiReq = https.request(options, function(apiRes) {
          var data = "";
          apiRes.on("data", function(chunk) { data += chunk.toString(); });
          apiRes.on("end", function() {
            try {
              var result = JSON.parse(data);
              var reply = (result.content || [])
                .filter(function(b) { return b.type === "text"; })
                .map(function(b) { return b.text; })
                .join("");
              logToSheet(message, reply);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ reply: reply || "No response received." }));
            } catch(e) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Parse error: " + e.message }));
            }
          });
        });

        apiReq.on("error", function(e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request error: " + e.message }));
        });

        apiReq.write(payload);
        apiReq.end();

      } catch(e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request: " + e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.on("error", function(e) { console.error("Server error:", e.message); });
server.listen(PORT, function() { console.log("Klotho secure proxy running on port " + PORT); });
