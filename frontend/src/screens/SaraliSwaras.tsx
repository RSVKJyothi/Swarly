import { useState } from "react";
import { useRef } from "react";
import { SARALI_VARIATIONS, getSwaraLabel } from "../data/saraliSwaras";
import type { BeatGroup, Cycle, Script } from "../data/saraliSwaras";
import { getSingingGuide, startSession } from "../audio/saraliPlayback";
import type { PlaybackHandle } from "../audio/saraliPlayback";
type Kaalam = 1 | 2 | 3;
type View = "theory" | "practice";
const KAALAM_LABELS: Record<Kaalam, string> = {
  1: "Prathama Kaalam",
  2: "Dwitheeya Kaalam",
  3: "Thritheeya Kaalam",
};

const KAALAM_SPEED: Record<Kaalam, string> = {
  1: "1 swara / beat",
  2: "2 swaras / beat",
  3: "4 swaras / beat",
};

const SCRIPT_LABELS: Record<Script, string> = {
  te: "తెలుగు",
  en: "English",
};

// ── Theory sections ───────────────────────────────────────────────────────────
const THEORY_SECTIONS = [
  {
    id: "swara",
    title: "స్వరం అంటే ఏమిటి?",
    subtitle: "What is a Swara?",
    icon: "🎵",
    content: [
      {
        te: '"స్వతో రంజయతి ఇతి స్వరః" — ఏ శబ్దం అయితే తనంతట తానుగా వినేవారి మనస్సుకు ఆనందాన్ని కలిగిస్తుందో, దాన్నే స్వరం అంటారు.',
        en: '"Svato Ranjayati Iti Svarah" — A note that by itself brings joy to the listener\'s heart is called a Swara.',
      },
      {
        te: 'కర్ణాటక సంగీతానికి ప్రాణాధారం సప్తస్వరాలు — 7 స్వరాలు. ఇవి కేవలం శబ్దాలు కావు, ప్రకృతిలోని వివిధ జీవుల నాదాల నుండి ఉద్భవించినవి.',
        en: 'The foundation of Carnatic music is the Sapta Swaras — 7 notes. These are not just sounds. Each swara is said to have originated from the call of a creature in nature.',
      },
    ],
    table: [
      { swara: "స (Sa)", full: "షడ్జమము", source: "నెమలి (Peacock)", meaning: "అన్ని స్వరాలకు ఆధారం — the home note" },
      { swara: "రి (Re)", full: "రిషభము", source: "ఎద్దు (Bull)", meaning: "గాంభీర్యానికి, పట్టుదలకు ప్రతీక" },
      { swara: "గ (Ga)", full: "గాంధారము", source: "మేక (Goat)", meaning: "సాత్విక భావనను, ఆర్ద్రతను సూచిస్తుంది" },
      { swara: "మ (Ma)", full: "మధ్యమము", source: "క్రౌంచ పక్షి", meaning: "సప్తస్వరాల హృదయం — the middle note" },
      { swara: "ప (Pa)", full: "పంచమము", source: "కోయిల (Cuckoo)", meaning: "వసంత ఋతువును, ఆనందాన్ని ప్రకటిస్తుంది" },
      { swara: "ద (Dha)", full: "దైవతము", source: "గుర్రం (Horse)", meaning: "ధైర్యాన్ని, ఉత్సాహాన్ని కలిగిస్తుంది" },
      { swara: "ని (Ni)", full: "నిషాదము", source: "ఏనుగు (Elephant)", meaning: "సర్వ సంగీతాన్ని తనలో లీనం చేసుకునే ముగింపు స్వరం" },
    ],
  },
  {
    id: "ragam",
    title: "రాగం అంటే ఏమిటి?",
    subtitle: "What is a Ragam — and why Mayamalavagowla?",
    icon: "🎼",
    content: [
      {
        te: 'రంజింపజేసే స్వరాల కలయికను రాగం అంటారు. కర్ణాటక సంగీతంలో 72 మేళకర్త రాగాలు ఉన్నాయి. అందులో 15వ మేళకర్త రాగమే "మాయామాళవగౌళ".',
        en: 'A combination of swaras that creates a specific emotion and beauty is called a Ragam. There are 72 parent ragas in Carnatic music. Mayamalavagowla is the 15th.',
      },
      {
        te: 'పురందర దాసులు — కర్ణాటక సంగీత పితామహుడు — అభ్యాసకులకు మొదటి పాఠంగా ఈ రాగాన్నే నిర్ణయించారు. దానికి బలమైన శాస్త్రీయ కారణాలు ఉన్నాయి.',
        en: 'Purandaradasa — the father of Carnatic music — chose this raga as the very first lesson for all students. There are strong reasons for this.',
      },
      {
        te: 'సమతుల్య స్వర అంతరాలు: ఈ రాగంలో పూర్వాంగం (స రి గ మ) మరియు ఉత్తరాంగం (ప ద ని స) ఒకే రకమైన శృతి అంతరాలను కలిగి ఉంటాయి. ఇది కంఠ సాధనకు అత్యంత అనుకూలం.',
        en: 'Symmetrical intervals: The lower half (Sa Re Ga Ma) and upper half (Pa Dha Ni Sa) have identical intervals. This makes it perfectly balanced for voice training.',
      },
      {
        te: 'హెచ్చుతగ్గులు ఎక్కువగా లేకుండా స్వరాలు క్రమపద్ధతిలో సాగడం వల్ల గొంతు తిరగడానికి, స్వరస్థానాలు స్పష్టంగా పలకడానికి ఇది అద్భుతమైన రాగం.',
        en: 'The notes move in a clear, orderly pattern without big jumps. This makes it the ideal raga for a beginner to develop accurate pitch and voice control.',
      },
    ],
    table: null,
  },
  {
    id: "taalam",
    title: "ఆది తాళము అంటే ఏమిటి?",
    subtitle: "What is Adi Taalam?",
    icon: "👐",
    content: [
      {
        te: 'సంగీతంలో కాల ప్రమాణాన్ని కొలిచే కొలమానమే తాళం. ఆది తాళము కర్ణాటక సంగీతంలో అత్యంత ప్రాచుర్యం పొందిన తాళం. ఇది మొత్తం 8 అక్షర కాలాల చక్రాన్ని కలిగి ఉంటుంది.',
        en: 'Taalam is the rhythmic framework of music — it measures time. Adi Taalam is the most common taalam in Carnatic music, with a cycle of 8 beats.',
      },
      {
        te: 'లఘువు (I): ఒక దెబ్బ వేసి, ఆపై మూడు వేళ్లు లెక్కించడం = 4 క్రియలు (beats 1, 2, 3, 4).',
        en: 'Laghu (I): One slap, then count 3 fingers = 4 beats (beats 1, 2, 3, 4).',
      },
      {
        te: 'దృతము (O): ఒక దెబ్బ వేసి, చేతిని వెనక్కి తిప్పడం = 2 క్రియలు. ఆది తాళంలో రెండు దృతాలు ఉంటాయి.',
        en: 'Drutham (O): One slap, then flip the hand = 2 beats. Adi Taalam has two Druthams.',
      },
    ],
    gestures: [
      { beat: 1, action: "దెబ్బ (Slap)", detail: "అరచేయి క్రిందికి కొట్టండి — strike your palm down", symbol: "👋" },
      { beat: 2, action: "చిటికెన వేలు (Little finger)", detail: "చిటికెన వేలు చూపించండి", symbol: "☝️" },
      { beat: 3, action: "ఉంగరపు వేలు (Ring finger)", detail: "ఉంగరపు వేలు చూపించండి", symbol: "☝️" },
      { beat: 4, action: "మధ్య వేలు (Middle finger)", detail: "మధ్య వేలు చూపించండి — లఘువు పూర్తి", symbol: "☝️" },
      { beat: 5, action: "దెబ్బ (Slap)", detail: "మళ్లీ అరచేయి కొట్టండి", symbol: "👋" },
      { beat: 6, action: "తిప్పడం (Wave/Flip)", detail: "అరచేయి పైకి తిప్పండి — మొదటి దృతం పూర్తి", symbol: "🤚" },
      { beat: 7, action: "దెబ్బ (Slap)", detail: "మళ్లీ అరచేయి కొట్టండి", symbol: "👋" },
      { beat: 8, action: "తిప్పడం (Wave/Flip)", detail: "అరచేయి పైకి తిప్పండి — రెండవ దృతం పూర్తి", symbol: "🤚" },
    ],
    table: null,
  },
  {
    id: "kaalams",
    title: "కాలాలు అంటే ఏమిటి?",
    subtitle: "The Three Speeds",
    icon: "⚡",
    content: [
      {
        te: 'సంగీతంలో వేగాన్ని కాలము అంటారు. తాళం వేగం స్థిరంగా ఉంటుంది, కానీ మనం పాడే స్వరాల వేగం మారుతుంది.',
        en: 'Speed in music is called Kaalam. The taalam stays at the same speed — but the number of swaras you sing per beat changes.',
      },
      {
        te: 'ప్రథమ కాలం: ఒక తాళపు క్రియకు ఒకే ఒక స్వరం. ఇది లయ స్థిరత్వానికి పునాది. మొదట ఎల్లప్పుడూ ఇక్కడే మొదలుపెట్టాలి.',
        en: 'Prathama Kaalam (1st speed): One swara per beat. This is the foundation. Always start here.',
      },
      {
        te: 'ద్వితీయ కాలం: ఒక క్రియ కాలంలో రెండు స్వరాలు. ప్రథమ కాలం కంటే రెట్టింపు వేగం.',
        en: 'Dwitheeya Kaalam (2nd speed): Two swaras per beat. Double the speed of the first.',
      },
      {
        te: 'తృతీయ కాలం: ఒక క్రియ కాలంలో నాలుగు స్వరాలు. ఇది ద్వితీయ కాలానికి రెట్టింపు వేగం.',
        en: 'Thritheeya Kaalam (3rd speed): Four swaras per beat. Double the second speed.',
      },
      {
        te: 'మూడు కాలాలూ ఎందుకు సాధన చేయాలి? కేవలం మొదటి వేగంలో పాడితే వేగం పెరిగినప్పుడు గొంతు తడబడుతుంది. మూడు కాలాలూ సమంగా సాధన చేసినప్పుడే గాత్రంపై సంపూర్ణ నియంత్రణ వస్తుంది.',
        en: 'Why practice all three? If you only practice slowly, your voice will stumble at higher speeds. Mastering all three kaalams gives you complete control over your voice at any tempo.',
      },
    ],
    table: null,
  },
  {
    id: "symbols",
    title: "చిహ్నాల అంతరార్థం",
    subtitle: "What the Symbols Mean",
    icon: "📖",
    content: [
      {
        te: 'మీరు నోట్సులో చూసిన గుర్తులు సంగీత లిపిలో చాలా కీలకమైనవి. ఇవి అర్థం కాకుండా పాడడం సాధ్యం కాదు.',
        en: 'The symbols in your notation book are essential. Without understanding them, you cannot read or sing the swaras correctly.',
      },
    ],
    symbols: [
      { symbol: "|", name: "నిలువు గీత (Single bar)", te: "తాళంలోని ఒక విభాగం పూర్తయిందని సూచిస్తుంది. లఘువు తర్వాత, దృతాల మధ్య వస్తుంది.", en: "Separates sections of the taalam — after Laghu, and between the two Druthams." },
      { symbol: "||", name: "జంట నిలువు గీతలు (Double bar)", te: "ఒక పూర్తి ఆవర్తనం (full cycle) లేదా ఒక లైన్ పూర్తయిందని సూచిస్తుంది.", en: "Marks the end of one complete cycle (one full 8-beat round)." },
      { symbol: ";", name: "సెమికోలన్ (Hold/Extension)", te: "'పా ;' అంటే 'పా' ని రెండు అక్షరాల కాలం సాగదీయాలి. స్వరాన్ని పట్టుకోవాలి, వదలకూడదు.", en: "'Pa ;' means hold Pa for two beat-slots. Do not release the note — sustain it." },
      { symbol: "*", name: "స్టార్ గుర్తు (Upper octave)", te: "*స అంటే తారస్థాయి స — పై స్థాయిలో పాడే 'స'. గొంతు తేలిగ్గా పైకి లేవాలి.", en: "*Sa means high Sa — sing it in the upper octave. The voice should lift lightly." },
      { symbol: "పా / సా / నీ", name: "ఆ వొత్తు నియమం (Aa Vottu Rule)", te: "స్వరానికి 'ఆ' కారం వస్తే అది రెండు అక్షరాల కాలం తీసుకుంటుంది. 'ప' అంటే 1 అక్షరం, 'పా' అంటే 2 అక్షరాలు. 'ని' = 1, 'నీ' = 2.", en: "When a swara has the 'aa' vowel extension, it takes 2 slots instead of 1. 'Pa' = 1 slot. 'Paa' = 2 slots. 'Ni' = 1, 'Nii' = 2." },
    ],
    table: null,
  },
  {
    id: "practice",
    title: "సాధన చేసే సరైన పద్ధతి",
    subtitle: "The Correct Way to Practice",
    icon: "🧘",
    content: [
      {
        te: 'కర్ణాటక సంగీతంలో సాధన చేయడానికి మూడు సూత్రాల పద్ధతి ఉంది. ఈ క్రమాన్ని ఎప్పుడూ తప్పకూడదు.',
        en: 'There is a three-step method for practicing Carnatic music correctly. Never skip this order.',
      },
      {
        te: '1. శ్రవణం (Listen First): గురువు గొంతును లేదా రికార్డింగ్‌ను మొదట శ్రద్ధగా వినాలి. స్వరం ఎక్కడ పుడుతోంది, ఏ స్థానంలో నిలుస్తోంది అనేది చెవులతో అర్థం చేసుకోవాలి. వినడం అనేది సగం సాధనతో సమానం.',
        en: '1. Shrawanam (Listen First): Listen carefully to the teacher or recording before singing. Understand where each swara rises and settles. Listening is equal to half the practice.',
      },
      {
        te: '2. మందగమనం (Sing Slowly): మొదట ప్రథమ కాలంలో, చాలా నెమ్మదిగా తంబురా శృతిని కలుపుకుంటూ పాడాలి. వేగం కంటే శృతి శుద్ధత ముఖ్యం.',
        en: '2. Mandagamanam (Sing Slowly): First sing at Prathama Kaalam, very slowly, with the tanpura drone. Pitch purity is more important than speed.',
      },
      {
        te: '3. కాలాంతర సాధన (Build Speed): ప్రథమ కాలంలో తప్పులు లేకుండా స్థిరత్వం వచ్చాకే ద్వితీయ కాలానికి, ఆ తర్వాతే తృతీయ కాలానికి వెళ్ళాలి. వేగం పెంచినప్పుడు గొంతులోని స్పష్టత తగ్గకూడదు.',
        en: '3. Kaalantara Sadhanam (Build Speed): Move to the 2nd speed only after the 1st is clean and steady. Then to the 3rd. When speed increases, clarity must not decrease.',
      },
    ],
    table: null,
  },
];

