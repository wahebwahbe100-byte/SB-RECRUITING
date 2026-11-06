<?php
/**
 * SB Recruiting – serverseitiger Versand des Kontaktformulars.
 * WICHTIG: Empfänger und Absender unten auf echte Adressen setzen.
 * Der Webserver benötigt PHP 8+ und eine funktionierende mail()-Konfiguration.
 */
declare(strict_types=1);

// ===== HIER KONFIGURIEREN =====
$recipientEmail = ''; // Beispiel: 'kontakt@meine-domain.de' – E-Mail, die Anfragen EMPFÄNGT
$senderEmail    = ''; // Beispiel: 'formular@meine-domain.de' – Absender der E-Mail (eigene Domain)
// =============================

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, bool $success, string $message): void {
    http_response_code($status);
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    if (str_contains($accept, 'application/json')) {
        echo json_encode(['success' => $success, 'message' => $message], JSON_UNESCAPED_UNICODE);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        $safe = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        echo '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kontakt</title>';
        echo '<main style="font:16px system-ui;max-width:600px;margin:12vh auto;padding:24px"><p>' . $safe . '</p><p><a href="kontakt.html">Zurück zum Kontaktformular</a></p></main></html>';
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, false, 'Nur POST-Anfragen sind zulässig.');
}

// Zu große POST-Anfragen können von PHP vor dem Einlesen verworfen werden.
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 23 * 1024 * 1024) {
    respond(413, false, 'Die Dateien sind insgesamt zu groß.');
}

if (!empty($_POST['website'])) {
    // Honeypot: Für Bots ohne E-Mail-Versand quittieren.
    respond(200, true, 'Ihre Anfrage wurde entgegengenommen.');
}

$recipientEmail = trim($recipientEmail);
$senderEmail = trim($senderEmail);
if (!filter_var($recipientEmail, FILTER_VALIDATE_EMAIL) || !filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
    error_log('SB Recruiting: Empfänger- bzw. Absender-E-Mail in send-bewerbung.php nicht konfiguriert.');
    respond(503, false, 'Das Kontaktformular ist noch nicht für den E-Mail-Versand eingerichtet. Bitte kontaktieren Sie uns direkt.');
}

