/**
 * ui.js — Contrôleur interface utilisateur
 * Oral DNB · Collège Joliot Curie  —  Rev.3
 *
 * Nouveautés Rev.3 :
 *   - Drag & Drop dans le tableau d'affectation :
 *       glisser une ligne de créneau et la déposer sur une autre
 *       carte de jury pour déplacer le créneau.
 *   - Bouton "Affecter les non-affectés" :
 *       visible quand des élèves restent sans créneau après affectation ;
 *       les place même si ça dépasse l'heure de fin de session.
 *   - Zone de dépôt visuelle sur chaque jury-card pendant le glisser.
 */

'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

function notifier(message, type = 'success', duration = 4500) {
  const zone  = $('#notif-zone');
  const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
  const n = document.createElement('div');
  n.className = `notif ${type}`;
  n.setAttribute('role','alert');
  n.innerHTML = `<span class="notif-icon">${icons[type]||'ℹ'}</span><span class="notif-msg">${message}</span><button class="notif-close" aria-label="Fermer">✕</button>`;
  const close = () => { n.style.opacity='0'; n.style.transition='opacity .2s'; setTimeout(()=>n.remove(),200); };
  n.querySelector('.notif-close').addEventListener('click', close);
  zone.appendChild(n);
  if (duration > 0) setTimeout(close, duration);
}
window.notifier     = notifier;
window.ouvrirModal  = ouvrirModal;
window.fermerModal  = fermerModal;

// ════════════════════════════════════════════════════════════════
// INDICATEUR NON SAUVEGARDÉ
// ════════════════════════════════════════════════════════════════

const Unsaved = {
  _modified: false,
  marquer() {
    if (this._modified) return;
    this._modified = true;
    const ind = document.getElementById('save-indicator');
    const ban = document.getElementById('unsaved-banner');
    const btn = document.getElementById('btn-export-json');
    if (ind) ind.classList.add('visible');
    if (ban) ban.classList.add('visible');
    if (btn) btn.classList.add('sidebar-btn-unsaved');
  },
  sauvegarder() {
    this._modified = false;
    const ind = document.getElementById('save-indicator');
    const ban = document.getElementById('unsaved-banner');
    const btn = document.getElementById('btn-export-json');
    if (ind) ind.classList.remove('visible');
    if (ban) ban.classList.remove('visible');
    if (btn) btn.classList.remove('sidebar-btn-unsaved');
  },
  get estModifie() { return this._modified; },
};
window.Unsaved = Unsaved;

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function validerFormulaire(regles) {
  let ok = true;
  for (const [champId, {errId, message}] of Object.entries(regles)) {
    const champ = $(`#${champId}`); const errEl = $(`#${errId}`);
    const vide  = !champ || !champ.value.trim();
    if (errEl) errEl.textContent = vide ? message : '';
    if (champ) champ.classList.toggle('invalid', vide);
    if (vide) ok = false;
  }
  return ok;
}

function effacerErreurs(regles) {
  for (const [champId, {errId}] of Object.entries(regles)) {
    const champ = $(`#${champId}`); const errEl = $(`#${errId}`);
    if (champ) champ.classList.remove('invalid');
    if (errEl) errEl.textContent = '';
  }
}

// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════

function initNav() {
  $$('.nav-tab, .nav-item').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.nav-tab, .nav-item').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('active'); tab.setAttribute('aria-selected','true');
      $$('.tab-panel').forEach(p => {
        const actif = p.id === `tab-${tab.dataset.tab}`;
        p.hidden = !actif; p.classList.toggle('active', actif);
      });
      if (tab.dataset.tab === 'affectation') UI.renderAffectation();
    });
  });
}

// ════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════

const backdrop = $('#modal-backdrop');

function ouvrirModal(id) {
  const m = $(`#${id}`); if (!m) return;
  backdrop.hidden = false;
  m.showModal ? m.showModal() : m.setAttribute('open','');
  setTimeout(() => { const f=m.querySelector('input:not([type=hidden]),select,textarea'); if(f) f.focus(); }, 60);
}
function fermerModal(id) {
  const m = $(`#${id}`); if (!m) return;
  m.close ? m.close() : m.removeAttribute('open');
  backdrop.hidden = true;
}
function initModals() {
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => fermerModal(btn.dataset.close)));
  backdrop.addEventListener('click', () => $$('dialog[open]').forEach(m => fermerModal(m.id)));
  document.addEventListener('keydown', e => { if(e.key==='Escape') $$('dialog[open]').forEach(m=>fermerModal(m.id)); });
}

// ════════════════════════════════════════════════════════════════
// RENDU — JURYS
// ════════════════════════════════════════════════════════════════

