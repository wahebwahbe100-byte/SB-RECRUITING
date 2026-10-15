(() => {
  'use strict';
  const fr = document.documentElement.lang === 'fr';
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const closeMenu = () => { nav?.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); menu?.setAttribute('aria-label', fr ? 'Ouvrir le menu' : 'Menü öffnen'); };
  menu?.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? (fr ? 'Fermer le menu' : 'Menü schließen') : (fr ? 'Ouvrir le menu' : 'Menü öffnen'));
  });
  nav?.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav?.classList.contains('open')) { closeMenu(); menu.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.site-header')) closeMenu(); });
  window.matchMedia('(min-width:861px)').addEventListener('change', e => { if(e.matches) closeMenu(); });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus = false) {
    tabs.forEach(t => { const active = t === tab; t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1; document.getElementById(t.getAttribute('aria-controls')).hidden = !active; });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', e => {
      const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[index], true);
    });
  });

  const form = document.querySelector('.contact-form');
  if (!form) return;
  const audience = new URLSearchParams(location.search).get('type');
  if (['company','candidate','training','other'].includes(audience)) form.elements.role.value = audience;
  const dialog = document.getElementById('request-dialog');
  const summary = document.getElementById('request-summary');
  const copyStatus = document.getElementById('copy-status');
  const uploadPanel = document.getElementById('application-documents');
  const applicationStart = document.getElementById('application-upload-start');
  const applicationStartButton = document.getElementById('start-application');
  const cv = document.getElementById('cv');
  const extras = document.getElementById('attachments');
  const privacy = document.getElementById('privacy-ack');
  const fileList = document.getElementById('upload-file-list');
  const applicationStatus = document.getElementById('application-status');
  const sendButton = form.querySelector('button[type="submit"]');
  const defaultButtonLabel = fr ? 'Préparer ma demande' : 'Anfrage vorbereiten';
  const applyButtonLabel = fr ? 'Envoyer ma candidature et mes documents' : 'Bewerbung mit Unterlagen senden';
  const maxFileSize = 5 * 1024 * 1024;
  const maxTotalSize = 15 * 1024 * 1024;
  const isApplicant = () => ['candidate', 'training'].includes(form.elements.role.value);
  let requestText = '';

  function setButtonLabel(label) {
    // Leave the decorative arrow icon intact.
    for (const node of sendButton.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { node.textContent = `\n${label}\n`; return; }
    }
    sendButton.prepend(document.createTextNode(label));
  }
  function showStatus(message, error = false) {
    applicationStatus.textContent = message;
    applicationStatus.classList.toggle('is-error', error);
    applicationStatus.classList.toggle('is-success', !error);
    applicationStatus.focus({preventScroll: true});
    applicationStatus.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
  function showUploadedFiles() {
    if (!extras) return;
    const names = Array.from(extras.files).map(f => f.name);
    fileList.textContent = names.length ? (fr ? 'Sélectionnés : ' : 'Ausgewählt: ') + names.join(' · ') : '';
  }
  function toggleApplicationFields() {
    const active = isApplicant();
    // Always present the application section on Kontakt / Contact.
    // File controls are enabled only for candidate/training roles because
    // other inquiries are drafts and must not silently discard attachments.
    uploadPanel.hidden = false;
    applicationStart.hidden = active;
    cv.required = active;
    cv.disabled = !active;
    extras.disabled = !active;
    privacy.required = active;
    privacy.disabled = !active;
    setButtonLabel(active ? applyButtonLabel : defaultButtonLabel);
    applicationStatus.textContent = '';
  }
  applicationStartButton.addEventListener('click', () => {
    form.elements.role.value = 'candidate';
    toggleApplicationFields();
    cv.focus({preventScroll: true});
    cv.scrollIntoView({behavior: 'smooth', block: 'center'});
  });
  form.elements.role.addEventListener('change', toggleApplicationFields);
  extras.addEventListener('change', showUploadedFiles);
  toggleApplicationFields();

  function validateFiles() {
    if (cv.files.length !== 1) return fr ? 'Veuillez joindre votre CV.' : 'Bitte laden Sie Ihren Lebenslauf hoch.';
    const docs = [...cv.files, ...extras.files];
    if (extras.files.length > 4) return fr ? 'Vous pouvez joindre 4 fichiers supplémentaires au maximum.' : 'Bitte höchstens 4 zusätzliche Anhänge auswählen.';
    let total = 0;
    const cvExt = /\.(pdf|doc|docx)$/i;
    const attachmentExt = /\.(pdf|doc|docx|jpe?g|png)$/i;
    for (const [i, file] of docs.entries()) {
      if (!(i === 0 ? cvExt : attachmentExt).test(file.name)) return fr ? 'Format de fichier non autorisé.' : 'Nicht unterstützter Dateityp.';
      if (!file.size || file.size > maxFileSize) return fr ? 'Chaque fichier doit faire 5 Mo maximum.' : 'Jede Datei darf höchstens 5 MB groß sein.';
      total += file.size;
    }
    if (total > maxTotalSize) return fr ? 'Le total des fichiers ne peut pas dépasser 15 Mo.' : 'Alle Dateien zusammen dürfen höchstens 15 MB groß sein.';
    return '';
  }
  function isPreviewOnlyHosting() {
    return location.protocol === 'file:' || /(?:^|\.)(?:github\.io|githubpages\.io|chatgpt\.site)$/i.test(location.hostname);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    applicationStatus.textContent = '';
    if (isApplicant()) {
      const fileError = validateFiles();
      if (fileError) { showStatus(fileError, true); return; }
      if (isPreviewOnlyHosting()) {
        showStatus(fr
          ? "L'envoi des documents n'est pas actif sur cet aperçu. Publiez d'abord le site sur un hébergement HTTPS prenant en charge PHP. Aucun fichier n'a été envoyé."
          : 'Der Dokumentenversand ist in dieser Vorschau nicht aktiv. Bitte zuerst auf einem HTTPS-Hosting mit PHP veröffentlichen. Es wurde keine Datei gesendet.', true);
        return;
      }
      const data = new FormData(form);
      data.append('lang', fr ? 'fr' : 'de');
      sendButton.disabled = true;
      setButtonLabel(fr ? 'Envoi en cours…' : 'Bewerbung wird gesendet…');
      try {
        const response = await fetch(form.action, {method: 'POST', body: data, credentials: 'same-origin', headers: {'Accept': 'application/json'}});
        const type = response.headers.get('Content-Type') || '';
        if (!type.includes('application/json')) throw new Error('BACKEND_NOT_CONFIGURED');
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'SEND_FAILED');
        form.reset();
        showUploadedFiles();
        toggleApplicationFields();
        showStatus(fr
          ? 'Votre candidature et vos pièces jointes ont été acceptées pour transmission par le serveur. Merci !'
          : 'Ihre Bewerbung und die Anhänge wurden vom Server zur Übermittlung angenommen. Vielen Dank !');
      } catch (error) {
        const backendMissing = ['BACKEND_NOT_CONFIGURED', 'SEND_FAILED'].includes(error.message) || error instanceof TypeError;
        showStatus(backendMissing
          ? (fr ? "L'envoi n'est pas disponible pour le moment. Aucun envoi n'a été confirmé. Réessayez plus tard." : 'Der Versand ist derzeit nicht verfügbar. Es wurde keine Übermittlung bestätigt. Bitte versuchen Sie es später erneut.')
          : error.message, true);
      } finally {
        sendButton.disabled = false;
        setButtonLabel(isApplicant() ? applyButtonLabel : defaultButtonLabel);
      }
      return;
    }
    // Other inquiries retain the site's existing local-only text preview.
    const values = new FormData(form);
    const labels = fr ? ['Nom','E-mail','Profil','Message'] : ['Name','E-Mail','Anliegen','Nachricht'];
    const role = form.elements.role.options[form.elements.role.selectedIndex].text;
    requestText = `SB Recruiting — ${fr ? 'Demande de contact' : 'Kontaktanfrage'}\n\n${labels[0]}: ${String(values.get('name')).trim()}\n${labels[1]}: ${String(values.get('email')).trim()}\n${labels[2]}: ${role}\n\n${labels[3]}:\n${String(values.get('message')).trim()}\n\n${fr ? 'Brouillon local. Cette demande n’a pas été envoyée.' : 'Lokaler Entwurf. Diese Anfrage wurde nicht versendet.'}`;
    summary.textContent = requestText;
    copyStatus.textContent = '';
    dialog.showModal();
  });
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  document.getElementById('copy-request').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(requestText);
      copyStatus.textContent = fr ? 'Texte copié.' : 'Text kopiert.';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(summary); selection.removeAllRanges(); selection.addRange(range);
      copyStatus.textContent = fr ? 'Texte sélectionné. Copiez-le ou téléchargez votre demande.' : 'Text markiert. Bitte kopieren oder die Anfrage herunterladen.';
    }
  });
  document.getElementById('download-request').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + requestText], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'SB-Recruiting-Anfrage.txt'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    copyStatus.textContent = fr ? 'Téléchargement lancé. La demande n’a pas été envoyée.' : 'Download gestartet. Die Anfrage wurde nicht versendet.';
  });
})();


/* Show matching original photos when an online Pexels photo cannot load. */
(() => {
  document.querySelectorAll('.recruit-photo-image img[data-photo-fallback]').forEach(img => {
    let usingFallback = false;
    const fallback = () => {
      if (usingFallback) return;
      usingFallback = true;
      img.src = img.getAttribute('data-photo-fallback');
    };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  });
})();
