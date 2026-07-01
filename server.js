r · JS
const http = require("http");
const https = require("follow-redirects").https;
const fs = require("fs");
const path = require("path");
 
const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const SHEET_URL = (process.env.SHEET_URL || "").trim();
 
const rateLimitMap = {};
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 60 * 1000;
 
// Cyber/security and sensitive-data patterns (unrelated to personal safety)
const securityPatterns = [
  /\b(hack|exploit|injection|malware)\b/i,
  /\b(credit card|bank account|password)\b/i
];
 
// Self-harm / suicidal ideation — Greek and English
const selfHarmPatterns = [
  /\b(suicide|suicidal|self.harm|hurt myself|kill myself|end my life|want to die|don.?t want to (live|be here))\b/i,
  /(αυτοκτον\w*|να\s+σκοτωθώ|να\s+βλάψω\s+τον\s+εαυτό\s+μου|θέλω\s+να\s+πεθάνω|δεν\s+αντέχω\s+άλλο|να\s+τελειώσω\s+τη\s+ζωή\s+μου|αυτοτραυματισμ\w*)/i
];
 
// Threats of harm toward another person — Greek and English
const threatToOthersPatterns = [
  /\b(kill|murder|hurt|harm|attack|stab|shoot)\b.{0,20}\b(him|her|them|someone|somebody|my \w+)\b/i,
  /\bhomicidal\b/i,
  /(φονικές\s+σκέψεις|σκέψεις\s+φονικές|θέλω\s+να\s+σκοτώσω|να\s+σκοτώσω\s+(τον|την|κάποιον)|να\s+βλάψω\s+κάποιον|να\s+τραυματίσω\s+κάποιον|να\s+επιτεθώ\s+σε)/i
];
 
const isGreekText = /[\u0370-\u03FF]/;
 
function isRateLimited(ip) {
  var now = Date.now();
  if (!rateLimitMap[ip]) { rateLimitMap[ip] = { count: 1, start: now }; return false; }
  if (now - rateLimitMap[ip].start > RATE_WINDOW) { rateLimitMap[ip] = { count: 1, start: now }; return false; }
  rateLimitMap[ip].count++;
  return rateLimitMap[ip].count > RATE_LIMIT;
}
 
function matchesAny(patterns, message) {
  return patterns.some(function(p) { return p.test(message); });
}
 
// Returns: "self_harm" | "threat_to_others" | "security" | null
function classifySafety(message) {
  if (matchesAny(selfHarmPatterns, message)) return "self_harm";
  if (matchesAny(threatToOthersPatterns, message)) return "threat_to_others";
  if (matchesAny(securityPatterns, message)) return "security";
  return null;
}
 
function crisisReply(category, message) {
  var greek = isGreekText.test(message);
  if (category === "self_harm") {
    return greek
      ? "Ό,τι κι αν νιώθετε αυτή τη στιγμή, δεν είστε μόνος/η και υπάρχει βοήθεια άμεσα διαθέσιμη. Παρακαλώ επικοινωνήστε τώρα με τη Γραμμή Παρέμβασης για την Αυτοκτονία 1018 (24 ώρες, δωρεάν και εμπιστευτικά) ή καλέστε το 112 σε περίπτωση άμεσου κινδύνου. Ως ψηφιακός βοηθός ευεξίας δεν μπορώ να παρέχω την υποστήριξη που χρειάζεστε αυτή τη στιγμή, αλλά υπάρχουν άνθρωποι εκπαιδευμένοι να σας ακούσουν τώρα."
      : "Whatever you're feeling right now, you don't have to go through it alone, and help is available immediately. Please reach out now to the Klimaka Suicide Prevention Line at 1018 (24/7, free and confidential) or call 112 if you're in immediate danger. As a digital wellness assistant, I'm not able to provide the support you need right now, but there are people trained to listen and help you through this.";
  }
  if (category === "threat_to_others") {
    return greek
      ? "Αυτό που περιγράφετε είναι πολύ σοβαρό. Αν εσείς ή κάποιος άλλος βρίσκεστε σε άμεσο κίνδυνο, καλέστε αμέσως το 112. Παρακαλώ επικοινωνήστε επίσης άμεσα με έναν επαγγελματία ψυχικής υγείας. Ως ψηφιακός βοηθός ευεξίας δεν μπορώ να διαχειριστώ αυτού του είδους την κατάσταση."
      : "What you're describing is serious. If you or someone else may be in immediate danger, please call 112 right away. Please also reach out to a mental health professional as soon as possible. As a digital wellness assistant, I'm not able to help with this kind of situation.";
  }
  return greek
    ? "Είμαι εδώ για να υποστηρίξω το ταξίδι ευεξίας σας. Για αυτό το θέμα, παρακαλώ επικοινωνήστε απευθείας με την ιατρό."
    : "I'm here to support your wellness journey and I'm not able to handle this type of request. For personalised support, please book a consultation with Dr. Petraki.";
}
 
