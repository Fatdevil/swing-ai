# ⛳ GOLF SWING AI — Kravspecifikation v1.0

**Mars 2026 | Status: Utkast | Licens: Proprietär – kommersiell**

---

## 1. Introduktion och vision

Golf Swing AI är en mobil- och webbapplikation som kombinerar **MediaPipe Pose Estimation** och **Claude AI** för att leverera professionell golfcoaching till amatörgolfare.

### 1.1 Produktvision
- Användaren filmar sin sving – appen analyserar och coachar. Tre steg, direkt värde.
- Kvaliteten ska överstiga en genomsnittlig driving range-lektion.
- Trovärdig för seriösa golfare och enkel för nybörjare.

### 1.2 Målgrupp

| Segment | Beskrivning | Primärt behov |
|---------|-------------|---------------|
| Amatörgolfare | Handicap 10–36, spelar 1–3 ggr/vecka | Förstå och fixa tekniska fel |
| Engagerade golfare | Handicap under 10, tränar regelbundet | Progressionsspårning och målanpassad coaching |
| Nybörjare | 0–2 år på banan | Grundteknik och tidiga vanor |
| Driving range-besökare | Tränar utan coach | Omedelbar feedback på plats |

---

## 2. Produktstruktur och användarflöden

### 2.1 Tvåspårsmodell

| | Huvudspår – Snabbanalys | Målspår – Personlig coaching |
|-|--------------------------|------------------------------|
| Syfte | Direkt analys utan förberedelse | Progressionsdrivet träningsprogram |
| Entrypoint | Direkt vid appstart | Via meny/inställningar |
| Kräver profil | Nej | Ja |
| Analystid | Under 15 sekunder | 20–30 sekunder |
| Målgrupp | Alla användare | Engagerade/betalande användare |
| Affärsmodell | Gratis / freemium | Premium-abonnemang |

### 2.2 Huvudspår – Snabbanalys (Happy Path)

**Flöde: Bild → Analys → Resultat**
1. Användaren öppnar appen – kamera-knapp är första synliga element
2. Foto tas direkt med bakåtkamera ELLER väljs från galleri
3. Valfritt – välj kameravinkel (sida / framifrån / down-the-line)
4. Knapp 'Analysera pose' – MediaPipe detekterar skelett och mäter vinklar
5. Knapp 'Få coaching' – mätvärden + bild skickas till Claude Sonnet 4.6
6. Resultat visas med totalpoäng, 5 kategorier och konkreta tips

**Mål: Under 15 sekunder från appstart till första insikt**

### 2.3 Målspår – Personlig coaching

- Onboarding: Tre enkla frågor – handicap, primärt problem, önskad coachingstil
- Claude summerar svaren till ett 'coachinguppdrag' som sparas i profilen
- Alla analyser i målspåret tolkas mot det sparade uppdraget
- Historik och progressionsgraf tillgänglig per kategori

**Coachingstilar:**

| Stil | Beskrivning | Exempelinstruktion |
|------|-------------|-------------------|
| Minimal förändring | Behåll nuvarande sving, korrigera specifika fel | Bli av med slicen med så få ändringar som möjligt |
| Referensmodell | Anpassa svingen mot känd tourespelares teknik | Bygg om svingen mot Rory McIlroys teknik |
| Grundrekonstruktion | Bygg om svingen från grunden | Starta om med korrekt grundteknik |
| Fri text | Användaren formulerar eget mål | Valfri instruktion på svenska eller engelska |

### 2.4 Fristående analys (Gästläge)

Möjlighet att analysera en annan persons sving utan att det påverkar den inloggade användarens mål eller historik. Aktiveras via en enkel toggle.

---

## 3. Teknisk arkitektur

### 3.1 Systemöversikt

| Komponent | Teknik |
|-----------|--------|
| Frontend | React (JSX) – körs som webbapp i mobilwebbläsare |
| Pose estimation | MediaPipe Pose 0.5 – körs lokalt i webbläsaren (Apache 2.0) |
| AI-analys | Claude Sonnet 4.6 via Anthropic API |
| Lagring | window.storage API (persistent) |
| Kamera | Native HTML label+input med capture='environment' |
| Backend | Ingen – all logik client-side eller Anthropic API direkt |

### 3.2 Analysflöde

| Steg | Komponent | Input | Output | Kostnad |
|------|-----------|-------|--------|---------|
| 1 | Kamera/galleri | Användarinteraktion | Bildfil (JPG/PNG) | Gratis |
| 2 | MediaPipe Pose | Bildfil | 33 landmärkeskoordinater | Gratis |
| 3 | Vinkelberäkning (JS) | Koordinater | 7 mätvärden i grader | Gratis |
| 4 | Claude Sonnet 4.6 | Bild + mätvärden + mål | Strukturerad coaching (JSON) | ~$0.05 |
| 5 | UI-rendering | JSON-svar | Visuellt resultat | Gratis |
| 6 | Storage API | Analys + poäng | Sparad historik | Gratis |