function renderJurys() {
  const tbody = $('#jurys-tbody'), empty = $('#jurys-empty'), table = $('#jurys-table');
  tbody.innerHTML = '';
  const n = AppData.nbJurys();
  $('#count-jurys').textContent = `${n} jury${n>1?'s':''} enregistré${n>1?'s':''}`;

  if (n === 0) { table.style.display='none'; empty.style.display='block'; return; }
  table.style.display=''; empty.style.display='none';

  AppData.jurys.forEach((j,i) => {
    const cap = j.capacite > 0 ? `${j.capacite}` : '<em style="color:var(--gray-400)">auto</em>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${String(i+1).padStart(2,'0')}</td>
      <td><strong>${escHtml(j.nom)}</strong></td>
      <td>${j.langue ? `<span class="badge badge-langue">${escHtml(j.langue)}</span>` : '<span style="color:var(--gray-300)">Toutes</span>'}</td>
      <td><strong>${escHtml(j.salle)}</strong></td>
      <td>${escHtml(j.heureDebut)}</td>
      <td>${cap}</td>
      <td class="col-actions">
        <button class="btn btn-icon btn-edit" data-action="edit-jury"  data-id="${j.id}" title="Modifier">✏</button>
        <button class="btn btn-icon btn-del"  data-action="del-jury"   data-id="${j.id}" title="Supprimer">🗑</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ════════════════════════════════════════════════════════════════
// RENDU — ÉLÈVES
// ════════════════════════════════════════════════════════════════

function renderEleves() {
  const tbody = $('#eleves-tbody'), empty = $('#eleves-empty'), table = $('#eleves-table');
  const search = ($('#search-eleve').value||'').toLowerCase();
  const fLang  = ($('#filter-langue').value||'').toLowerCase();
  const fAm    = $('#filter-amenagement').checked;
  const fBin   = $('#filter-binome').checked;

  const filtres = AppData.eleves.filter(e => {
    const txt = `${e.nom} ${e.prenom} ${e.classe} ${e.sujet}`.toLowerCase();
    if (search && !txt.includes(search))                    return false;
    if (fLang  && (e.langue||'').toLowerCase() !== fLang)  return false;
    if (fAm    && !e.amenagement)                           return false;
    if (fBin   && !e.binomeAvec)                            return false;
    return true;
  });

  const total = AppData.nbEleves();
  const aff   = filtres.length;
  $('#count-eleves').textContent = aff < total
    ? `${aff} / ${total} élève${total>1?'s':''}`
    : `${total} élève${total>1?'s':''} enregistré${total>1?'s':''}`;

  tbody.innerHTML = '';
  if (filtres.length === 0) {
    table.style.display='none'; empty.style.display='block';
    empty.querySelector('p').innerHTML = total === 0
      ? 'Aucun élève. Importez un fichier Excel ou cliquez sur <strong>+ Ajouter un élève</strong>.'
      : 'Aucun élève ne correspond aux filtres.';
    return;
  }
  table.style.display=''; empty.style.display='none';

  filtres.forEach((e,i) => {
    const flags = [];
    if (e.amenagement) flags.push('<span class="badge badge-amem">1/3 tps</span>');
    if (e.prioritaire)  flags.push('<span class="badge badge-prio">Prior.</span>');
    if (e.binomeAvec)   flags.push('<span class="badge badge-duo">Binôme</span>');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${String(i+1).padStart(2,'0')}</td>
      <td><strong>${escHtml(e.nom)}</strong></td>
      <td>${escHtml(e.prenom)}</td>
      <td>${escHtml(e.classe)}</td>
      <td>${e.langue ? `<span class="badge badge-langue">${escHtml(e.langue)}</span>` : '<span style="color:var(--gray-300)">—</span>'}</td>
      <td class="cell-sujet" title="${escHtml(e.sujet)}">${escHtml(e.sujet||'—')}</td>
      <td>${e.binomeAvec ? escHtml(e.binomeAvec) : '<span style="color:var(--gray-300)">—</span>'}</td>
      <td>${flags.join(' ')}</td>
      <td class="col-actions">
        <button class="btn btn-icon btn-edit" data-action="edit-eleve" data-id="${e.id}" title="Modifier">✏</button>
        <button class="btn btn-icon btn-del"  data-action="del-eleve"  data-id="${e.id}" title="Supprimer">🗑</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ════════════════════════════════════════════════════════════════
// DRAG & DROP — État global
// ════════════════════════════════════════════════════════════════

const DnD = {
  // Index du créneau en cours de glisser (dans AppData.affectation)
  creneauIdx   : null,
  // Jury source
  juryIdSource : null,
  // Élément <tr> fantôme
  ghost        : null,

  reset() {
    this.creneauIdx   = null;
    this.juryIdSource = null;
    $$('.jury-card').forEach(c => c.classList.remove('dnd-over', 'dnd-target'));
    $$('.affec-table tbody tr').forEach(r => r.classList.remove('dnd-dragging'));
    $$('.dnd-drop-line').forEach(l => l.remove());
  },
};

// ════════════════════════════════════════════════════════════════
// RENDU — AFFECTATION (avec Drag & Drop)
// ════════════════════════════════════════════════════════════════

const UI = {

  renderAffectation() {
    this._renderCalculateur();
    this._renderResultat();
    this._updateBandeauParams();
  },

  _updateBandeauParams() {
    const p = AppData.params;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pb-debut',  p.heureDebut);
    set('pb-fin',    p.heureFin);
    set('pb-solo',   p.dureeSolo);
    set('pb-binome', p.dureeBinome);
    set('pb-marge',  p.margePassage);
    set('pb-convoc', p.convocAvant);
    const pausesActives = (p.pauses||[]).filter(pa => pa.active && pa.duree > 0);
    set('pb-pauses', pausesActives.length > 0
      ? pausesActives.map(pa => `${pa.heure} (${pa.duree} min)`).join(', ')
      : 'Aucune');
  },

  _renderCalculateur() {
    const zone = $('#calculateur-result'); if (!zone) return;
    const calcul = AppData.calculerNbJurys();
    if (!calcul.ok) { zone.innerHTML = `<div class="calc-error">⚠ ${escHtml(calcul.erreur)}</div>`; return; }
    zone.innerHTML = `
      <div class="calc-result-grid">
        <div class="calc-card calc-card-primary">
          <div class="calc-value">${calcul.nbJurysMin}</div>
          <div class="calc-label">Jurys nécessaires (minimum)</div>
        </div>
        <div class="calc-card">
          <div class="calc-value">${calcul.nbJurysConfort}</div>
          <div class="calc-label">Jurys recommandés (+10% marge)</div>
        </div>
        <div class="calc-card">
          <div class="calc-value">${calcul.capaciteParJury}</div>
          <div class="calc-label">Élèves max par jury</div>
        </div>
        <div class="calc-card">
          <div class="calc-value">${calcul.chargeParJuryMin}</div>
          <div class="calc-label">Élèves par jury (si ${calcul.nbJurysMin} jurys)</div>
        </div>
      </div>
      <div class="calc-detail">
        <strong>Détail :</strong> ${calcul.minutesUtiles} min utiles
        · ${calcul.nbEleves} élèves dont <strong>${calcul.nbBinomiques} en binôme</strong>,
        <strong>${calcul.nbAmenagement} aménagements</strong>,
        <strong>${calcul.nbPrioritaires} prioritaires</strong>.
        Durée moy. : <strong>${calcul.dureeMoyParEleve} min/élève</strong>.
        Fin estimée : <strong>${calcul.heureFinEstimeeMin}</strong>.
        ${AppData.nbJurys() > 0 ? `<br/>⚠ ${AppData.nbJurys()} jury(s) chargé(s) actuellement.` : ''}
      </div>`;
  },

  _renderResultat() {
    const container = $('#affectation-result'); if (!container) return;

    if (AppData.affectation.length === 0) {
      container.innerHTML = `<div class="placeholder-zone"><p>Cliquez sur <strong>⚡ Lancer l'affectation</strong> après avoir chargé les données.</p></div>`;
      this._updateStats(); return;
    }

    // ── Panneau non-affectés ─────────────────────────────────────────
    const dejaDansCreneaux = new Set(AppData.affectation.flatMap(c => c.eleveIds));
    const nonAffectes = AppData.eleves.filter(e => !dejaDansCreneaux.has(e.id));

    let htmlNonAff = '';
    if (nonAffectes.length > 0) {
      const lignes = nonAffectes.map(e => {
        const flags = [];
        if (e.amenagement) flags.push('<span class="badge badge-amem">1/3 tps</span>');
        if (e.prioritaire)  flags.push('<span class="badge badge-prio">Prior.</span>');
        if (e.binomeAvec)   flags.push('<span class="badge badge-duo">Binôme</span>');
        return `<tr>
          <td><strong>${escHtml(e.nom)}</strong> ${escHtml(e.prenom)}</td>
          <td>${escHtml(e.classe)}</td>
          <td>${e.langue ? `<span class="badge badge-langue">${escHtml(e.langue)}</span>` : '—'}</td>
          <td>${flags.join(' ')}</td>
        </tr>`;
      }).join('');
      htmlNonAff = `
        <div class="non-affectes-panel">
          <div class="non-affectes-header">
            <span class="non-affectes-icon">⚠</span>
            <div>
              <strong>${nonAffectes.length} élève${nonAffectes.length>1?'s':''} non affecté${nonAffectes.length>1?'s':''}</strong>
              <span class="non-affectes-sub">La capacité des jurys a été dépassée ou la langue ne correspondait pas.</span>
            </div>
            <button class="btn btn-accent" id="btn-affecter-non-affectes" title="Affecter même au-delà de l'heure prévue">
              ⚡ Affecter les non-affectés
            </button>
          </div>
          <div class="non-affectes-table-wrap">
            <table class="affec-table non-affectes-table">
              <thead><tr><th>Élève</th><th>Classe</th><th>Langue</th><th>Particularités</th></tr></thead>
              <tbody>${lignes}</tbody>
            </table>
          </div>
        </div>`;
    }

    // ── Grille des jurys ─────────────────────────────────────────────
    const parJury = new Map();
    AppData.jurys.forEach(j => parJury.set(j.id, { jury:j, creneaux:[] }));
    AppData.affectation.forEach((c,idx) => {
      if (parJury.has(c.juryId)) parJury.get(c.juryId).creneaux.push({...c, _idx:idx});
    });

    let htmlGrid = '<div class="affectation-grid">';

    parJury.forEach(({ jury, creneaux }) => {
      if (!creneaux.length) return;
      const nbE = creneaux.reduce((s,c)=>s+c.eleveIds.length,0);
      const langBadge = jury.langue ? `<span class="badge badge-langue">${escHtml(jury.langue)}</span>` : '';
      const heureFin  = creneaux.reduce((m,c) => c.heureFin > m ? c.heureFin : m, '');

      htmlGrid += `
        <div class="jury-card" data-jury-id="${jury.id}">
          <div class="jury-card-header">
            <div class="jury-card-title">
              <strong>${escHtml(jury.nom)}</strong>
              <span class="jury-card-salle">Salle ${escHtml(jury.salle)}</span>
            </div>
            <div class="jury-card-meta">
              ${langBadge}
              <span class="jury-card-count">${nbE} élève${nbE>1?'s':''}</span>
              ${heureFin ? `<span class="jury-card-fin">Fin estimée&nbsp;: <strong>${heureFin}</strong></span>` : ''}
            </div>
          </div>
          <div class="dnd-drop-zone" data-jury-id="${jury.id}" title="Déposer ici pour placer à la fin"></div>
          <table class="affec-table"><thead>
            <tr><th class="th-drag" title="Glisser pour déplacer">⠿</th><th>#</th><th>Début</th><th>Fin</th><th>Candidat(s)</th><th>Cl.</th><th>Durée</th><th></th></tr>
          </thead><tbody>`;

      creneaux.sort((a,b)=>a.ordre-b.ordre).forEach(c => {
        const nomsHtml = c.eleveIds.map(id => {
          const e = AppData.getEleve(id); if(!e) return '?';
          const f = [];
          if (e.amenagement) f.push('<span class="badge badge-amem" title="Tiers-temps">1/3</span>');
          if (e.prioritaire)  f.push('<span class="badge badge-prio" title="Prioritaire">P</span>');
          return `<span class="eleve-nom">${escHtml(e.nom)} ${escHtml(e.prenom)}</span>${f.join('')}`;
        }).join('<br/>');
        const classes = c.eleveIds.map(id=>AppData.getEleve(id)?.classe||'').filter(Boolean).join('/');
        const flagBin = c.isBinome ? '<span class="badge badge-duo">Binôme</span>' : '';

        htmlGrid += `
          <tr class="dnd-row" draggable="true" data-creneau-idx="${c._idx}" data-jury-id="${jury.id}">
            <td class="td-drag" title="Glisser pour déplacer">⠿</td>
            <td class="text-center"><span class="ordre-badge">${c.ordre}</span></td>
            <td>${c.heureDebut}</td><td>${c.heureFin}</td>
            <td>${nomsHtml}</td><td>${escHtml(classes)}</td>
            <td>${c.duree} min ${flagBin}</td>
            <td class="col-actions">
              <button class="btn btn-icon btn-edit" data-action="deplacer-creneau" data-idx="${c._idx}" title="Déplacer (modal)">⇄</button>
              <button class="btn btn-icon btn-del"  data-action="del-creneau"      data-idx="${c._idx}" title="Supprimer">🗑</button>
            </td>
          </tr>`;
      });

      htmlGrid += `</tbody></table></div>`;
    });

    htmlGrid += '</div>';

    container.innerHTML = htmlNonAff + htmlGrid;
    this._updateStats();

    // Brancher le drag & drop APRÈS insertion dans le DOM
    this._initDragDrop();
  },

  _updateStats() {
    const el = $('#stats-affectation'); if (!el) return;
    if (!AppData.affectation.length) { el.textContent=''; return; }
    const nbAff    = AppData.affectation.reduce((s,c)=>s+c.eleveIds.length,0);
    const nbNonAff = AppData.nbEleves() - nbAff;
    el.innerHTML = `
      <span class="stat-item">✓ ${nbAff} élève${nbAff>1?'s':''} affecté${nbAff>1?'s':''}</span>
      ${nbNonAff>0?`<span class="stat-item stat-warn">⚠ ${nbNonAff} non affecté${nbNonAff>1?'s':''}</span>`:''}
      <span class="stat-item">${AppData.affectation.length} créneau${AppData.affectation.length>1?'x':''}</span>
      <span class="stat-item">${AppData.nbJurys()} jury${AppData.nbJurys()>1?'s':''}</span>`;
  },

  // ── Drag & Drop ──────────────────────────────────────────────────────────────

  _initDragDrop() {
    const container = $('#affectation-result'); if (!container) return;

    // ── Début du glisser ──────────────────────────────────────
    container.addEventListener('dragstart', e => {
      const row = e.target.closest('.dnd-row');
      if (!row) return;
      const idx = parseInt(row.dataset.creneauIdx, 10);
      if (isNaN(idx)) return;

      DnD.creneauIdx   = idx;
      DnD.juryIdSource = parseInt(row.dataset.juryId, 10);

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));

      row.classList.add('dnd-dragging');

      // Petit délai pour que le fantôme de drag s'affiche avant qu'on masque la ligne
      setTimeout(() => row.classList.add('dnd-source-hidden'), 0);
    });

    // ── Survol d'une zone de dépôt ────────────────────────────
    container.addEventListener('dragover', e => {
      const juryCard = e.target.closest('.jury-card');
      if (!juryCard || DnD.creneauIdx === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // Mettre en évidence la carte survolée
      $$('.jury-card').forEach(c => c.classList.remove('dnd-over'));
      juryCard.classList.add('dnd-over');

      // Indicateur de position d'insertion entre les lignes
      $$('.dnd-insert-indicator').forEach(el => el.remove());
      const targetRow = e.target.closest('.dnd-row');
      if (targetRow && targetRow !== document.querySelector(`.dnd-row[data-creneau-idx="${DnD.creneauIdx}"]`)) {
        const indicator = document.createElement('tr');
        indicator.className = 'dnd-insert-indicator';
        indicator.innerHTML = '<td colspan="8"><div class="dnd-insert-line"></div></td>';
        const rect = targetRow.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          targetRow.parentNode.insertBefore(indicator, targetRow);
        } else {
          targetRow.parentNode.insertBefore(indicator, targetRow.nextSibling);
        }
      }
    });

    // ── Entrée dans une carte ──────────────────────────────────
    container.addEventListener('dragenter', e => {
      const juryCard = e.target.closest('.jury-card');
      if (juryCard) juryCard.classList.add('dnd-over');
    });

    // ── Sortie d'une carte ─────────────────────────────────────
    container.addEventListener('dragleave', e => {
      const juryCard = e.target.closest('.jury-card');
      if (!juryCard) return;
      const related = e.relatedTarget;
      if (!related || !juryCard.contains(related)) {
        juryCard.classList.remove('dnd-over');
        $$('.dnd-insert-indicator').forEach(el => el.remove());
      }
    });

    // ── Dépôt ─────────────────────────────────────────────────
    container.addEventListener('drop', e => {
      e.preventDefault();
      const juryCard = e.target.closest('.jury-card');
      if (!juryCard || DnD.creneauIdx === null) { DnD.reset(); return; }

      const juryIdCible = parseInt(juryCard.dataset.juryId, 10);

      // Trouver l'index d'insertion (avant quelle ligne ?)
      const indicator = juryCard.querySelector('.dnd-insert-indicator');
      let avantCreneauIdx = null;
      if (indicator) {
        const rowApres = indicator.nextElementSibling;
        if (rowApres && rowApres.classList.contains('dnd-row')) {
          avantCreneauIdx = parseInt(rowApres.dataset.creneauIdx, 10);
        }
      }

      const err = Affectation.deplacerCreneauDnD(DnD.creneauIdx, juryIdCible, avantCreneauIdx);
      DnD.reset();

      if (err) {
        notifier(err, 'error', 5000);
      } else {
        UI.renderAffectation();
        Unsaved.marquer();
        notifier('Créneau déplacé.', 'success', 2500);
      }
    });

    // ── Fin du glisser (annulation, ex. Escape) ───────────────
    container.addEventListener('dragend', e => {
      $$('.dnd-row').forEach(r => r.classList.remove('dnd-dragging', 'dnd-source-hidden'));
      $$('.dnd-insert-indicator').forEach(el => el.remove());
      $$('.jury-card').forEach(c => c.classList.remove('dnd-over'));
      // Si drop n'a pas eu lieu, pas besoin de faire autre chose (DnD.reset() est appelé dans drop)
    });
  },
};
window.UI = UI;

// ════════════════════════════════════════════════════════════════
// MODAL DÉPLACEMENT (conservé pour le bouton ⇄ classique)
// ════════════════════════════════════════════════════════════════

function initModalDeplacement() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="deplacer-creneau"]');
    if (!btn) return;
    const idx     = parseInt(btn.dataset.idx, 10);
    const creneau = AppData.affectation[idx];
    if (!creneau) return;
    const select = $('#deplacement-jury-cible'); if (!select) return;
    select.innerHTML = AppData.jurys.filter(j=>j.id!==creneau.juryId)
      .map(j=>`<option value="${j.id}">${escHtml(j.nom)} — Salle ${escHtml(j.salle)} (${j.langue||'Toutes'})</option>`).join('');
    $('#deplacement-creneau-idx').value = idx;
    const nomsEl = $('#deplacement-eleves');
    if (nomsEl) nomsEl.textContent = creneau.eleveIds.map(id=>{const e=AppData.getEleve(id);return e?`${e.nom} ${e.prenom}`:'?';}).join(', ');
    ouvrirModal('modal-deplacement');
  });
  const form = $('#form-deplacement');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const idx    = parseInt($('#deplacement-creneau-idx').value, 10);
      const juryId = parseInt($('#deplacement-jury-cible').value, 10);
      const err    = Affectation.deplacerCreneau(idx, juryId);
      if (err) { notifier(err,'error'); }
      else { fermerModal('modal-deplacement'); UI.renderAffectation(); Unsaved.marquer(); notifier('Créneau déplacé.','success'); }
    });
  }
}

