<?php
/**
 * Optional: upload to Hostinger web hosting (public_html/mail-relay.php).
 * DigitalOcean cannot reach smtp.hostinger.com; Hostinger hosting can.
 *
 * On the DO app .env:
 *   MAIL_WEBHOOK_URL=https://YOUR-HOSTINGER-SITE/mail-relay.php
 *   MAIL_WEBHOOK_SECRET=pick-a-long-random-string
 *
 * Set the same secret below.
 */
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$SECRET = "CHANGE_ME_TO_A_LONG_RANDOM_STRING";

$hdr = $_SERVER["HTTP_X_MAIL_RELAY_SECRET"] ?? "";
if (!hash_equals($SECRET, $hdr)) {
  http_response_code(401);
  echo json_encode(["error" => "unauthorized"]);
  exit;
}

$raw = file_get_contents("php://input");
$data = json_decode($raw, true);
if (!$data || empty($data["to"]) || empty($data["subject"])) {
  http_response_code(400);
  echo json_encode(["error" => "bad_request"]);
  exit;
}

$smtpHost = "smtp.hostinger.com";
$smtpPort = 465;
$smtpUser = "noreply@playjackpotjungle.com";
$smtpPass = "PUT_SAME_PASSWORD_AS_DOCKER_ENV";
$from = $data["from"] ?? $smtpUser;
$fromName = $data["fromName"] ?? "Jackpot Jungle";

// Prefer PHPMailer if available; else use raw SMTP over SSL.
function smtp_send_ssl($host, $port, $user, $pass, $from, $fromName, $to, $subject, $body) {
  $fp = stream_socket_client("ssl://{$host}:{$port}", $errno, $errstr, 20);
  if (!$fp) throw new Exception("connect: $errstr");
  $read = function () use ($fp) { return fgets($fp, 515); };
  $write = function ($s) use ($fp) { fwrite($fp, $s . "\r\n"); };
  $read();
  $write("EHLO localhost");
  while ($line = $read()) { if (isset($line[3]) && $line[3] === " ") break; }
  $write("AUTH LOGIN");
  $read();
  $write(base64_encode($user));
  $read();
  $write(base64_encode($pass));
  $auth = $read();
  if (strpos($auth, "235") === false) throw new Exception("auth failed: $auth");
  $write("MAIL FROM:<{$from}>");
  $read();
  $write("RCPT TO:<{$to}>");
  $read();
  $write("DATA");
  $read();
  $headers = "From: {$fromName} <{$from}>\r\n";
  $headers .= "To: <{$to}>\r\n";
  $headers .= "Subject: {$subject}\r\n";
  $headers .= "MIME-Version: 1.0\r\n";
  $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
  $write($headers . "\r\n" . $body . "\r\n.");
  $ok = $read();
  $write("QUIT");
  fclose($fp);
  if (strpos($ok, "250") === false) throw new Exception("send failed: $ok");
}

try {
  $body = $data["text"] ?? strip_tags($data["html"] ?? "");
  smtp_send_ssl(
    $smtpHost,
    $smtpPort,
    $smtpUser,
    $smtpPass,
    $from,
    $fromName,
    $data["to"],
    $data["subject"],
    $body
  );
  echo json_encode(["ok" => true]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(["error" => $e->getMessage()]);
}
