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
  let requestText = '';
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
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
