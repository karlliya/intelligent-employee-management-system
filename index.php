<?php
$host = gethostbyname(gethostname());
$frontendLocal = 'http://localhost:3000';
$backendLocal = 'http://localhost:5000/api/health';
$frontendLan = "http://{$host}:3000";
$backendLan = "http://{$host}:5000/api/health";

function is_port_open($host, $port) {
    $connection = @fsockopen($host, $port, $errno, $errstr, 0.4);
    if ($connection) {
        fclose($connection);
        return true;
    }
    return false;
}

$frontendRunning = is_port_open('127.0.0.1', 3000);
$backendRunning = is_port_open('127.0.0.1', 5000);
$mysqlRunning = is_port_open('127.0.0.1', 3306);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SecureHAM IEMS Launcher</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --card: rgba(255,255,255,.82);
      --text: #1d1d1f;
      --muted: #6e6e73;
      --border: rgba(0,0,0,.08);
      --blue: #0071e3;
      --green: #34c759;
      --red: #ff3b30;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 28px;
      background:
        radial-gradient(circle at 20% 10%, rgba(0,113,227,.12), transparent 28%),
        radial-gradient(circle at 80% 0%, rgba(175,82,222,.1), transparent 26%),
        var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .wrap { width: min(980px, 100%); }
    .hero {
      border: 1px solid var(--border);
      border-radius: 34px;
      background: var(--card);
      padding: clamp(26px, 5vw, 54px);
      box-shadow: 0 24px 70px rgba(0,0,0,.08);
      backdrop-filter: blur(24px) saturate(1.5);
    }
    h1 {
      margin: 0;
      max-width: 760px;
      font-size: clamp(42px, 7vw, 78px);
      line-height: .98;
      letter-spacing: -.055em;
    }
    p { color: var(--muted); font-size: 18px; line-height: 1.55; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-top: 28px; }
    .card {
      border: 1px solid var(--border);
      border-radius: 24px;
      background: rgba(255,255,255,.72);
      padding: 18px;
    }
    .status { display: flex; align-items: center; gap: 10px; font-weight: 700; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); }
    .on { background: var(--green); }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
    a, .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      border-radius: 999px;
      padding: 0 20px;
      text-decoration: none;
      font-weight: 700;
      border: 1px solid var(--border);
    }
    .primary { background: var(--blue); color: white; border-color: transparent; }
    .secondary { background: white; color: var(--text); }
    code {
      display: inline-block;
      border-radius: 10px;
      background: rgba(0,0,0,.05);
      padding: 3px 8px;
      color: var(--text);
    }
    .note { margin-top: 26px; font-size: 14px; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <p>SecureHAM IEMS</p>
      <h1>Open your HR system the easy way.</h1>
      <p>This PHP launcher keeps the project simple to understand. Run <code>START_IEMS_LIVE.bat</code>, then open the dashboard from this PC or any device on the same WiFi.</p>

      <div class="grid">
        <div class="card"><div class="status"><span class="dot <?= $frontendRunning ? 'on' : '' ?>"></span>Frontend <?= $frontendRunning ? 'Running' : 'Offline' ?></div><p><?= htmlspecialchars($frontendLocal) ?></p></div>
        <div class="card"><div class="status"><span class="dot <?= $backendRunning ? 'on' : '' ?>"></span>Backend <?= $backendRunning ? 'Running' : 'Offline' ?></div><p><?= htmlspecialchars($backendLocal) ?></p></div>
        <div class="card"><div class="status"><span class="dot <?= $mysqlRunning ? 'on' : '' ?>"></span>Database <?= $mysqlRunning ? 'Running' : 'Offline' ?></div><p>MySQL port 3306</p></div>
      </div>

      <div class="actions">
        <a class="primary" href="<?= htmlspecialchars($frontendLocal) ?>">Open Dashboard</a>
        <a class="secondary" href="<?= htmlspecialchars($frontendLan) ?>">Open WiFi Link</a>
        <a class="secondary" href="<?= htmlspecialchars($backendLocal) ?>">Check API</a>
      </div>

      <p class="note">Same WiFi link: <code><?= htmlspecialchars($frontendLan) ?></code>. If phone cannot open it, allow Node.js through Windows Firewall on Private Network.</p>
    </section>
  </main>
</body>
</html>