function postToUrl(hostname, urlPath, payload, callback) {
  var options = {
    hostname: hostname,
    port: 443,
    path: urlPath,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };
  var req = https.request(options, function(res) {
    var data = "";
    res.on("data", function(chunk) { data += chunk; });
    res.on("end", function() {
      if (callback) callback(res.statusCode, res.headers, data);
    });
  });
  req.on("error", function(e) { console.error("Request error:", e.message); });
  req.write(payload);
  req.end();
}
 
function logToSheet(userMessage, klothoReply) {
  if (!SHEET_URL) return;
  try {
    var payload = JSON.stringify({ userMessage: userMessage, klothoReply: klothoReply });
    var urlObj = new URL(SHEET_URL);
    postToUrl(urlObj.hostname, urlObj.pathname + urlObj.search, payload, function(status, headers) {
      if (status === 301 || status === 302) {
        var location = headers.location;
        if (location) {
          var locUrl = new URL(location);
          postToUrl(locUrl.hostname, locUrl.pathname + locUrl.search, payload, function(status2) {
            console.log("Sheet response after redirect:", status2);
          });
        }
      } else {
        console.log("Sheet response:", status);
      }
    });
  } catch(e) {
    console.error("logToSheet error:", e.message);
  }
}
 
const server = http.createServer(function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
 
  if (req.method === "GET" && req.url === "/") {
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
 
        var safetyCategory = classifySafety(message);
        if (safetyCategory) {
          var reply = crisisReply(safetyCategory, message);
          // Always log flagged safety events, clearly marked, even though the AI never sees the raw message.
          var flagLabel = safetyCategory === "self_harm" ? "🚨 SAFETY FLAG - SELF-HARM/SUICIDE RISK"
            : safetyCategory === "threat_to_others" ? "🚨 SAFETY FLAG - THREAT TO ANOTHER PERSON"
            : "⚠️ Security/sensitive-data request blocked";
          logToSheet(flagLabel + " | " + message, reply);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ reply: reply }));
          return;
        }
 
        var payload = JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: message }]
        });
 
        var options = {
          hostname: "api.anthropic.com",
          port: 443,
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
 
              // Anthropic returned an error object (bad model id, bad key, rate limit, etc.)
              if (result.type === "error" || apiRes.statusCode >= 400) {
                console.error(
                  "Anthropic API error:",
                  apiRes.statusCode,
                  result.error ? (result.error.type + " - " + result.error.message) : data
                );
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                  reply: "I'm having trouble connecting right now. Please try again in a moment, or contact the practice directly if this continues."
                }));
                return;
              }
 
              var reply = (result.content || [])
                .filter(function(b) { return b.type === "text"; })
                .map(function(b) { return b.text; })
                .join("");
 
              if (!reply) {
                console.error("Empty reply from Anthropic. Raw response:", data);
              }
 
              logToSheet(message, reply);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ reply: reply || "I'm having trouble responding right now — please try again shortly." }));
            } catch(e) {
              console.error("Parse error. Raw response was:", data);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Parse error: " + e.message }));
            }
          });
        });
 
        apiReq.on("error", function(e) {
          console.error("API request error:", e.message);
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
 
  if (req.method === "POST" && req.url === "/lead") {
    var body = "";
    req.on("data", function(chunk) { body += chunk.toString(); });
    req.on("end", function() {
      try {
        var parsed = JSON.parse(body);
        var userMessage = "LEAD | Name: " + (parsed.name || "") + " | Email: " + (parsed.email || "");
        var klothoReply = parsed.conversation || "";
        logToSheet(userMessage, klothoReply);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch(e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
 
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});
 
server.on("error", function(e) { console.error("Server error:", e.message); });
server.listen(PORT, function() { console.log("Klotho secure proxy running on port " + PORT); });