### 3.3 MediaPipe-mätvärden

| Mätvärde | Idealvärde | Beskrivning |
|----------|------------|-------------|
| Ryggradens lutning | 35–45° | Vinkel mot vertikalaxeln vid adress |
| Axelrotation (tilt) | Mäts vid topp | Axlarnas rotationsvinkel |
| Höfttilt | Mäts vid impact | Höfternas rotationsvinkel |
| Ledande knä | 140–160° | Knävinkel på ledande sida |
| Bakre knä | 140–160° | Knävinkel på bakre sida |
| X-faktor | 45–60° | Skillnad axelrot. vs höftrot. |
| Huvud lateral offset | Nära 0% | Sidorörelse av huvud under svingen |

### 3.4 Analyslägen

| Läge | Input | Analysdjup | Kostnad | Tillgänglighet |
|------|-------|------------|---------|----------------|
| Snabbanalys | 1 stillbild | 5 kategorier + totalpoäng | ~$0.05 | Gratis |
| Fullanalys (v2) | Video – 8 nyckelframes | Teknik + tempo + sekvens | ~$0.05 | Premium |
| Fristående analys | 1 stillbild | Samma som snabbanalys | ~$0.05 | Gratis |

> **Obs:** Klubbhastighet via kamera stöds INTE – noggrannheten (±15%) underminerar trovärdigheten.

---

## 4. Funktionskrav

### 4.1 Kärnfunktioner (Fas 1 – MVP)

**F1 – Bilduppladdning**
- Kamera-knapp öppnar bakåtkamera direkt på Android och iOS
- Galleri-knapp öppnar fotobibliotek
- Drag & drop stöds på desktop
- Stödda format: JPG, PNG
- Implementeras med label+input-pattern (ej JS .click()) för Android-kompatibilitet

**F2 – MediaPipe Pose-analys**
- Skelett-overlay ritas på bilden med gröna linjer och gula joints
- 7 mätvärden beräknas och visas med referensvärden
- Visuella mätstakar visar avvikelse från idealvärde
- Fallback: om MediaPipe misslyckas körs ren Claude-analys

**F3 – AI-coaching via Claude Sonnet 4.6**
- System-prompt specificerar PGA-coach-persona
- Mätvärden från MediaPipe inkluderas i prompt för precision
- Strukturerat JSON-svar med 5 kategorier, tips, totalpoäng och handicap-uppskattning
- Kameravinkel anges av användaren för mer precis analys
- Svar på svenska och engelska – användaren väljer språk

**F4 – Resultatvy**
- Totalpoäng (1–10) med cirkulär poängindikator och färgkodning
- Uppskattat handicap baserat på svingen
- 5 expanderbara kategorikort: Setup, Backswing, Impact, Follow-through, Balans
- Prioriterat fokus (viktigaste att jobba på)
- Rekommenderad övning (specifik drill)

**F5 – Analyshistorik**
- Sparas automatiskt i window.storage (persistent mellan sessioner)
- Visar miniatyrbild, totalpoäng och datum
- Klick på historikpost laddar tidigare analys
- Max 20 analyser sparas

**F6 – Flerspråksstöd**
- Svenska och engelska stöds fullt ut
- Språkval via tydlig toggle i header
- Alla AI-svar genereras på valt språk

### 4.2 Utökade funktioner (Fas 2 – Premium)

| Funktion | Beskrivning | Prioritet |
|----------|-------------|-----------|
| Målspår / Coachingprofil | Sparade mål styr alla analyser | Hög |
| Videoanalys | 8 nyckelframes + tempomätning | Hög |
| Tempomätning | Backswing/nedslag-ratio mot 3:1-ideal | Hög |
| Progressionsgraf | Poängutveckling per kategori över tid | Medium |
| Referensmodeller | Analys mot tourespelares nyckelvärden | Medium |
| Fristående analysläge | Analysera andras svingar utan att påverka profil | Medium |
| Delningsfunktion | Exportera analys som bild/PDF | Låg |
| Push-notiser | Påminnelse om träning baserat på mål | Låg |

---

## 5. Icke-funktionella krav

### 5.1 Prestanda
- MediaPipe-laddning: under 5 sekunder på 4G
- Pose-detektion: under 3 sekunder per bild
- Claude API-svar: under 8 sekunder (p95)
- Total tid uppladdning → resultat: under 15 sekunder

### 5.2 Kompatibilitet

| Plattform | Webbläsare | Krav |
|-----------|------------|------|
| Android | Chrome, Samsung Internet | Kamera + galleri funktionellt |
| iOS | Safari, Chrome | Kamera + galleri funktionellt |
| Desktop | Chrome, Firefox, Safari, Edge | Drag & drop, galleri |