// ════════════════════════════════════════════════════════════════
// FORMULAIRE JURY
// ════════════════════════════════════════════════════════════════

const REGLES_JURY = {
  'jury-nom'  : { errId:'err-jury-nom',   message:'Le nom est requis.' },
  'jury-salle': { errId:'err-jury-salle', message:'La salle est requise.' },
};

function ouvrirModalJury(jury=null) {
  effacerErreurs(REGLES_JURY);
  $('#modal-jury-title').textContent = jury ? 'Modifier le jury' : 'Ajouter un jury';
  $('#jury-id').value          = jury ? jury.id          : '';
  $('#jury-nom').value         = jury ? jury.nom         : '';
  $('#jury-langue').value      = jury ? jury.langue      : '';
  $('#jury-salle').value       = jury ? jury.salle       : '';
  $('#jury-heure-debut').value = jury ? jury.heureDebut  : AppData.params.heureDebut;
  $('#jury-capacite').value    = jury ? (jury.capacite||'') : '';
  ouvrirModal('modal-jury');
}

function initFormJury() {
  $('#btn-add-jury').addEventListener('click', () => ouvrirModalJury());
  $('#form-jury').addEventListener('submit', e => {
    e.preventDefault();
    if (!validerFormulaire(REGLES_JURY)) return;
    const fields = {
      nom: $('#jury-nom').value, langue: $('#jury-langue').value,
      salle: $('#jury-salle').value, heureDebut: $('#jury-heure-debut').value,
      capacite: parseInt($('#jury-capacite').value,10)||0,
    };
    const idRaw = $('#jury-id').value;
    if (idRaw) { AppData.updateJury(parseInt(idRaw,10),fields); notifier('Jury mis à jour.'); }
    else       { AppData.addJury(fields);                       notifier('Jury ajouté.'); }
    Unsaved.marquer(); fermerModal('modal-jury'); renderJurys();
  });
}