// ── Beat cell ─────────────────────────────────────────────────────────────────
function BeatCell({
  group, beatNum, script, isActive,
}: {
  group: BeatGroup;
  beatNum: number;
  script: Script;
  isActive: boolean;
}) {
  const text = group.map(t => getSwaraLabel(t, script)).join(" ");
  const isSustained = group.some(t => t.slots === 2) || group.some(t => t.swara === ";");

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "2px 6px",
      minWidth: 44,
      background: isActive
        ? (isSustained ? "rgba(124,111,255,0.15)" : "rgba(200,169,110,0.12)")
        : "transparent",
      borderRadius: 6,
      flexShrink: 0,
      transition: "background 0.2s",
    }}>
      <div style={{
        fontSize: script === "en" ? 17 : 15,
        fontFamily: script === "en" ? "'Bebas Neue', sans-serif" : "inherit",
        color: isActive
          ? (isSustained ? "#7c6fff" : "var(--accent)")
          : "var(--text)",
        whiteSpace: "nowrap",
        letterSpacing: isActive && isSustained ? 3 : (script === "en" ? 1 : 0.3),
        lineHeight: 1.4,
        transition: "letter-spacing 0.3s, color 0.2s",
      }}>
        {text}
      </div>
      <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2, fontFamily: "monospace" }}>
        {beatNum}
        {isSustained && <span style={{ color: "#7c6fff", marginLeft: 3 }}>～</span>}
      </div>
    </div>
  );
}