### 5.3 Säkerhet och integritet
- Inga bilder lagras på server – all bildhantering client-side
- API-nyckel hanteras server-side eller via säker proxy
- Användardata lagras lokalt i webbläsaren
- GDPR-kompatibel: ingen persondata utan samtycke

### 5.4 Tillgänglighet
- Textstorlek minimum 12pt
- Knappar minimum 44×44px tryckyta
- Färgkodning kompletteras alltid med text

---

## 6. Affärsmodell

### 6.1 Freemium-modell

| Nivå | Pris | Innehåll |
|------|------|----------|
| Gratis | 0 kr/mån | Snabbanalys, 5 analyser/månad, historik 10 analyser, SV/EN |
| Premium | TBD kr/mån | Obegränsade analyser, målspår, videoanalys, tempo, progression |
| Pro (framtida) | TBD kr/mån | Allt i Premium + API-access, white-label, coachverktyg |

### 6.2 Kostnad per analys: ~$0.06

### 6.3 Licensiering
- **MediaPipe Pose**: Apache 2.0 – gratis kommersiellt
- **Claude Sonnet 4.6**: API pay-per-use
- **React**: MIT – gratis
- **YOLOv8**: AGPL-3.0 – ANVÄNDS EJ (kräver Enterprise-licens ~$5000/år)

---

## 7. Implementationsplan

### Fas 1 – MVP
- Bilduppladdning via kamera och galleri
- MediaPipe Pose med skelett-overlay och 7 mätvärden
- Claude Sonnet 4.6-integration med JSON-svar
- 5-kategoriers resultatvy med poäng och tips
- Analyshistorik med persistent lagring
- Flerspråksstöd (SV/EN)
- Kameravinkel-val

### Fas 2 – Premium
- Målspår: onboarding, coachingprofil, målanpassade analyser
- Videoanalys: frame-extraktion, tempomätning (3:1-ratio)
- Progressionsgraf per kategori
- Referensmodeller (Rory, Tiger m.fl.)
- Betalningssystem (Stripe)
- Fristående analysläge

### Fas 3 – Skalning
- Native mobilapp (React Native eller PWA)
- Backend-infrastruktur för användarhantering
- Coachverktyg
- API för golfklubbsplattformar

---

## 8. Risker och begränsningar

| Risk | Sannolikhet | Åtgärd |
|------|-------------|--------|
| MediaPipe misslyckas ladda | Medium | Fallback till ren Claude-analys |
| Dålig bildkvalitet | Hög | Tydlig instruktion + felmeddelande |
| Trovärdighet ifrågasätts | Medium | Transparent om begränsningar |
| API-kostnader skenar | Låg | Rate limiting, prompt caching |
| iOS Safari-kompatibilitet | Medium | label+input-pattern |

### Medvetet exkluderat
- Klubbhastighetsmätning via kamera (±15% noggrannhet)
- Spinmätning (kräver launch monitor)
- Realtidsanalys under sving (Fas 3)
- Social delning och leaderboards (Fas 3)

---

## 9. Driftsättning och infrastruktur

### 9.1 Strategi per fas

| Fas | Användare | Arkitektur | Kostnad/mån |
|-----|-----------|------------|-------------|
| MVP | 0–100 | Client-side + Vercel Edge proxy | ~$0 |
| Fas 1 | 100–1 000 | Vercel + Supabase + Stripe | ~$30–155 |
| Fas 2 | 1 000–10 000 | Samma stack, skalad | ~$155–1 600 |
| Fas 3 | 10 000+ | Dedikerad backend | Beräknas separat |

### 9.2 Stack (Fas 1)
- **Frontend & hosting**: Vercel (CDN, auto-deploy från GitHub)
- **Databas & auth**: Supabase (PostgreSQL, Google/Apple auth)
- **Fillagring**: Supabase Storage (S3-kompatibelt)
- **API-proxy**: Vercel Edge Functions (håller Anthropic-nyckel säker)
- **Betalning**: Stripe
- **Versionskontroll**: GitHub (privat repo)

### 9.3 Databasschema

| Tabell | Nyckelkolumner | Syfte |
|--------|---------------|-------|
| users | id, email, plan, skapad | Användarhantering |
| analyses | id, user_id, bild_url, mätvärden, svar, poäng, timestamp | Analyshistorik |
| coaching_profiles | user_id, mål_text, coachingstil, referensmodell | Coachingmål |
| usage | user_id, månad, antal_analyser | Rate limiting |

### 9.4 Säkerhet
- API-nyckel ALDRIG i frontend/GitHub — Vercel miljövariabel
- Supabase JWT-autentisering före varje API-anrop
- Rate limiting per användare och plan
- .env.local för lokala nycklar, aldrig i Git

### 9.5 Skalningsstrategi
- Prompt caching: upp till 90% lägre inputkostnad
- Freemium-gränser kontrollerar API-kostnader
- MediaPipe CDN-caching efter första laddning
- Bildkomprimering client-side