// ════════════════════════════════════════════════════════════════
// FORMULAIRE ÉLÈVE
// ════════════════════════════════════════════════════════════════

const REGLES_ELEVE = {
  'eleve-nom'   : { errId:'err-eleve-nom',    message:'Le nom est requis.' },
  'eleve-prenom': { errId:'err-eleve-prenom', message:'Le prénom est requis.' },
  'eleve-classe': { errId:'err-eleve-classe', message:'La classe est requise.' },
};

function ouvrirModalEleve(eleve=null) {
  effacerErreurs(REGLES_ELEVE);
  $('#modal-eleve-title').textContent = eleve ? "Modifier l'élève" : 'Ajouter un élève';
  $('#eleve-id').value            = eleve ? eleve.id           : '';
  $('#eleve-nom').value           = eleve ? eleve.nom          : '';
  $('#eleve-prenom').value        = eleve ? eleve.prenom       : '';
  $('#eleve-classe').value        = eleve ? eleve.classe       : '';
  $('#eleve-langue').value        = eleve ? eleve.langue       : '';
  $('#eleve-sujet').value         = eleve ? eleve.sujet        : '';
  $('#eleve-parcours').value      = eleve ? eleve.parcours     : '';
  $('#eleve-binome').value        = eleve ? eleve.binomeAvec   : '';
  $('#eleve-amenagement').checked = eleve ? eleve.amenagement  : false;
  $('#eleve-prioritaire').checked = eleve ? eleve.prioritaire  : false;
  ouvrirModal('modal-eleve');
}

