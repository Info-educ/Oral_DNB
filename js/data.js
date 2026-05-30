/**
 * data.js — Modèle de données, persistance JSON, import/export Excel
 * Oral DNB · Collège Joliot Curie  —  Version Brique 2-5 Rev.3
 *
 * Nouveautés rev.3 :
 *   - Feuille Élèves : NOM et Prénom désormais dans deux colonnes séparées
 *   - Règle de langue stricte :
 *       · élève Anglais  → jury Anglais uniquement
 *       · élève Espagnol → jury Espagnol uniquement
 *       · élève sans langue → jury sans langue uniquement
 *       · jury sans langue → élèves sans langue UNIQUEMENT (pas "tous")
 *
 * RGPD : zéro donnée ne quitte le navigateur.
 */

'use strict';

const AppData = {

  params: {
    etablissement  : 'Collège Joliot Curie — Bagneux',
    annee          : '2025-2026',
    lieuSignature  : 'Bagneux',
    typeEpreuve    : 'DNB',           // 'DNB' | 'DNB_BLANC'
    dateEpreuve    : '',              // ISO date YYYY-MM-DD
    dureeSolo      : 25,
    dureeBinome    : 35,
    convocAvant    : 15,
    heureDebut     : '08:00',
    heureFin       : '17:00',
    margePassage   : 0,
    // 3 pauses indépendantes — active:false ou duree:0 = ignorée
    pauses : [
      { active: true,  heure: '10:00', duree: 15  },  // Pause 1 : matin
      { active: true,  heure: '12:00', duree: 60  },  // Pause 2 : méridienne
      { active: false, heure: '15:00', duree: 15  },  // Pause 3 : après-midi
    ],
  },

  jurys       : [],
  eleves      : [],
  affectation : [],

  _nextJuryId  : 1,
  _nextEleveId : 1,

  // ──────────────────────────────────────────────────────────────
  // JURYS — CRUD
  // ──────────────────────────────────────────────────────────────

  addJury(fields) {
    const jury = {
      id           : this._nextJuryId++,
      nom          : (fields.nom          || '').trim(),
      matiere      : (fields.matiere      || '').trim(),
      langue       : (fields.langue       || '').trim(),   // texte libre : 'Anglais', 'Espagnol', '' = tous
      salle        : (fields.salle        || '').trim(),
      heureDebut   : fields.heureDebut    || this.params.heureDebut,
      capacite     : parseInt(fields.capacite, 10) || 0,  // 0 = calculé automatiquement
      createdAt    : new Date().toISOString(),
    };
    this.jurys.push(jury);
    return jury;
  },

  updateJury(id, fields) {
    const jury = this.jurys.find(j => j.id === id);
    if (!jury) return null;
    jury.nom        = (fields.nom          || '').trim();
    jury.matiere    = (fields.matiere      || '').trim();
    jury.langue     = (fields.langue       || '').trim();
    jury.salle      = (fields.salle        || '').trim();
    jury.heureDebut = fields.heureDebut    || jury.heureDebut;
    jury.capacite   = parseInt(fields.capacite, 10) || jury.capacite;
    jury.updatedAt  = new Date().toISOString();
    return jury;
  },

  deleteJury(id) {
    const idx = this.jurys.findIndex(j => j.id === id);
    if (idx === -1) return false;
    this.jurys.splice(idx, 1);
    return true;
  },

  getJury(id) { return this.jurys.find(j => j.id === id) || null; },

  // ──────────────────────────────────────────────────────────────
  // ÉLÈVES — CRUD
  // ──────────────────────────────────────────────────────────────

  addEleve(fields) {
    const eleve = {
      id          : this._nextEleveId++,
      nom         : (fields.nom    || '').trim().toUpperCase(),
      prenom      : (fields.prenom || '').trim(),
      classe      : (fields.classe || '').trim(),
      langue      : (fields.langue || '').trim(),   // texte libre : 'Anglais', 'Espagnol', '' = indifférent
      sujet       : (fields.sujet  || '').trim(),
      parcours    : (fields.parcours || '').trim(),
      binomeAvec  : (fields.binomeAvec || '').trim(),
      amenagement : !!fields.amenagement,
      prioritaire : !!fields.prioritaire,
      createdAt   : new Date().toISOString(),
    };
    this.eleves.push(eleve);
    return eleve;
  },

  updateEleve(id, fields) {
    const eleve = this.eleves.find(e => e.id === id);
    if (!eleve) return null;
    eleve.nom         = (fields.nom    || '').trim().toUpperCase();
    eleve.prenom      = (fields.prenom || '').trim();
    eleve.classe      = (fields.classe || '').trim();
    eleve.langue      = (fields.langue || '').trim();
    eleve.sujet       = (fields.sujet  || '').trim();
    eleve.parcours    = (fields.parcours || '').trim();
    eleve.binomeAvec  = (fields.binomeAvec || '').trim();
    eleve.amenagement = !!fields.amenagement;
    eleve.prioritaire = !!fields.prioritaire;
    eleve.updatedAt   = new Date().toISOString();
    return eleve;
  },

  deleteEleve(id) {
    const idx = this.eleves.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.eleves.splice(idx, 1);
    return true;
  },

  getEleve(id) { return this.eleves.find(e => e.id === id) || null; },

  // ──────────────────────────────────────────────────────────────
  // CALCULS DURÉES
  // ──────────────────────────────────────────────────────────────

  calculerDuree(eleve, isBinome = false) {
    const base = isBinome ? this.params.dureeBinome : this.params.dureeSolo;
    if (!eleve || !eleve.amenagement) return base;
    return Math.ceil((base * 4 / 3) / 5) * 5;
  },

  ajouterMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total  = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  },

  soustraireMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total  = Math.max(0, h * 60 + m - minutes);
    return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  },

  enMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  },

  // ──────────────────────────────────────────────────────────────
  // CALCULATEUR AUTOMATIQUE DE JURYS
  // ──────────────────────────────────────────────────────────────

  /**
   * Calcule le nombre de jurys nécessaires et la capacité par jury.
   *
   * Logique :
   *   minutesUtiles = (heureFin − heureDebut) − pauseDuree
   *   On estime la durée moyenne pondérée par le profil des élèves :
   *     - Élèves avec tiers-temps → durée × 4/3
   *     - Binômes → dureeBinome (partagée entre 2 → coût/élève = dureeBinome/2)
   *     - Solo standard → dureeSolo
   *   capaciteParJury = ⌊ minutesUtiles / dureeMoyenneEstimee ⌋
   *   nbJurysNecessaires = ⌈ nbEleves / capaciteParJury ⌉
   *
   * @param {Object} opts - surcharge des paramètres (optionnel)
   * @returns {Object} résultat détaillé
   */
  calculerNbJurys(opts = {}) {
    const p = { ...this.params, ...opts };

    const debutMin = this.enMinutes(p.heureDebut);
    const finMin   = this.enMinutes(p.heureFin);
    const marge    = parseInt(p.margePassage, 10) || 0;

    if (finMin <= debutMin) return { ok: false, erreur: 'L\'heure de fin doit être après l\'heure de début.' };

    const dureeSession  = finMin - debutMin;
    // Total des minutes de pauses actives
    const totalPauses = (p.pauses || []).reduce((s, pa) =>
      s + ((pa.active && pa.duree > 0) ? parseInt(pa.duree, 10) : 0), 0);
    const minutesUtiles = dureeSession - totalPauses;
    if (minutesUtiles <= 0) return { ok: false, erreur: 'Durée utile nulle ou négative après déduction de la pause.' };

    const nbEleves = this.eleves.length;
    if (nbEleves === 0) return { ok: false, erreur: 'Aucun élève chargé.' };

    // Compter les profils
    let nbBinomiques   = 0; // élèves en binôme (comptés 1 fois chacun)
    let nbAmenagement  = 0;
    let nbPrioritaires = 0;
    const vusBinomes   = new Set();

    this.eleves.forEach(e => {
      if (e.amenagement) nbAmenagement++;
      if (e.prioritaire)  nbPrioritaires++;
      if (e.binomeAvec && !vusBinomes.has(e.id)) {
        // Chercher le partenaire
        const partenaire = this.eleves.find(x =>
          this._normNom(`${x.nom} ${x.prenom}`) === this._normNom(e.binomeAvec)
        );
        if (partenaire) {
          vusBinomes.add(e.id);
          vusBinomes.add(partenaire.id);
          nbBinomiques += 2;
        }
      }
    });

    const nbBinomePaires = nbBinomiques / 2;  // nombre de paires
    const nbSolo         = nbEleves - nbBinomiques;
    const nbSoloAm       = Math.round(nbAmenagement * (nbSolo / nbEleves)); // estimation
    const nbSoloStd      = nbSolo - nbSoloAm;

    const dureeSolo    = parseInt(p.dureeSolo,   10) || 25;
    const dureeBinome  = parseInt(p.dureeBinome, 10) || 35;

    // Durée totale estimée pour tous les élèves (en minutes·jury)
    // Binômes : 1 créneau de dureeBinome pour 2 élèves → dureeBinome/2 par élève
    // Solo tiers-temps : dureeSolo * 4/3 arrondi à 5
    const dureeSoloAm  = Math.ceil((dureeSolo * 4 / 3) / 5) * 5;
    const cout = (nbSoloStd * (dureeSolo + marge)) +
                 (nbSoloAm  * (dureeSoloAm + marge)) +
                 (nbBinomePaires * (dureeBinome + marge)); // paires

    const dureeMoyParEleve = cout / nbEleves;

    // Capacité par jury (nb d'élèves qu'un jury peut traiter)
    const capaciteParJury  = Math.floor(minutesUtiles / dureeMoyParEleve);

    if (capaciteParJury <= 0) return { ok: false, erreur: 'Impossible de placer des élèves avec ces paramètres. Vérifiez les durées et la plage horaire.' };

    const nbJurysExact   = nbEleves / capaciteParJury;
    const nbJurysMin     = Math.ceil(nbJurysExact);   // minimum pour tout caser
    const nbJurysConfort = Math.ceil(nbJurysExact * 1.10); // +10% marge

    // Heure de fin estimée si nbJurysMin jurys
    const chargeParJuryMin     = Math.ceil(nbEleves / nbJurysMin);
    const coutParJuryMin       = Math.ceil(chargeParJuryMin * dureeMoyParEleve);
    const heureFinEstimeeMin   = this.ajouterMinutes(
      p.heureDebut,
      coutParJuryMin + totalPauses
    );

    return {
      ok              : true,
      nbEleves,
      nbBinomiques,
      nbBinomePaires,
      nbAmenagement,
      nbPrioritaires,
      nbSolo,
      dureeMoyParEleve: Math.round(dureeMoyParEleve * 10) / 10,
      minutesUtiles,
      dureeSession,
      capaciteParJury,
      nbJurysMin,
      nbJurysConfort,
      chargeParJuryMin,
      heureFinEstimeeMin,
      dureeSolo,
      dureeBinome,
      dureeSoloAm,
      marge,
    };
  },

  /** Normalise un nom pour la comparaison */
  _normNom(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  },

  // ──────────────────────────────────────────────────────────────
  // IMPORT EXCEL — FORMAT RÉEL DU COLLÈGE
  // ──────────────────────────────────────────────────────────────

  /**
   * Normalise une clé de colonne (insensible accents/casse/espaces).
   */
  _normCle(str) {
    return (str || '').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]/g,'');
  },

  /**
   * Trouve la valeur d'une cellule parmi plusieurs alias de noms de colonnes.
   * Stratégie : match exact d'abord, puis match par préfixe (pour les colonnes
   * comme "Enseignant 1 (Civ. NOM)" ou "Enseignant 1 (NOM Prénom)" dont la
   * partie entre parenthèses peut varier selon les versions du fichier Excel).
   */
  _val(row, ...alias) {
    const keys = Object.keys(row);
    for (const a of alias) {
      const k = this._normCle(a);
      // 1. Match exact
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return String(row[k]).trim();
      }
      // 2. Match par préfixe : chercher une clé qui commence par k
      //    Ex. : alias 'enseignant1' matche 'enseignant1civnom', 'enseignant1nomprenom'…
      if (k.length >= 4) {
        const found = keys.find(rk => rk.startsWith(k) && rk !== k);
        if (found !== undefined) {
          const v = row[found];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            return String(v).trim();
          }
        }
      }
    }
    return '';
  },

  /**
   * Convertit une fraction de jour Excel en 'HH:MM'.
   */
  _excelTimeToHHMM(val) {
    if (!val || isNaN(Number(val))) return '';
    const min = Math.round(Number(val) * 24 * 60);
    return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
  },

  /**
   * Parse la colonne "Aménagement" en texte libre.
   * Gère : "tiers temps", "prioritaire", "prioritaire + tiers temps", vide.
   * @returns {{ amenagement: bool, prioritaire: bool }}
   */
  _parseAmenagement(valBrute) {
    const v = this._normCle(valBrute);
    return {
      amenagement : v.includes('tiers') || v.includes('amenag') || v.includes('tierstemp'),
      prioritaire : v.includes('prior'),
    };
  },

  /**
   * Parse le fichier Excel au format réel du collège Joliot Curie.
   *
   * Feuille "Élèves" (rev.3 — NOM et Prénom dans deux colonnes séparées) :
   *   Rang | NOM | Prénom | Classe | Choix Parcours | Sujet | Binôme (NOM Prénom) | Langue vivante | Aménagement
   *   (Fallback : si Prénom absent, on tente de séparer "NOM Prénom" sur le premier espace)
   *
   * Feuille "Jurys" :
   *   N° Jury | Enseignant 1 | Enseignant 2 | Salle | Langue vivante
   *
   * Règle de langue (stricte, rev.3) :
   *   élève Anglais   → jury Anglais uniquement
   *   élève Espagnol  → jury Espagnol uniquement
   *   élève sans langue → jury sans langue UNIQUEMENT
   *   jury sans langue → élèves sans langue UNIQUEMENT (pas "tous")
   *
   * @param {ArrayBuffer} buffer
   * @returns {{ eleves, jurys, avertissements }}
   */
  parseExcel(buffer) {
    const XLSX  = window.XLSX;
    const wb    = XLSX.read(buffer, { type: 'array' });
    const avert = [];

    // ── Normalisation robuste pour la recherche de feuilles ───
    // Supprime accents, diacritiques, tirets, espaces, met en minuscules.
    // Fonctionne quelle que soit la forme Unicode (NFC/NFD) du nom de feuille.
    const normSheet = (str) => (str || '').toString()
      .normalize('NFD')                     // décompose les caractères accentués
      .replace(/[\u0300-\u036f]/g, '')      // supprime les diacritiques
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');           // garde seulement lettres/chiffres

    // ── Trouver les feuilles ──────────────────────────────────
    // Cherche un nom de feuille contenant l'un des mots-clés (normalisés)
    const trouver = (mots) => wb.SheetNames.find(n =>
      mots.some(m => normSheet(n).includes(normSheet(m)))
    );

    // Mots-clés : 'eleve' matchera 'Elèves', 'Élèves', 'ELEVES', 'élève'…
    const nomEleves = trouver(['eleve','candidat','liste']);
    const nomJurys  = trouver(['jury','jurys','enseignant','composition','examinateur']);

    if (!nomEleves) {
      avert.push(`Feuille "Élèves" introuvable. Feuilles présentes : ${wb.SheetNames.join(', ')}`);
    }
    if (!nomJurys) {
      avert.push(`Feuille "Jurys" introuvable. Feuilles présentes : ${wb.SheetNames.join(', ')}`);
    }

    // ── Lire une feuille en tableau de tableaux bruts ────────
    // Retourne { headers: string[], rows: any[][] }
    // headers = ligne d'en-tête réelle (première ligne avec ≥2 mots-clés connus)
    // rows    = lignes de données suivantes (non vides)
    const lireFeuille = (nom) => {
      if (!nom) return { headers:[], rows:[] };
      const ws = wb.Sheets[nom];
      const brut = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
      if (!brut.length) return { headers:[], rows:[] };

      console.log('[DNB Import] Feuille "' + nom + '" — ' + brut.length + ' lignes brutes');
      console.log('[DNB Import] L0:', JSON.stringify(brut[0]));
      console.log('[DNB Import] L1:', JSON.stringify(brut[1]));

      const motsCles = /rang|nom|prenom|pr|classe|jury|enseignant|salle|langue|amenag|binome|sujet|parcours/i;
      let idxHeader = 0;
      for (let i = 0; i < Math.min(brut.length, 5); i++) {
        const nb = brut[i].filter(c => motsCles.test(String(c||''))).length;
        console.log('[DNB Import] L' + i + ' → ' + nb + ' mots-clés');
        if (nb >= 2) { idxHeader = i; break; }
      }

      const headers = brut[idxHeader].map(c => String(c === null || c === undefined ? '' : c));
      const rows    = brut.slice(idxHeader + 1)
                         .filter(r => r.some(c => String(c||'').trim() !== ''));

      console.log('[DNB Import] Headers:', headers);
      console.log('[DNB Import] Nb lignes données:', rows.length);
      if (rows.length > 0) console.log('[DNB Import] Ligne données[0]:', rows[0]);

      return { headers, rows };
    };

    // Trouver l'index d'une colonne parmi plusieurs alias possibles
    const colIdx = (headers, ...aliases) => {
      const nc = s => (s||'').toString().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
      for (const a of aliases) {
        const k = nc(a);
        // Match exact normalisé
        let idx = headers.findIndex(h => nc(h) === k);
        if (idx >= 0) return idx;
        // Match préfixe normalisé (pour "Enseignant 1 (Civ. NOM)" vs "enseignant1")
        if (k.length >= 4) {
          idx = headers.findIndex(h => nc(h).startsWith(k));
          if (idx >= 0) return idx;
        }
      }
      return -1;
    };

    // Valeur d'une cellule par index de colonne (-1 = absent)
    const cellVal = (row, idx) => {
      if (idx < 0 || idx >= row.length) return '';
      const v = row[idx];
      if (v === null || v === undefined) return '';
      return String(v).trim();
    };

    // ── Élèves ─────────────────────────────────────────────────
    const { headers: hE, rows: rowsEleves } = lireFeuille(nomEleves);
    const eleves = [];

    // Trouver les index des colonnes Élèves une seule fois
    const iE = {
      nom      : colIdx(hE, 'nom', 'name'),
      prenom   : colIdx(hE, 'prénom', 'prenom', 'firstname'),
      classe   : colIdx(hE, 'classe', 'class', 'group', 'niveau'),
      langue   : colIdx(hE, 'langue vivante', 'langue', 'lv', 'language'),
      sujet    : colIdx(hE, 'sujet', 'titre', 'thème', 'theme', 'subject'),
      parcours : colIdx(hE, 'choix parcours', 'parcours', 'type'),
      binome   : colIdx(hE, 'binôme', 'binome', 'duo', 'partenaire', 'binom'),
      amenag   : colIdx(hE, 'aménagement', 'amenagement', 'tiers'),
    };
    console.log('[DNB Import] Index colonnes Élèves:', iE);

    rowsEleves.forEach(row => {
      let nom    = cellVal(row, iE.nom);
      let prenom = cellVal(row, iE.prenom);

      // Fallback : tout dans une seule colonne
      if (!nom && !prenom) {
        const complet = cellVal(row, colIdx(hE, 'nom prénom', 'nomprenom', 'eleve', 'candidat'));
        if (complet) {
          const parts = complet.trim().split(/\s+/);
          nom = parts[0]; prenom = parts.slice(1).join(' ');
        }
      }
      if (nom && !prenom && nom.includes(' ')) {
        const parts = nom.trim().split(/\s+/);
        nom = parts[0]; prenom = parts.slice(1).join(' ');
      }

      // Ignorer uniquement les lignes de titre (valeur exacte 'nom', 'rang',
      // ou ligne titre genre 'ORAL DNB 2025…') — PAS les vrais noms d'élèves
      const nomTrim = nom.trim();
      if (!nomTrim) return;
      const nomLower = nomTrim.toLowerCase();
      if (nomLower === 'nom' || nomLower === 'rang' ||
          nomLower === 'name' || nomLower === 'élève' ||
          nomLower.startsWith('oral dnb')) return;

      const { amenagement, prioritaire } = this._parseAmenagement(cellVal(row, iE.amenag));
      const langueRaw = cellVal(row, iE.langue);
      const langue = langueRaw ? langueRaw.charAt(0).toUpperCase() + langueRaw.slice(1).toLowerCase() : '';

      eleves.push({
        nom        : nom.trim().toUpperCase(),
        prenom     : prenom.trim(),
        classe     : cellVal(row, iE.classe),
        langue,
        sujet      : cellVal(row, iE.sujet),
        parcours   : cellVal(row, iE.parcours),
        binomeAvec : cellVal(row, iE.binome),
        amenagement,
        prioritaire,
      });
    });

    // ── Jurys ──────────────────────────────────────────────────
    // ── Jurys ──────────────────────────────────────────────────
    const { headers: hJ, rows: rowsJurys } = lireFeuille(nomJurys);
    const jurys = [];

    // Trouver les index des colonnes Jurys une seule fois
    const iJ = {
      ens1   : colIdx(hJ, 'enseignant1', 'enseignant 1', 'professeur1', 'professeur 1', 'prof1', 'enseignant'),
      ens2   : colIdx(hJ, 'enseignant2', 'enseignant 2', 'professeur2', 'professeur 2', 'prof2'),
      salle  : colIdx(hJ, 'salle', 'room', 'local'),
      langue : colIdx(hJ, 'langue vivante', 'langue', 'lv', 'language'),
      heure  : colIdx(hJ, 'heure', 'heure de début', 'début', 'debut', 'start'),
    };
    console.log('[DNB Import] Index colonnes Jurys:', iJ);
    console.log('[DNB Import] Headers Jurys:', hJ);

    rowsJurys.forEach((row, ri) => {
      const ens1 = cellVal(row, iJ.ens1);
      const ens2 = cellVal(row, iJ.ens2);
      console.log('[DNB Import] Jury row ' + ri + ': ens1=' + ens1 + ' ens2=' + ens2);

      if (!ens1) return;

      const nomJury = ens2 ? `${ens1} / ${ens2}` : ens1;

      let heureDebut = cellVal(row, iJ.heure);
      if (heureDebut && !heureDebut.includes(':')) {
        heureDebut = this._excelTimeToHHMM(heureDebut);
      }
      heureDebut = heureDebut || this.params.heureDebut;

      const salle = cellVal(row, iJ.salle);

      const langueRaw = cellVal(row, iJ.langue);
      const langue = langueRaw
        ? langueRaw.charAt(0).toUpperCase() + langueRaw.slice(1).toLowerCase()
        : '';

      jurys.push({ nom: nomJury, matiere: '', langue, salle, heureDebut, capacite: 0 });
    });

    console.log('[DNB Import] rowsJurys.length =', rowsJurys.length);
    if (rowsJurys.length > 0) console.log('[DNB Import] rowsJurys[0] =', JSON.stringify(rowsJurys[0]));
    console.log('[DNB Import] jurys parsés =', jurys.length, jurys.map(j=>j.nom));
    console.log('[DNB Import] eleves parsés =', eleves.length);

    if (eleves.length === 0) avert.push('Aucun élève valide trouvé. Vérifiez les colonnes de la feuille Élèves.');
    if (jurys.length  === 0) avert.push('Aucun jury valide trouvé. Vérifiez les colonnes de la feuille Jurys.');

    return { eleves, jurys, avertissements: avert };
  },

  /**
   * Importe le fichier Excel dans AppData (remplace tout).
   */
  importerExcel(buffer) {
    const { eleves, jurys, avertissements } = this.parseExcel(buffer);
    this.eleves      = [];
    this.jurys       = [];
    this.affectation = [];
    this._nextEleveId = 1;
    this._nextJuryId  = 1;

    jurys.forEach(j  => this.addJury(j));
    eleves.forEach(e => this.addEleve(e));

    return { nbEleves: eleves.length, nbJurys: jurys.length, avertissements };
  },

  // ──────────────────────────────────────────────────────────────
  // EXPORT EXCEL — avec affectations
  // ──────────────────────────────────────────────────────────────

  exporterExcel() {
    const XLSX = window.XLSX;
    const wb   = XLSX.utils.book_new();

    // ── Feuille Affectation ────────────────────────────────────
    const rowsAff = [['Jury','Salle','#','Début','Fin','Durée','Élève(s)','Classe','Langue','Aménagement','Prioritaire','Binôme','Sujet','Parcours']];
    this.affectation.forEach(c => {
      const jury = this.getJury(c.juryId);
      const noms = c.eleveIds.map(id => { const e=this.getEleve(id); return e?`${e.nom} ${e.prenom}`:'?'; }).join(' + ');
      const classes = c.eleveIds.map(id => this.getEleve(id)?.classe||'').join('/');
      const langues = c.eleveIds.map(id => this.getEleve(id)?.langue||'').filter(Boolean).join('/');
      const sujets  = c.eleveIds.map(id => this.getEleve(id)?.sujet ||'').filter(Boolean).join(' / ');
      const parcours= c.eleveIds.map(id => this.getEleve(id)?.parcours||'').filter(Boolean).join('/');
      const e0      = this.getEleve(c.eleveIds[0]);
      rowsAff.push([
        jury?jury.nom:'', jury?jury.salle:'', c.ordre,
        c.heureDebut, c.heureFin, c.duree, noms, classes, langues,
        e0&&e0.amenagement?'Oui':'', e0&&e0.prioritaire?'Oui':'', c.isBinome?'Oui':'',
        sujets, parcours,
      ]);
    });
    const wsAff = XLSX.utils.aoa_to_sheet(rowsAff);
    wsAff['!cols'] = [25,8,5,8,8,7,30,10,10,12,10,8,35,15].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, wsAff, 'Affectation');

    // ── Feuille Élèves ─────────────────────────────────────────
    const rowsEl = [['Nom','Prénom','Classe','Langue','Parcours','Sujet','Aménagement','Prioritaire','Binôme','Jury','Salle','Heure convocation','Heure passage']];
    this.eleves.forEach(e => {
      const c    = this.affectation.find(x => x.eleveIds.includes(e.id));
      const jury = c ? this.getJury(c.juryId) : null;
      rowsEl.push([
        e.nom, e.prenom, e.classe, e.langue, e.parcours, e.sujet,
        e.amenagement?'Oui':'', e.prioritaire?'Oui':'', e.binomeAvec,
        jury?jury.nom:'Non affecté', jury?jury.salle:'',
        c ? this.soustraireMinutes(c.heureDebut, this.params.convocAvant) : '',
        c ? c.heureDebut : '',
      ]);
    });
    const wsEl = XLSX.utils.aoa_to_sheet(rowsEl);
    wsEl['!cols'] = [16,14,8,10,15,35,12,10,16,22,8,14,12].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, wsEl, 'Élèves');

    // ── Feuille Jurys ──────────────────────────────────────────
    const rowsJu = [['Jury','Langue','Salle','Début','Capacité calculée','Nb affectés']];
    this.jurys.forEach(j => {
      const nbAff = this.affectation.filter(c=>c.juryId===j.id).reduce((s,c)=>s+c.eleveIds.length,0);
      rowsJu.push([j.nom, j.langue, j.salle, j.heureDebut, j.capacite, nbAff]);
    });
    const wsJu = XLSX.utils.aoa_to_sheet(rowsJu);
    wsJu['!cols'] = [28,12,8,10,16,12].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, wsJu, 'Jurys');

    const date = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Oral_DNB_Affectation_${date}.xlsx`);
  },

  // ──────────────────────────────────────────────────────────────
  // IMPORT / EXPORT JSON
  // ──────────────────────────────────────────────────────────────

  exporterJSON() {
    const snap = {
      meta        : { version:'3.0', exportedAt:new Date().toISOString(), outil:'Gestion Oral DNB' },
      params      : this.params,
      jurys       : this.jurys,
      eleves      : this.eleves,
      affectation : this.affectation,
      _nextJuryId  : this._nextJuryId,
      _nextEleveId : this._nextEleveId,
    };
    const blob = new Blob([JSON.stringify(snap,null,2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {href:url, download:`oral-dnb-${new Date().toISOString().slice(0,10)}.json`});
    a.click(); URL.revokeObjectURL(url);
  },

  importerJSON(data) {
    if (!data||typeof data!=='object') return 'Fichier JSON invalide.';
    if (!data.meta||data.meta.outil!=='Gestion Oral DNB') return 'Ce fichier ne provient pas de cet outil.';
    if (data.params)       Object.assign(this.params, data.params);
    if (Array.isArray(data.jurys))       this.jurys       = data.jurys;
    if (Array.isArray(data.eleves))      this.eleves      = data.eleves;
    if (Array.isArray(data.affectation)) this.affectation = data.affectation;
    if (data._nextJuryId)  this._nextJuryId  = data._nextJuryId;
    if (data._nextEleveId) this._nextEleveId = data._nextEleveId;
    return null;
  },

  // ──────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────

  nbJurys()  { return this.jurys.length; },
  nbEleves() { return this.eleves.length; },

  saveParams(fields) {
    this.params.etablissement = (fields.etablissement||'').trim();
    this.params.annee         = (fields.annee||'').trim();
    this.params.lieuSignature = (fields.lieuSignature||'').trim();
    this.params.typeEpreuve   = fields.typeEpreuve || 'DNB';
    this.params.dateEpreuve   = (fields.dateEpreuve||'').trim();
    this.params.dureeSolo     = parseInt(fields.dureeSolo,  10)||25;
    this.params.dureeBinome   = parseInt(fields.dureeBinome,10)||35;
    // Pauses 1, 2, 3
    if (Array.isArray(fields.pauses)) {
      this.params.pauses = fields.pauses.map(p => ({
        active : !!p.active,
        heure  : p.heure  || '12:00',
        duree  : parseInt(p.duree, 10) || 0,
      }));
    }
    this.params.convocAvant   = parseInt(fields.convocAvant,10)||15;
    this.params.heureDebut    = fields.heureDebut  ||'08:00';
    this.params.heureFin      = fields.heureFin    ||'17:00';
    this.params.margePassage  = parseInt(fields.margePassage,10)||0;
  },

  reset() {
    this.params      = { etablissement:'Collège Joliot Curie — Bagneux', annee:'2025-2026',
                         lieuSignature:'Bagneux', typeEpreuve:'DNB', dateEpreuve:'',
                         dureeSolo:25, dureeBinome:35,
                         pauses:[
                           {active:true, heure:'10:00', duree:15},
                           {active:true, heure:'12:00', duree:60},
                           {active:false,heure:'15:00', duree:15},
                         ],
                         convocAvant:15, heureDebut:'08:00', heureFin:'17:00', margePassage:0 };
    this.jurys       = [];
    this.eleves      = [];
    this.affectation = [];
    this._nextJuryId  = 1;
    this._nextEleveId = 1;
  },
};

window.AppData = AppData;


// ══════════════════════════════════════════════════════════════
// MODÈLE EXCEL — encodé en base64, téléchargeable sans serveur
// ══════════════════════════════════════════════════════════════

const MODELE_XLSX_B64 = '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';

function telechargerModeleExcel() {
  try {
    const bin  = atob(MODELE_XLSX_B64);
    const arr  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href     : url,
      download : 'DNB_Oral_Modele.xlsx',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    console.error('[Modèle Excel] Erreur :', e);
    if (typeof notifier === 'function') notifier('Impossible de générer le modèle.', 'error');
  }
}
window.telechargerModeleExcel = telechargerModeleExcel;