$name = trim((string)($_POST['name'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$role = trim((string)($_POST['role'] ?? ''));
$message = trim((string)($_POST['message'] ?? ''));
$roleLabels = [
    'company' => 'Unternehmen',
    'candidate' => 'Fachkraft / Bewerber',
    'training' => 'Ausbildungsinteressiert',
    'other' => 'Sonstiges',
];

if ($name === '' || strlen($name) > 240 || preg_match('/[\r\n]/', $name) ||
    !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160 || preg_match('/[\r\n]/', $email) ||
    !array_key_exists($role, $roleLabels) ||
    strlen($message) < 10 || strlen($message) > 15000) {
    respond(422, false, 'Bitte füllen Sie alle Pflichtfelder korrekt aus.');
}

$applicationStarted = ($_POST['application_started'] ?? '0') === '1';
if ($applicationStarted && !in_array($role, ['candidate', 'training'], true)) {
    respond(422, false, 'Die Bewerbung kann nur bei Bewerber oder Ausbildung gestartet werden.');
}
if ($applicationStarted && ($_POST['privacy_ack'] ?? '') !== 'yes') {
    respond(422, false, 'Bitte bestätigen Sie die Datenschutzhinweise zur Bewerbung.');
}

/** Formatiert eine normalisierte Datei aus $_FILES. */
function collectUploaded(string $key, bool $multiple): array {
    if (!isset($_FILES[$key])) return [];
    $item = $_FILES[$key];
    if (!is_array($item) || !isset($item['error'])) return [];
    if (!$multiple) {
        if (is_array($item['error'])) respond(422, false, 'Ungültiger Datei-Upload.');
        return [$item];
    }
    if (!is_array($item['error'])) respond(422, false, 'Ungültiger Anhang-Upload.');
    $files = [];
    foreach ($item['error'] as $i => $err) {
        $files[] = [
            'name' => $item['name'][$i] ?? '',
            'type' => $item['type'][$i] ?? '',
            'tmp_name' => $item['tmp_name'][$i] ?? '',
            'error' => $err,
            'size' => $item['size'][$i] ?? 0,
        ];
    }
    return $files;
}

$cvEntries = collectUploaded('cv', false);
$cvEntries = array_values(array_filter($cvEntries, fn($f) => ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE));
$extraEntries = collectUploaded('attachments', true);
$extraEntries = array_values(array_filter($extraEntries, fn($f) => ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE));
if (count($cvEntries) > 1 || count($extraEntries) > 4 || (count($cvEntries) + count($extraEntries)) > 5) {
    respond(422, false, 'Es sind höchstens ein Lebenslauf und vier Anhänge erlaubt.');
}
if ($applicationStarted && count($cvEntries) !== 1) {
    respond(422, false, 'Bitte fügen Sie Ihren Lebenslauf hinzu.');
}
if (!$applicationStarted && (count($cvEntries) > 0 || count($extraEntries) > 0)) {
    respond(422, false, 'Bitte starten Sie die Bewerbung, bevor Sie Anhänge hochladen.');
}

$allowedExt = [
    'pdf' => ['application/pdf'],
    'doc' => ['application/msword', 'application/octet-stream', 'application/x-ole-storage'],
    'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
    'jpg' => ['image/jpeg'],
    'jpeg' => ['image/jpeg'],
    'png' => ['image/png'],
];
$attachments = [];
$totalBytes = 0;
foreach (array_merge($cvEntries, $extraEntries) as $i => $file) {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        respond(422, false, 'Ein Datei-Upload ist fehlgeschlagen.');
    }
    $size = (int)($file['size'] ?? 0);
    if ($size < 1 || $size > 5 * 1024 * 1024) {
        respond(422, false, 'Jede Datei muss kleiner als 5 MB sein.');
    }
    $totalBytes += $size;
    if ($totalBytes > 15 * 1024 * 1024) {
        respond(422, false, 'Die Anhänge dürfen zusammen höchstens 15 MB groß sein.');
    }
    $name = basename(str_replace('\\', '/', (string)($file['name'] ?? '')));
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!isset($allowedExt[$ext]) || ($i === 0 && count($cvEntries) > 0 && !in_array($ext, ['pdf', 'doc', 'docx'], true))) {
        respond(422, false, 'Nicht erlaubtes Dateiformat.');
    }
    $tmp = (string)($file['tmp_name'] ?? '');
    if (!is_uploaded_file($tmp)) {
        respond(422, false, 'Ungültiger Datei-Upload.');
    }
    $mime = function_exists('mime_content_type') ? (mime_content_type($tmp) ?: 'application/octet-stream') : 'application/octet-stream';
    if (!in_array($mime, $allowedExt[$ext], true)) {
        respond(422, false, 'Die Datei entspricht nicht dem angegebenen Format.');
    }
    $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    $safeName = substr((string)$safeName, 0, 100);
    if ($safeName === '' || $safeName === '.' || $safeName === '..') $safeName = 'anhang.' . $ext;
    $content = file_get_contents($tmp);
    if ($content === false) respond(500, false, 'Dateianhang konnte nicht gelesen werden.');
    $attachments[] = ['name' => $safeName, 'mime' => $mime, 'data' => $content];
}

// Aus dem Formular kommt NIE eine Absenderadresse in den From-Header.
// Die Nutzer-E-Mail wird ausschließlich als sichere Reply-To-Adresse gesetzt.
$plain = "Neue Anfrage über SB Recruiting\n\n";
$plain .= "Name: {$name}\nE-Mail: {$email}\nAnliegen: {$roleLabels[$role]}\n";
$plain .= "Bewerbungsunterlagen: " . ($applicationStarted ? 'Ja' : 'Nein') . "\n\nNachricht:\n{$message}\n";

try {
    $boundary = 'sbrec_' . bin2hex(random_bytes(18));
} catch (Throwable $e) {
    respond(500, false, 'Interner Serverfehler.');
}
$body = "--{$boundary}\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
$body .= chunk_split(base64_encode($plain), 76, "\r\n") . "\r\n";
foreach ($attachments as $file) {
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Type: {$file['mime']}; name=\"{$file['name']}\"\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n";
    $body .= "Content-Disposition: attachment; filename=\"{$file['name']}\"\r\n\r\n";
    $body .= chunk_split(base64_encode($file['data']), 76, "\r\n") . "\r\n";
}
$body .= "--{$boundary}--\r\n";
$subject = '=?UTF-8?B?' . base64_encode('Neue Anfrage – SB Recruiting') . '?=';
$headers = [
    'From' => "SB Recruiting Formular <{$senderEmail}>",
    'Reply-To' => $email,
    'MIME-Version' => '1.0',
    'Content-Type' => "multipart/mixed; boundary=\"{$boundary}\"",
    'X-Mailer' => 'SB Recruiting Kontaktformular',
];

// mail() meldet nur, ob der lokale Maildienst die Nachricht angenommen hat.
// Die tatsächliche Zustellung ins Postfach hängt vom Mailserver (SPF/DKIM) ab.
$accepted = @mail($recipientEmail, $subject, $body, $headers);
if (!$accepted) {
    error_log('SB Recruiting: mail() fehlgeschlagen. Prüfen Sie Mailserver/SMTP und Server-Logs.');
    respond(503, false, 'Der E-Mail-Versand hat nicht funktioniert. Bitte versuchen Sie es später erneut.');
}
respond(200, true, 'Ihre Anfrage wurde erfolgreich an den Mailserver übergeben.');