function initFormEleve() {
  $('#btn-add-eleve').addEventListener('click', () => ouvrirModalEleve());
  $('#form-eleve').addEventListener('submit', e => {
    e.preventDefault();
    if (!validerFormulaire(REGLES_ELEVE)) return;
    const fields = {
      nom: $('#eleve-nom').value, prenom: $('#eleve-prenom').value,
      classe: $('#eleve-classe').value, langue: $('#eleve-langue').value,
      sujet: $('#eleve-sujet').value, parcours: $('#eleve-parcours').value,
      binomeAvec: $('#eleve-binome').value,
      amenagement: $('#eleve-amenagement').checked,
      prioritaire: $('#eleve-prioritaire').checked,
    };
    const idRaw = $('#eleve-id').value;
    if (idRaw) { AppData.updateEleve(parseInt(idRaw,10),fields); notifier('Élève mis à jour.'); }
    else       { AppData.addEleve(fields);                       notifier('Élève ajouté.'); }
    Unsaved.marquer(); fermerModal('modal-eleve'); renderEleves();
  });
}

// ════════════════════════════════════════════════════════════════
// FILTRES ÉLÈVES
// ════════════════════════════════════════════════════════════════

function initFiltresEleves() {
  ['search-eleve','filter-langue','filter-amenagement','filter-binome'].forEach(id => {
    const el = $(`#${id}`); if (el) el.addEventListener('input', renderEleves);
  });
}

