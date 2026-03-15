const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();

const server = http.createServer(function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "Klotho proxy is running" }));
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    var body = "";
    req.on("data", function(chunk) { body += chunk.toString(); });
    req.on("end", function() {
      try {
        var parsed = JSON.parse(body);
        var message = parsed.message || "";
        var systemPrompt = parsed.systemPrompt || "You are Klotho, a friendly wellness coach.";

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

server.on("error", function(e) {
  console.error("Server error:", e.message);
});

server.listen(PORT, function() {
  console.log("Klotho proxy running on port " + PORT);
});