// ── Bar separator ─────────────────────────────────────────────────────────────
function Bar({ double }: { double?: boolean }) {
  return (
    <div style={{
      display: "flex", gap: 2, alignSelf: "center",
      margin: "0 3px", paddingBottom: 14,
    }}>
      <div style={{ width: 1.5, height: 22, background: "var(--accent)", opacity: double ? 0.7 : 0.35 }} />
      {double && <div style={{ width: 1.5, height: 22, background: "var(--accent)", opacity: 0.7 }} />}
    </div>
  );
}

// ── Cycle row — 3 lines ───────────────────────────────────────────────────────
function CycleRow({
  cycle, index, script, activeBeat, activeCycle,
}: {
  cycle: Cycle;
  index: number;
  script: Script;
  activeBeat: number | null;
  activeCycle: number | null;
}) {
  const isActive = activeCycle === index;
  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "flex-end",
    flexWrap: "nowrap", gap: 0, marginBottom: 4,
  };

  const laghu   = cycle.laghu.map((g, i)   => ({ g, bn: i + 1 })).filter(x => x.g.length > 0);
  const drutham1 = cycle.drutham1.map((g, i) => ({ g, bn: i + 5 })).filter(x => x.g.length > 0);
  const drutham2 = cycle.drutham2.map((g, i) => ({ g, bn: i + 7 })).filter(x => x.g.length > 0);

  return (
    <div style={{
      background: "var(--bg2)",
      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
      borderRadius: "var(--r)",
      padding: "10px 12px",
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
        Cycle {index + 1}
      </div>

      {/* Row 1 — Laghu beats 1–4 */}
      {laghu.length > 0 && (
        <div style={rowStyle}>
          {laghu.map(({ g, bn }) => (
            <BeatCell key={bn} group={g} beatNum={bn} script={script}
              isActive={isActive && activeBeat === bn} />
          ))}
          <Bar double={drutham1.length === 0 && drutham2.length === 0} />
        </div>
      )}

      {/* Row 2 — Drutham1 beats 5–6 */}
      {drutham1.length > 0 && (
        <div style={rowStyle}>
          {drutham1.map(({ g, bn }) => (
            <BeatCell key={bn} group={g} beatNum={bn} script={script}
              isActive={isActive && activeBeat === bn} />
          ))}
          <Bar double={drutham2.length === 0} />
        </div>
      )}

      {/* Row 3 — Drutham2 beats 7–8 */}
      {drutham2.length > 0 && (
        <div style={rowStyle}>
          {drutham2.map(({ g, bn }) => (
            <BeatCell key={bn} group={g} beatNum={bn} script={script}
              isActive={isActive && activeBeat === bn} />
          ))}
          <Bar double />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SaraliSwaras({ onBack }: { onBack: () => void }) {
  const [view, setView]                     = useState<View>("theory");
  const [selectedVar, setSelectedVar]       = useState<number>(1);
  const [selectedKaalam, setSelectedKaalam] = useState<Kaalam>(1);
  const [script, setScript]                 = useState<Script>("te");
  const [activeBeat, setActiveBeat]         = useState<number | null>(null);
  const [activeCycle, setActiveCycle]       = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("swara");
  const [playing, setPlaying] = useState(false);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const variation = SARALI_VARIATIONS.find(v => v.number === selectedVar)!;
  const [currentGroup, setCurrentGroup] = useState<BeatGroup | null>(null);
  const kaalam: Kaalam = variation.kaalams.includes(selectedKaalam)
  
    ? selectedKaalam
    : variation.kaalams[0] as Kaalam;

  // ── THEORY VIEW ────────────────────────────────────────────────────────────
  if (view === "theory") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">సరళి స్వరాలు — Theory</div>
        </div>

        <div style={{ padding: "16px 20px", maxWidth: 640, margin: "0 auto", width: "100%" }}>

          {/* Script toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {(["te", "en"] as Script[]).map(sc => (
              <button key={sc} onClick={() => setScript(sc)} style={{
                padding: "5px 14px", borderRadius: 20,
                border: `1.5px solid ${script === sc ? "var(--accent)" : "var(--border)"}`,
                background: script === sc ? "rgba(200,169,110,0.12)" : "var(--bg2)",
                color: script === sc ? "var(--accent)" : "var(--text2)",
                fontSize: 13, cursor: "pointer",
              }}>
                {SCRIPT_LABELS[sc]}
              </button>
            ))}
          </div>

          {/* Intro */}
          <div className="breathing-tip" style={{ marginBottom: 20 }}>
            <div className="tip-label">💡 గురువు మాట (Teacher's note)</div>
            <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, margin: 0 }}>
              {script === "te"
                ? "సరళి స్వరాలు నేర్చుకోవడానికి ముందు, ఈ Theory అర్థం చేసుకోవడం చాలా ముఖ్యం. గురువు ఏమి చెప్తున్నారో తెలిస్తేనే పాట సరిగ్గా పడుతుంది."
                : "Before practicing Sarali Swaras, understanding the theory is essential. When you know what your teacher is asking for, your practice becomes ten times more effective."}
            </p>
          </div>

          {/* Accordion sections */}
          {THEORY_SECTIONS.map(section => (
            <div key={section.id} style={{ marginBottom: 8 }}>
              {/* Section header — tap to expand */}
              <div
                onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                style={{
                  background: expandedSection === section.id ? "rgba(200,169,110,0.08)" : "var(--bg2)",
                  border: `1px solid ${expandedSection === section.id ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: expandedSection === section.id ? "var(--r) var(--r) 0 0" : "var(--r)",
                  padding: "12px 16px",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{section.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: expandedSection === section.id ? "var(--accent)" : "var(--text)" }}>
                      {section.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>
                      {section.subtitle}
                    </div>
                  </div>
                </div>
                <div style={{ color: "var(--text3)", fontSize: 16 }}>
                  {expandedSection === section.id ? "▲" : "▼"}
                </div>
              </div>

              {/* Section body */}
              {expandedSection === section.id && (
                <div style={{
                  background: "var(--bg2)",
                  border: "1px solid var(--accent)",
                  borderTop: "none",
                  borderRadius: "0 0 var(--r) var(--r)",
                  padding: "16px",
                }}>
                  {/* Text content */}
                  {section.content.map((para, i) => (
                    <p key={i} style={{
                      fontSize: script === "te" ? 14 : 13,
                      color: "var(--text2)",
                      lineHeight: 1.8,
                      marginBottom: 10,
                    }}>
                      {script === "te" ? para.te : para.en}
                    </p>
                  ))}

                  {/* Swara table */}
                  {section.table && (
                    <div style={{ marginTop: 12, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr>
                            {["స్వరం", "పూర్తి పేరు", "మూలం", "అంతరార్థం"].map(h => (
                              <th key={h} style={{
                                padding: "6px 8px", textAlign: "left",
                                color: "var(--accent)", fontSize: 10,
                                borderBottom: "1px solid var(--border)",
                                letterSpacing: 1,
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.table.map((row: any, i: number) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "8px", color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 16 }}>{row.swara}</td>
                              <td style={{ padding: "8px", color: "var(--text2)", fontSize: 12 }}>{row.full}</td>
                              <td style={{ padding: "8px", color: "var(--text3)", fontSize: 11 }}>{row.source}</td>
                              <td style={{ padding: "8px", color: "var(--text2)", fontSize: 11 }}>{row.meaning}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Hand gesture guide for taalam section */}
                  {"gestures" in section && section.gestures && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: "var(--accent)", letterSpacing: 2, marginBottom: 10 }}>
                        చేత్తో తాళం వేసే విధానం (HAND GESTURES)
                      </div>
                      {section.gestures.map((g: any) => (
                        <div key={g.beat} style={{
                          display: "flex", alignItems: "flex-start", gap: 12,
                          padding: "8px 0",
                          borderBottom: "1px solid var(--border)",
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: g.beat === 1 || g.beat === 5 || g.beat === 7
                              ? "rgba(200,169,110,0.2)" : "var(--bg3)",
                            border: `1px solid ${g.beat === 1 || g.beat === 5 || g.beat === 7 ? "var(--accent)" : "var(--border)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontFamily: "'Bebas Neue', sans-serif",
                            color: g.beat === 1 || g.beat === 5 || g.beat === 7 ? "var(--accent)" : "var(--text3)",
                            flexShrink: 0,
                          }}>
                            {g.beat}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{g.action}</div>
                            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                              {script === "te" ? g.detail : g.detail}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Symbols guide */}
                  {"symbols" in section && section.symbols && (
                    <div style={{ marginTop: 12 }}>
                      {section.symbols.map((sym: any, i: number) => (
                        <div key={i} style={{
                          display: "flex", gap: 12, alignItems: "flex-start",
                          padding: "10px 0",
                          borderBottom: "1px solid var(--border)",
                        }}>
                          <div style={{
                            minWidth: 44, height: 44,
                            background: "rgba(200,169,110,0.1)",
                            border: "1px solid var(--accent)",
                            borderRadius: 8,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 18, color: "var(--accent)",
                            flexShrink: 0,
                          }}>
                            {sym.symbol}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, marginBottom: 3 }}>
                              {sym.name}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
                              {script === "te" ? sym.te : sym.en}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Go to practice */}
          <div className="learn-done-wrap" style={{ marginTop: 24 }}>
            <button className="ctrl-btn sing-btn" onClick={() => setView("practice")}>
              Practice చేయడానికి వెళ్ళండి →
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── PRACTICE VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="breathing-screen">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => setView("theory")}>← Theory</button>
        <div className="learn-detail-title">సరళి స్వరాలు</div>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>మాయామాళవగౌళ</div>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 640, margin: "0 auto", width: "100%" }}>

        {/* Script selector */}
        <div style={{ marginBottom: 16, display: "flex", gap: 6 }}>
          {(["te", "en"] as Script[]).map(sc => (
            <button key={sc} onClick={() => setScript(sc)} style={{
              padding: "5px 14px", borderRadius: 20,
              border: `1.5px solid ${script === sc ? "var(--accent)" : "var(--border)"}`,
              background: script === sc ? "rgba(200,169,110,0.12)" : "var(--bg2)",
              color: script === sc ? "var(--accent)" : "var(--text2)",
              fontSize: 13, cursor: "pointer",
            }}>
              {SCRIPT_LABELS[sc]}
            </button>
          ))}
        </div>

        {/* Variation selector */}
        <div style={{ marginBottom: 16 }}>
          <div className="learn-block-label" style={{ marginBottom: 8 }}>Variation</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SARALI_VARIATIONS.map(v => (
              <button key={v.number}
                onClick={() => {
                  setSelectedVar(v.number);
                  setActiveBeat(null); setActiveCycle(null);
                  if (!v.kaalams.includes(selectedKaalam))
                    setSelectedKaalam(v.kaalams[0] as Kaalam);
                }}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: `2px solid ${selectedVar === v.number ? "var(--accent)" : "var(--border)"}`,
                  background: selectedVar === v.number ? "rgba(200,169,110,0.15)" : "var(--bg2)",
                  color: selectedVar === v.number ? "var(--accent)" : "var(--text2)",
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, cursor: "pointer",
                }}>
                {v.number}
              </button>
            ))}
          </div>
        </div>

        {/* Kaalam selector */}
        <div style={{ marginBottom: 20 }}>
          <div className="learn-block-label" style={{ marginBottom: 8 }}>Speed (Kaalam)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([1, 2, 3] as Kaalam[]).map(k => {
              const available = variation.kaalams.includes(k);
              return (
                <button key={k} onClick={() => available && setSelectedKaalam(k)} style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: `2px solid ${kaalam === k ? "var(--accent)" : "var(--border)"}`,
                  background: kaalam === k ? "rgba(200,169,110,0.12)" : "var(--bg2)",
                  color: !available ? "var(--text3)" : kaalam === k ? "var(--accent)" : "var(--text2)",
                  cursor: available ? "pointer" : "not-allowed",
                  opacity: available ? 1 : 0.4, fontSize: 13, fontWeight: 600,
                }}>
                  <div>Kaalam {k}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>{KAALAM_SPEED[k]}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notation */}
        <div style={{ marginBottom: 20 }}>
          <div className="learn-block-label" style={{ marginBottom: 10 }}>
            Notation — {KAALAM_LABELS[kaalam]}
          </div>
          {variation.cycles.map((cycle, ci) => (
            <CycleRow key={ci} cycle={cycle} index={ci} script={script}
              activeBeat={activeBeat} activeCycle={activeCycle} />
          ))}
        </div>

        {/* Taalam quick reference */}
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderLeft: "3px solid var(--accent)", borderRadius: "var(--r)",
          padding: "12px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, color: "var(--accent)", letterSpacing: 2, marginBottom: 8 }}>
            ADI TAALAM — ఆది తాళం
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { b: 1, label: "Slap"  }, { b: 2, label: "Tap" },
              { b: 3, label: "Tap"   }, { b: 4, label: "Tap" },
              { b: 5, label: "Wave"  }, { b: 6, label: "Tap" },
              { b: 7, label: "Wave"  }, { b: 8, label: "Tap" },
            ].map(({ b, label }) => (
              <div key={b} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{
                  width: 32, height: 32,
                  borderRadius: b === 1 || b === 5 || b === 7 ? 6 : "50%",
                  background: b === 1 ? "rgba(200,169,110,0.2)" : b === 5 || b === 7 ? "rgba(124,111,255,0.15)" : "var(--bg3)",
                  border: `1px solid ${b === 1 ? "var(--accent)" : b === 5 || b === 7 ? "#7c6fff" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: b === 1 ? "var(--accent)" : b === 5 || b === 7 ? "#7c6fff" : "var(--text3)",
                  fontFamily: "'Bebas Neue', sans-serif",
                }}>
                  {b}
                </div>
                <div style={{ fontSize: 8, color: "var(--text3)" }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 10, lineHeight: 1.6 }}>
            Laghu = beats 1–4 &nbsp;·&nbsp; Drutham = beats 5–6 &nbsp;·&nbsp; Drutham = beats 7–8
          </div>
        </div>
        {playing && currentGroup && (
  <div style={{
    background: "rgba(124,111,255,0.08)",
    border: "1px solid #7c6fff",
    borderRadius: "var(--r)",
    padding: "16px 20px",
    marginBottom: 16,
    textAlign: "center",
  }}>
    <div style={{ fontSize: 10, color: "#7c6fff", letterSpacing: 2, marginBottom: 6 }}>
      SING THIS NOW
    </div>
    <div style={{
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 32, letterSpacing: 3,
      display: "flex", alignItems: "center",
      justifyContent: "center", gap: 6,
    }}>
      {getSingingGuide(currentGroup).split(" ").map((word, i) => (
        <span key={i} style={{
          color: word === ";" ? "#7c6fff" : "var(--text)",
          fontSize: word === ";" ? 20 : 32,
          opacity: word === ";" ? 0.8 : 1,
        }}>
          {word === ";" ? "- AA -" : word}
        </span>
      ))}
    </div>
    {currentGroup.some(t => t.swara === ";") && (
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
        hold this note across both beats — do not release
      </div>
    )}
  </div>
)}
        {/* Play button */}
<div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
  {!playing ? (
    <button className="ctrl-btn sing-btn" onClick={async () => {
      setPlaying(true);
      setActiveCycle(null);
      setActiveBeat(null);
      const handle = await startSession(
        variation, kaalam, 3,
        (cycleIdx, beatNum, group) => {
          setActiveCycle(cycleIdx);
          setActiveBeat(beatNum);
          setCurrentGroup(group);
        },
        () => {
          setPlaying(false);
          setActiveCycle(null);
          setActiveBeat(null);
        }
      );
      playbackRef.current = handle;
    }}>
      ▶ Play (×3) — {KAALAM_LABELS[kaalam]}
    </button>
  ) : (
    <button className="ctrl-btn stop-btn" onClick={() => {
      playbackRef.current?.stop();
      setPlaying(false);
      setActiveCycle(null);
      setActiveBeat(null);
    }}>
      ⬛ Stop
    </button>
  )}
</div>

      </div>
    </div>
  );
}