function peuplerFiltreLangues() {
  const select = $('#filter-langue'); if (!select) return;
  const langues = [...new Set(AppData.eleves.map(e=>e.langue).filter(Boolean))].sort();
  const val = select.value;
  select.innerHTML = '<option value="">Toutes les langues</option>' +
    langues.map(l=>`<option value="${escHtml(l.toLowerCase())}">${escHtml(l)}</option>`).join('');
  select.value = val;
}

// ════════════════════════════════════════════════════════════════
// PARAMÈTRES
// ════════════════════════════════════════════════════════════════

function chargerParams() {
  const p = AppData.params;
  $('#param-etablissement').value = p.etablissement;
  $('#param-annee').value         = p.annee;
  $('#param-duree-solo').value    = p.dureeSolo;
  $('#param-duree-binome').value  = p.dureeBinome;
  $('#param-heure-debut').value   = p.heureDebut;
  $('#param-heure-fin').value     = p.heureFin;
  const pauses = p.pauses || [{active:true,heure:'10:00',duree:15},{active:true,heure:'12:00',duree:60},{active:false,heure:'15:00',duree:15}];
  [1,2,3].forEach((n,i) => {
    const pa = pauses[i] || {active:false,heure:'12:00',duree:0};
    const cb = $(`#param-pause${n}-active`);
    const ph = $(`#param-pause${n}-heure`);
    const pd = $(`#param-pause${n}-duree`);
    if (cb) cb.checked = !!pa.active;
    if (ph) ph.value   = pa.heure  || '12:00';
    if (pd) pd.value   = pa.duree  || 0;
    const fields = $(`#pause${n}-fields`);
    if (fields) {
      fields.style.opacity = pa.active ? '1' : '0.4';
      fields.querySelectorAll('input').forEach(inp => inp.disabled = !pa.active);
    }
  });
  $('#param-convoc-avant').value  = p.convocAvant;
  $('#param-marge-passage').value = p.margePassage;
}

