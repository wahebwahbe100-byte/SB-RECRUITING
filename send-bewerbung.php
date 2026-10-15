<?php
/**
 * SB Recruiting – Bewerbungen mit Lebenslauf und Anlagen.
 * Läuft auf einem PHP-Webhosting (z.B. IONOS), NICHT auf GitHub Pages.
 * Vor der Live-Schaltung: HTTPS aktivieren, PHP mail()-Zustellung mit
 * echten Bewerbungen testen, Datenschutzhinweise fertigstellen.
 * Eine existierende Absenderadresse der eigenen Domain verbessert Zustellung.
 */
declare(strict_types=1);

const SB_TO = 'sb.recruiting@hotmail.com';
const MAX_FILE = 5242880;     // 5 MiB je Datei
const MAX_TOTAL = 15728640;   // 15 MiB aller Dateien zusammen
const MAX_ATTACHMENTS = 4;

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');

$lang = (($_POST['lang'] ?? '') === 'fr') ? 'fr' : 'de';
function respond(int $status, string $de, string $fr, bool $ok = false): void {
    global $lang;
    http_response_code($status);
    echo json_encode(['success' => $ok, 'message' => $lang === 'fr' ? $fr : $de], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, 'Nur POST ist erlaubt.', 'Seule la méthode POST est autorisée.');
}
if (!empty($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 21 * 1024 * 1024) {
    respond(413, 'Upload ist zu groß (max. 15 MB Dokumente).', 'Envoi trop volumineux (15 Mo de documents maximum).');
}
if (empty($_POST) && !empty($_SERVER['CONTENT_LENGTH'])) {
    respond(413, 'Upload zu groß oder PHP-Uploadgrenze erreicht.', 'Envoi trop volumineux ou limite PHP dépassée.');
}
// Dateien mit Bewerbungen nie per HTTP im Klartext entgegennehmen.
$https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
$hostname = (string) ($_SERVER['SERVER_NAME'] ?? '');
$local = in_array($hostname, ['localhost', '127.0.0.1', '::1'], true);
if (!$https && !$local) {
    respond(403, 'Für Bewerbungen ist HTTPS erforderlich.', 'HTTPS est requis pour envoyer une candidature.');
}
if (!isset($_POST['website']) || !is_string($_POST['website']) || $_POST['website'] !== '') {
    // Invisible honeypot rejects unscripted spam; a missing field is acceptable for old browsers.
    if (!empty($_POST['website'])) respond(400, 'Ungültige Anfrage.', 'Demande non valide.');
}

$name = trim((string) ($_POST['name'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));
$role = (string) ($_POST['role'] ?? '');
$message = trim((string) ($_POST['message'] ?? ''));
if (preg_match('/[\r\n\x00-\x1F\x7F]/u', $name) || stringLength($name) < 2 || stringLength($name) > 120
    || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160
    || !in_array($role, ['candidate', 'training'], true)
    || stringLength($message) < 10 || stringLength($message) > 5000
    || ($_POST['privacy_ack'] ?? '') !== 'yes') {
    respond(422, 'Bitte prüfen Sie Ihre Angaben und bestätigen Sie die Datenschutzhinweise.', 'Vérifiez les informations et confirmez avoir lu la politique de confidentialité.');
}
if (!isset($_FILES['cv']) || !is_array($_FILES['cv'])) {
    respond(422, 'Bitte laden Sie Ihren Lebenslauf hoch.', 'Veuillez joindre votre CV.');
}

function stringLength(string $text): int {
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}
function fileError(int $code): void {
    if (in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        respond(413, 'Datei größer als die Servergrenze. Bitte eine kleinere Datei verwenden.', 'Le fichier dépasse la limite du serveur. Utilisez un fichier plus petit.');
    }
    respond(422, 'Datei konnte nicht gelesen werden. Bitte erneut auswählen.', "Impossible de lire le fichier. Veuillez le sélectionner à nouveau.");
}
function validateUpload(array $entry, bool $isCv): array {
    if (!isset($entry['error']) || !is_int($entry['error']) || $entry['error'] !== UPLOAD_ERR_OK) {
        fileError((int)($entry['error'] ?? UPLOAD_ERR_NO_FILE));
    }
    $size = $entry['size'] ?? 0;
    $tmp = $entry['tmp_name'] ?? '';
    $original = (string)($entry['name'] ?? '');
    if (!is_int($size) || $size < 1 || $size > MAX_FILE || !is_string($tmp) || !is_uploaded_file($tmp)) {
        respond(422, 'Ungültige oder zu große Datei (max. 5 MB).', 'Fichier non valide ou trop volumineux (5 Mo max.).');
    }
    $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $allowed = $isCv ? ['pdf','doc','docx'] : ['pdf','doc','docx','jpg','jpeg','png'];
    if (!in_array($extension, $allowed, true)) {
        respond(422, 'Unzulässiges Dateiformat.', 'Format de fichier non autorisé.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $type = $finfo->file($tmp);
    $prefix = file_get_contents($tmp, false, null, 0, 16);
    $valid = false;
    switch ($extension) {
        case 'pdf':
            $valid = ($type === 'application/pdf' && str_starts_with($prefix, '%PDF-'));
            break;
        case 'doc':
            $valid = in_array($type, ['application/msword','application/vnd.ms-office', 'application/CDFV2', 'application/x-ole-storage','application/octet-stream'], true)
                && str_starts_with($prefix, "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1");
            break;
        case 'docx':
            // ZIP-basierte Word-Dokumente von beliebigen ZIP-Archiven unterscheiden.
            if (str_starts_with($prefix, 'PK')) {
                if (class_exists('ZipArchive')) {
                    $zip = new ZipArchive();
                    if ($zip->open($tmp) === true) {
                        $valid = $zip->locateName('[Content_Types].xml') !== false
                            && $zip->locateName('word/document.xml') !== false;
                        $zip->close();
                    }
                } else {
                    // Fallback on PHP hosts without ext-zip: Word document ZIP member names.
                    $container = file_get_contents($tmp);
                    $valid = is_string($container) && str_contains($container, '[Content_Types].xml')
                        && str_contains($container, 'word/document.xml');
                }
            }
            break;
        case 'jpg': case 'jpeg':
            $valid = ($type === 'image/jpeg' && str_starts_with($prefix, "\xff\xd8\xff"));
            break;
        case 'png':
            $valid = ($type === 'image/png' && str_starts_with($prefix, "\x89PNG\r\n\x1a\n"));
            break;
    }
    if (!$valid) {
        respond(422, 'Die Datei entspricht nicht dem erlaubten Format oder ist beschädigt.', "Le fichier n'est pas du format attendu ou est endommagé.");
    }
    $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($original));
    $safeName = substr($safeName, 0, 110);
    if ($safeName === '' || $safeName[0] === '.') $safeName = 'Dokument.' . $extension;
    $mime = ['pdf'=>'application/pdf', 'doc'=>'application/msword', 'docx'=>'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'jpg'=>'image/jpeg', 'jpeg'=>'image/jpeg', 'png'=>'image/png'][$extension];
    return ['name' => $safeName, 'path' => $tmp, 'size' => $size, 'mime' => $mime];
}

$files = [validateUpload($_FILES['cv'], true)];
$additional = $_FILES['attachments'] ?? null;
if ($additional !== null) {
    if (!is_array($additional) || !isset($additional['name']) || !is_array($additional['name'])) {
        respond(422, 'Anhänge konnten nicht gelesen werden.', 'Pièces jointes non valides.');
    }
    if (count($additional['name']) > MAX_ATTACHMENTS) {
        respond(422, 'Maximal vier zusätzliche Anhänge sind möglich.', 'Quatre pièces jointes supplémentaires maximum.');
    }
    foreach ($additional['name'] as $i => $fileName) {
        $error = $additional['error'][$i] ?? UPLOAD_ERR_NO_FILE;
        if ($error === UPLOAD_ERR_NO_FILE) continue;
        $files[] = validateUpload([
            'name' => $fileName,
            'size' => $additional['size'][$i] ?? 0,
            'tmp_name' => $additional['tmp_name'][$i] ?? '',
            'error' => $error,
        ], false);
    }
}
$total = array_sum(array_column($files, 'size'));
if ($total > MAX_TOTAL) {
    respond(413, 'Alle Dokumente zusammen dürfen höchstens 15 MB groß sein.', 'Les documents ne doivent pas dépasser 15 Mo au total.');
}

$serverDomain = strtolower(preg_replace('/:\d+$/', '', $hostname));
if (!preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/', $serverDomain)) {
    respond(503, 'Der Mailversand ist auf diesem Server nicht konfiguriert.', "L'envoi d'e-mails n'est pas configuré sur ce serveur.");
}
// Die Absenderadresse muss auf dem echten Hosting existieren bzw. zulässig sein.
// Bei IONOS mit eigener Domain idealerweise ein Postfach website@ihredomain.de anlegen.
$fromAddress = 'website@' . preg_replace('/^www\./', '', $serverDomain);
$subject = 'Neue Bewerbung SB Recruiting – ' . ($role === 'training' ? 'Ausbildung' : 'Fachkraft');
$subjectHeader = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$plain = "Neue Bewerbung über die Website SB Recruiting\n\n";
$plain .= "Name: {$name}\nE-Mail: {$email}\nProfil: " . ($role === 'training' ? 'Ausbildungsinteressiert' : 'Fachkraft / Bewerber') . "\n\n";
$plain .= "Nachricht:\n{$message}\n\nAnhänge: " . count($files) . " Datei(en)\n";
$plain .= "Dokumente wurden in der Bewerbung hochgeladen.\n";
$boundary = 'sb_' . bin2hex(random_bytes(18));
$eol = "\r\n";
$body = '--' . $boundary . $eol
    . 'Content-Type: text/plain; charset=UTF-8' . $eol
    . 'Content-Transfer-Encoding: base64' . $eol . $eol
    . chunk_split(base64_encode($plain), 76, $eol) . $eol;
foreach ($files as $attachment) {
    $bytes = file_get_contents($attachment['path']);
    if ($bytes === false) respond(500, 'Dokument konnte nicht verarbeitet werden.', 'Impossible de traiter le document.');
    $body .= '--' . $boundary . $eol
        . 'Content-Type: ' . $attachment['mime'] . '; name="' . $attachment['name'] . '"' . $eol
        . 'Content-Disposition: attachment; filename="' . $attachment['name'] . '"' . $eol
        . 'Content-Transfer-Encoding: base64' . $eol . $eol
        . chunk_split(base64_encode($bytes), 76, $eol) . $eol;
}
$body .= '--' . $boundary . '--' . $eol;
$headers = [
    'From: SB Recruiting Website <' . $fromAddress . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
    'X-Content-Type-Options: nosniff',
];
$sent = @mail(SB_TO, $subjectHeader, $body, implode($eol, $headers), '-f' . $fromAddress);
if (!$sent) {
    error_log('SB Recruiting: PHP mail() could not queue an application.');
    respond(503, 'Der E-Mail-Versand ist derzeit nicht verfügbar. Es wurde keine Sendung bestätigt.', "L'envoi d'e-mails n'est pas disponible. Aucun envoi n'a été confirmé.");
}
respond(200, 'Ihre Bewerbung wurde vom Server für die Zustellung angenommen.', 'Votre candidature a été acceptée par le serveur pour acheminement.', true);
