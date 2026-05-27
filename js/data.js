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

    // ── Convertir une feuille en tableau d'objets normalisés ──
    //
    // Stratégie robuste pour les fichiers ayant une ligne de titre en ligne 1
    // ("ORAL DNB 2025-2026…") et les vrais en-têtes en ligne 2 :
    //
    // 1. On lit TOUTES les lignes avec header:1 (tableau brut, pas d'objet).
    // 2. On cherche la première ligne qui ressemble à des en-têtes de colonnes
    //    (contient des mots comme "Nom", "Rang", "Jury", "Enseignant"…).
    // 3. On utilise cette ligne comme en-têtes et les suivantes comme données.
    //
    // Cette approche fonctionne quelle que soit la version de SheetJS et quel
    // que soit le nombre de lignes de titre au-dessus des vraies données.
    const feuilleEnObjets = (nom) => {
      if (!nom) return [];
      const ws = wb.Sheets[nom];

      // Lecture brute : header:1 retourne un tableau de tableaux
      const brut = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
      if (!brut.length) return [];

      console.log(`[DNB Import] Feuille "${nom}" — ${brut.length} lignes brutes`);
      console.log(`[DNB Import] Ligne 0:`, brut[0]);
      console.log(`[DNB Import] Ligne 1:`, brut[1]);

      // Mots-clés qui signalent une ligne d'en-tête de données réelles
      const motsClesEntete = /rang|nom|pr.?nom|classe|jury|enseignant|salle|langue|amenag|binome|sujet|parcours|n.*jury/i;

      // Trouver l'index de la ligne d'en-tête (première ligne qui contient
      // au moins 2 cellules correspondant à des mots-clés)
      let idxEntete = 0;
      for (let i = 0; i < Math.min(brut.length, 5); i++) {
        const ligne = brut[i];
        const nb = ligne.filter(c => motsClesEntete.test(String(c || ''))).length;
        console.log(`[DNB Import] Ligne ${i} → ${nb} mots-clés trouvés`);
        if (nb >= 2) { idxEntete = i; break; }
      }

      console.log(`[DNB Import] En-tête détecté à la ligne ${idxEntete}:`, brut[idxEntete]);

      // Les en-têtes sont à idxEntete, les données commencent à idxEntete+1
      const entetes = brut[idxEntete].map(c => this._normCle(String(c || '')));
      const lignesDonnees = brut.slice(idxEntete + 1);

      console.log(`[DNB Import] Clés normalisées:`, entetes);
      console.log(`[DNB Import] Première ligne de données:`, lignesDonnees[0]);

      // Construire les objets {clé_normalisée: valeur}
      return lignesDonnees
        .filter(ligne => ligne.some(c => String(c || '').trim() !== '')) // ignorer lignes vides
        .map(ligne => {
          const r = {};
          entetes.forEach((cle, i) => {
            if (cle) r[cle] = ligne[i] !== undefined ? ligne[i] : '';
          });
          return r;
        });
    };

    // ── Élèves ─────────────────────────────────────────────────
    const rowsEleves = feuilleEnObjets(nomEleves);
    const eleves = [];

    rowsEleves.forEach((row) => {
      // Rev.3 : NOM et Prénom dans deux colonnes séparées
      // Priorité : colonnes distinctes → fallback colonne unique "NOM Prénom"
      let nom    = this._val(row, 'nom', 'name');
      let prenom = this._val(row, 'prénom', 'prenom', 'firstname');

      // Fallback : tout dans une seule colonne "NOM Prénom" ou "NOM prénom"
      if (!prenom && !nom) {
        const nomComplet = this._val(row, 'nom prénom', 'nomprenom', 'eleve', 'candidat');
        if (nomComplet) {
          const parts = nomComplet.trim().split(/\s+/);
          nom    = parts[0] || '';
          prenom = parts.slice(1).join(' ');
        }
      }
      // Cas où "nom" contient en réalité "NOM Prénom" (ancienne version Excel)
      if (nom && !prenom && nom.includes(' ')) {
        const parts = nom.trim().split(/\s+/);
        nom    = parts[0];
        prenom = parts.slice(1).join(' ');
      }

      // Ignorer les lignes de titre ou vides
      const nomNorm = nom.toLowerCase();
      if (!nom || nomNorm === 'nom' || nomNorm === 'rang' || nomNorm.startsWith('oral')) return;

      const amenCol = this._val(row, 'aménagement','amenagement','aménagements','tiers','amenag');
      const { amenagement, prioritaire } = this._parseAmenagement(amenCol);

      // Normaliser la langue : capitaliser la première lettre, trim
      const langueRaw = this._val(row, 'langue vivante', 'languevivante', 'langue', 'lv', 'language');
      const langue = langueRaw ? langueRaw.charAt(0).toUpperCase() + langueRaw.slice(1).toLowerCase() : '';

      eleves.push({
        nom    : nom.trim().toUpperCase(),
        prenom : prenom.trim(),
        classe   : this._val(row, 'classe', 'class', 'group', 'niveau'),
        langue,
        sujet    : this._val(row, 'sujet', 'titre', 'thème', 'theme', 'subject'),
        parcours : this._val(row, 'choix parcours', 'parcours', 'type'),
        binomeAvec : this._val(row, 'binôme', 'binome', 'duo', 'partenaire', 'binôme (nom prénom)', 'binom'),
        amenagement,
        prioritaire,
      });
    });

    // ── Jurys ──────────────────────────────────────────────────
    const rowsJurys = feuilleEnObjets(nomJurys);
    const jurys = [];

    rowsJurys.forEach((row) => {
      // 'enseignant1' matchera 'enseignant1civnom', 'enseignant1nomprenom', etc.
      // via le match par préfixe de _val
      const ens1 = this._val(row,
        'enseignant1', 'enseignant 1', 'professeur1', 'professeur 1', 'prof1', 'enseignant', 'nom');
      const ens2 = this._val(row,
        'enseignant2', 'enseignant 2', 'professeur2', 'professeur 2', 'prof2');

      // Ignorer lignes vides et ligne de titre ("Enseignant 1", "N° Jury"…)
      if (!ens1) return;
      const ens1Norm = ens1.toLowerCase();
      if (ens1Norm.startsWith('enseignant') || ens1Norm.startsWith('n°') ||
          ens1Norm.startsWith('jury') || ens1Norm === 'nom') return;

      const nomJury = ens2 ? `${ens1} / ${ens2}` : ens1;

      // Heure : fraction Excel ou HH:MM
      let heureDebut = this._val(row, 'heure', 'heure de début', 'heuredebut', 'début', 'debut', 'start');
      if (heureDebut && !heureDebut.includes(':')) {
        heureDebut = this._excelTimeToHHMM(heureDebut);
      }
      heureDebut = heureDebut || this.params.heureDebut;

      const salle = this._val(row, 'salle', 'room', 'local', 'n° salle', 'numero salle');

      // Normaliser la langue : même casse que les élèves (première lettre majuscule)
      const langueRaw = this._val(row, 'langue vivante', 'languevivante', 'langue', 'lv', 'language');
      const langue = langueRaw
        ? langueRaw.charAt(0).toUpperCase() + langueRaw.slice(1).toLowerCase()
        : '';

      jurys.push({
        nom     : nomJury,
        matiere : this._val(row, 'matière', 'matiere', 'discipline', 'subject'),
        langue,   // '' = jury sans langue → élèves sans langue UNIQUEMENT (règle stricte)
        salle,
        heureDebut,
        capacite : 0,   // calculé automatiquement par le moteur
      });
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