function initParams() {
  const btnParams = $('#btn-open-params');
  if (btnParams) btnParams.addEventListener('click', () => { chargerParams(); ouvrirModal('modal-params'); });
  const btnParamsNav = $('#btn-open-params-nav');
  if (btnParamsNav) btnParamsNav.addEventListener('click', () => { chargerParams(); ouvrirModal('modal-params'); });
  const btnParamsAff = $('#btn-open-params-affectation');
  if (btnParamsAff) btnParamsAff.addEventListener('click', () => { chargerParams(); ouvrirModal('modal-params'); });

  $('#form-params').addEventListener('submit', e => {
    e.preventDefault();
    AppData.saveParams({
      etablissement : $('#param-etablissement').value,
      annee         : $('#param-annee').value,
      dureeSolo     : $('#param-duree-solo').value,
      dureeBinome   : $('#param-duree-binome').value,
      heureDebut    : $('#param-heure-debut').value,
      heureFin      : $('#param-heure-fin').value,
      pauses        : [1,2,3].map(n => ({
        active : $(`#param-pause${n}-active`)?.checked || false,
        heure  : $(`#param-pause${n}-heure`)?.value   || '12:00',
        duree  : parseInt($(`#param-pause${n}-duree`)?.value || '0', 10),
      })),
      convocAvant   : $('#param-convoc-avant').value,
      margePassage  : $('#param-marge-passage').value,
    });
    fermerModal('modal-params');
    Unsaved.marquer();
    notifier('Paramètres enregistrés.','success');
    UI._renderCalculateur();
    UI._updateBandeauParams();
  });
}

// ════════════════════════════════════════════════════════════════
// ACTIONS TABLEAUX
// ════════════════════════════════════════════════════════════════

