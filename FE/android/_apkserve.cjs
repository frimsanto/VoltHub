// Minimal LAN static server for the debug APK. No deps. Serves with the
// Android package mime so phone browsers download/install it directly.
const http = require("http");
const fs = require("fs");
const path = require("path");

const dir = process.argv[2] || ".";
const PORT = 8000;

http
  .createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(dir, rel === "/" ? "app-debug.apk" : rel);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": st.size,
        "Content-Disposition": 'attachment; filename="app-debug.apk"',
      });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, "0.0.0.0", () => console.log(`APK server on 0.0.0.0:${PORT} serving ${dir}`));