function initTableActions() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]'); if (!btn) return;
    const action = btn.dataset.action;
    const id  = parseInt(btn.dataset.id, 10);
    const idx = parseInt(btn.dataset.idx, 10);

    switch(action) {
      case 'edit-jury':  { const j=AppData.getJury(id); if(j) ouvrirModalJury(j); break; }
      case 'del-jury':
        if (confirm('Supprimer ce jury ?')) { AppData.deleteJury(id); renderJurys(); Unsaved.marquer(); notifier('Jury supprimé.','warning'); }
        break;
      case 'edit-eleve': { const ev=AppData.getEleve(id); if(ev) ouvrirModalEleve(ev); break; }
      case 'del-eleve':
        if (confirm('Supprimer cet élève ?')) { AppData.deleteEleve(id); renderEleves(); peuplerFiltreLangues(); Unsaved.marquer(); notifier('Élève supprimé.','warning'); }
        break;
      case 'del-creneau':
        if (confirm('Retirer ce créneau ?')) { Affectation.supprimerCreneau(idx); UI.renderAffectation(); Unsaved.marquer(); notifier('Créneau supprimé.','warning'); }
        break;
    }
  });
}

// ════════════════════════════════════════════════════════════════
// IMPORT EXCEL
// ════════════════════════════════════════════════════════════════

function initImportExcel() {
  const input = $('#input-import-xlsx'); if (!input) return;
  input.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    if (typeof XLSX === 'undefined') { notifier('SheetJS non chargé. Vérifiez votre connexion.','error',8000); return; }
    const reader = new FileReader();
    reader.onload = evt => {
      let res;
      try { res = AppData.importerExcel(evt.target.result); }
      catch(err) { notifier(`Erreur import Excel : ${err.message}`,'error',8000); console.error(err); return; }
      renderJurys(); renderEleves(); peuplerFiltreLangues();
      AppData.affectation = []; UI.renderAffectation();
      Unsaved.marquer();
      notifier(`Excel importé : ${res.nbEleves} élève(s), ${res.nbJurys} jury(s).`,'success',6000);
      res.avertissements.forEach(a => notifier(a,'warning',9000));
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  });
}

// ════════════════════════════════════════════════════════════════
// IMPORT / EXPORT JSON
// ════════════════════════════════════════════════════════════════

function initImportExportJSON() {
  $('#btn-export-json').addEventListener('click', () => {
    if (!AppData.nbJurys() && !AppData.nbEleves()) { notifier('Rien à exporter.','warning'); return; }
    AppData.exporterJSON();
    Unsaved.sauvegarder();
    notifier('Session sauvegardée en JSON. Gardez ce fichier précieusement !','success', 6000);
  });
  $('#input-import-json').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      let data; try { data = JSON.parse(evt.target.result); } catch { notifier('JSON illisible.','error'); return; }
      if (!confirm('Importer ce fichier remplacera toutes les données. Continuer ?')) return;
      const err = AppData.importerJSON(data);
      if (err) { notifier(err,'error'); return; }
      renderJurys(); renderEleves(); peuplerFiltreLangues(); UI.renderAffectation();
      Unsaved.sauvegarder();
      notifier(`Session restaurée : ${AppData.nbJurys()} jury(s), ${AppData.nbEleves()} élève(s).`,'success');
    };
    reader.readAsText(file,'UTF-8');
    e.target.value = '';
  });
}

// ════════════════════════════════════════════════════════════════
// EXPORT EXCEL
// ════════════════════════════════════════════════════════════════

function initExportExcel() {
  $$('#btn-export-xlsx, #btn-export-xlsx-impressions').forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!AppData.affectation.length) { notifier("Lancez l'affectation avant d'exporter.",'warning'); return; }
      if (typeof XLSX === 'undefined') { notifier('SheetJS non disponible.','error'); return; }
      try { AppData.exporterExcel(); notifier('Fichier Excel exporté avec les affectations.','success'); }
      catch(err) { notifier(`Erreur export : ${err.message}`,'error'); }
    });
  });
}

// ════════════════════════════════════════════════════════════════
// IMPRESSIONS
// ════════════════════════════════════════════════════════════════

function initImpressions() {
  const map = {
    'btn-print-convoc-eleves': () => Print.convocationsEleves(),
    'btn-print-convoc-jurys' : () => Print.convocationsJurys(),
    'btn-print-recap'        : () => Print.recapitulatif(),
    'btn-print-emargement'   : () => Print.feuilleEmargement(),
    'btn-print-consignes'    : () => Print.consignesJury(),
  };
  for (const [id, fn] of Object.entries(map)) {
    const btn = $(`#${id}`); if (btn) btn.addEventListener('click', fn);
  }
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initNav(); initModals(); initModalDeplacement();
  initTableActions(); initFormJury(); initFormEleve();
  initFiltresEleves(); initParams();
  initImportExportJSON(); initImportExcel(); initExportExcel();
  initImpressions();
  renderJurys(); renderEleves(); UI.renderAffectation();
});
