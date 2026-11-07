import { useState, useEffect } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── INTERFACES DE DADOS ─────────────────────────────────────────────────────

interface IQAResumo {
  iqa: number;
  qualidade: string;
  nivelSaude: string;
  poluenteDeterminante: string;
  cor: string;
}

interface Medicao {
  timestamp: string;
  temperatura: number;
  umidade: number;
  pm25: number;
  pm10: number;
  so2: number;
  no2: number;
  co: number;
  o3: number;
  latitude?: number;
  longitude?: number;
}

interface ItemHistorico {
  hora: string;
  IQA: number;
  "PM2.5": number;
  PM10: number;
  SO2: number;
  NO2: number;
  CO: number;
  O3: number;
  Temperatura: number;
  Umidade: number;
}

interface RespostaFront {
  iqaResumo: IQAResumo;
  ultimaMedicao: Medicao;
  historico: ItemHistorico[];
}

interface DadoApi {
  id: number;
  timestamp: string;
  tipo: string;
  pm25: number;
  pm10: number;
  co: number;
  so2: number;
  no2: number;
  o3: number;
  temperatura: number;
  umidade: number;
  pressao_atmosferica: number;
  velocidade_vento: number;
  direcao_vento: number;
  qtd_medicao: number;
  iqa: number;
  qualidade: string;
  nivel_saude: string;
  poluente_determinante: string;
  cor: string;
}

interface RespostaApiDjango {
  status: string;
  iqa_resumo: {
    iqa: number;
    poluente_determinante: string;
    qualidade: string;
    nivel_saude: string;
    cor: string;
  };
  dados: DadoApi[];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const formatarNumero = (
  valor: number | undefined | null,
  casasDecimais: number = 1
) => {
  if (valor === undefined || valor === null || isNaN(valor)) return "--";
  return valor.toFixed(casasDecimais).replace(".", ",");
};

const normalizarPoluente = (p: string) => {
  if (!p) return "--";
  return p
    .toUpperCase()
    .replace(/PM\s*2[.,]?5/i, "MP₂,₅")
    .replace(/PM\s*10/i, "MP₁₀")
    .replace(/^O3$/, "O₃")
    .replace(/^SO2$/, "SO₂")
    .replace(/^NO2$/, "NO₂");
};

const formatarDataHora = (iso: string) => {
  if (!iso) return "--/--/---- às --:--";
  const dt = new Date(iso);
  const dia = dt.getDate().toString().padStart(2, "0");
  const mes = (dt.getMonth() + 1).toString().padStart(2, "0");
  const ano = dt.getFullYear();
  const hora = dt.getHours().toString().padStart(2, "0");
  const min = dt.getMinutes().toString().padStart(2, "0");
  return `${dia}/${mes}/${ano} às ${hora}:${min}`;
};

const extrairHora = (iso: string) => {
  if (!iso) return "--:--";
  const dt = new Date(iso);
  const h = dt.getHours().toString().padStart(2, "0");
  const m = dt.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

type Tab = "dashboard" | "graficos" | "informacoes" | "jogo";

// ─── TEMA VISUAL ─────────────────────────────────────────────────────────────
// Paleta vibrante inspirada em sites educativos/editoriais (azul-marca,
// contornos pretos grossos, sombras "carimbadas" e selos coloridos).

const TEMA = {
  tinta: "#1a1a1a",
  destaque: "#33CCFF",
  creme: "#FFF8E1",
  rosa: "#FF5FA2",
  azul: "#2699E6",
  verde: "#8BE04E",
  laranja: "#FF8A3D",
  roxo: "#9B5CFF",
};

// Classes reutilizáveis (estilo "neo-brutalista" lúdico)
const CARD =
  "bg-white border-[3px] border-[#1a1a1a] rounded-2xl shadow-[5px_5px_0_#1a1a1a]";
const CARD_HOVER =
  "transition-all duration-200 hover:-translate-y-1 hover:shadow-[7px_7px_0_#1a1a1a]";
const BOTAO =
  "border-[2.5px] border-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#1a1a1a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1a1a1a]";

// Estilos globais: fontes, animações e ajustes do Leaflet
function EstilosGlobais() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Space+Mono:wght@400;700&display=swap');

      .font-display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; }
      .font-mono { font-family: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace !important; }

      @keyframes iqa-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .iqa-marquee { animation: iqa-marquee 28s linear infinite; }
      .iqa-marquee:hover { animation-play-state: paused; }

      @keyframes iqa-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-14px) rotate(6deg); } }
      .iqa-float { animation: iqa-float 7s ease-in-out infinite; }
      .iqa-float-slow { animation: iqa-float 11s ease-in-out infinite; }

      @keyframes iqa-wiggle { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
      .iqa-wiggle { animation: iqa-wiggle 2.4s ease-in-out infinite; }

      @keyframes iqa-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
      .iqa-shake { animation: iqa-shake 0.4s ease-in-out; }

      @keyframes iqa-pop { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
      .iqa-pop { animation: iqa-pop 0.45s cubic-bezier(.2,.9,.3,1.3) both; }

      @keyframes iqa-confetti { 0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; } }
      .iqa-confetti { animation: iqa-confetti linear infinite; }

      @keyframes iqa-bounce-dot { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-14px); } }
      .iqa-bounce-dot { animation: iqa-bounce-dot 1.1s ease-in-out infinite; }

      @keyframes iqa-needle { from { transform: rotate(-90deg); } }
      .iqa-needle { animation: iqa-needle 1.2s cubic-bezier(.2,.9,.3,1.2) both; transform-origin: 150px 150px; }

      .custom-popup .leaflet-popup-content-wrapper {
        border: 3px solid #1a1a1a; border-radius: 18px; box-shadow: 5px 5px 0 #1a1a1a; padding: 0; overflow: hidden;
      }
      .custom-popup .leaflet-popup-content { margin: 0; }
      .custom-popup .leaflet-popup-tip { border: 3px solid #1a1a1a; box-shadow: none; }
      .leaflet-bar { border: 3px solid #1a1a1a !important; box-shadow: 3px 3px 0 #1a1a1a !important; border-radius: 12px !important; overflow: hidden; }

      @media (prefers-reduced-motion: reduce) {
        .iqa-marquee, .iqa-float, .iqa-float-slow, .iqa-wiggle, .iqa-confetti, .iqa-bounce-dot, .iqa-needle { animation: none !important; }
      }
    `}</style>
  );
}

// Formas decorativas flutuantes ao fundo (nuvens, moléculas, bolhas)
function DecoracaoFundo() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Nuvem */}
      <svg className="iqa-float-slow absolute top-28 -left-6 w-40 opacity-70" viewBox="0 0 120 60">
        <path
          d="M25 50 h70 a18 18 0 0 0 0-36 a24 24 0 0 0-44-6 a16 16 0 0 0-26 14 a14 14 0 0 0 0 28z"
          fill="#ffffff"
          stroke="#1a1a1a"
          strokeWidth="3"
        />
      </svg>
      {/* Molécula O₃ */}
      <svg className="iqa-float absolute top-1/3 right-4 w-24 opacity-80" viewBox="0 0 100 70">
        <line x1="25" y1="45" x2="50" y2="22" stroke="#1a1a1a" strokeWidth="4" />
        <line x1="50" y1="22" x2="75" y2="45" stroke="#1a1a1a" strokeWidth="4" />
        <circle cx="25" cy="45" r="13" fill={TEMA.azul} stroke="#1a1a1a" strokeWidth="3" />
        <circle cx="50" cy="22" r="13" fill={TEMA.rosa} stroke="#1a1a1a" strokeWidth="3" />
        <circle cx="75" cy="45" r="13" fill={TEMA.azul} stroke="#1a1a1a" strokeWidth="3" />
      </svg>
      {/* Bolhas / partículas */}
      <span className="iqa-float absolute bottom-24 left-10 w-6 h-6 rounded-full border-[3px] border-[#1a1a1a]" style={{ background: TEMA.verde }} />
      <span className="iqa-float-slow absolute bottom-40 left-24 w-3 h-3 rounded-full border-2 border-[#1a1a1a]" style={{ background: TEMA.laranja }} />
      <span className="iqa-float absolute top-[70%] right-16 w-4 h-4 rounded-full border-2 border-[#1a1a1a]" style={{ background: TEMA.destaque }} />
      {/* Estrela/brilho */}
      <svg className="iqa-wiggle absolute top-[58%] left-[3%] w-10 opacity-90" viewBox="0 0 40 40">
        <path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill={TEMA.destaque} stroke="#1a1a1a" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Faixa rolante com os dados atuais (estilo "placar ao vivo")
function FaixaAoVivo({ iqa, timestamp }: { iqa: IQAResumo; timestamp?: string }) {
  const itens = [
    `IQAr: ${formatarNumero(iqa.iqa ?? 0, 0)}`,
    `QUALIDADE DO AR: ${(iqa.qualidade || "N/A").toUpperCase()}`,
    `POLUENTE DETERMINANTE: ${normalizarPoluente(iqa.poluenteDeterminante || "")}`,
    "ESTAÇÃO PUC-RIO",
    "GÁVEA, RIO DE JANEIRO — RJ",
    ...(timestamp ? [`ÚLTIMA LEITURA: ${formatarDataHora(timestamp)}`] : []),
  ];
  const conteudo = (
    <div className="flex shrink-0 items-center">
      {itens.map((t, i) => (
        <span key={i} className="flex items-center gap-4 px-4 whitespace-nowrap">
          <span>{t}</span>
          <span className="text-[#33CCFF]">✸</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative z-40 bg-[#1a1a1a] text-white border-b-[3px] border-[#1a1a1a] overflow-hidden">
      <div className="flex items-center">
        <span className="shrink-0 z-10 flex items-center gap-2 bg-[#FF5FA2] text-[#1a1a1a] font-mono font-bold text-[11px] uppercase tracking-widest px-4 py-2 border-r-[3px] border-[#1a1a1a]">
          <span className="w-2 h-2 rounded-full bg-[#1a1a1a] animate-pulse" />
          Ao vivo
        </span>
        <div className="overflow-hidden flex-1">
          <div className="iqa-marquee flex w-max font-mono text-[11px] font-bold tracking-widest py-2">
            {conteudo}
            {conteudo}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── METRIC CARD ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <span className="text-[12px] font-mono font-bold text-[#1a1a1a] uppercase tracking-widest bg-[#33CCFF] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[3px_3px_0_#1a1a1a] -rotate-1">
        {children}
      </span>
      <div className="flex-1 border-t-[3px] border-dashed border-[#1a1a1a]/40" />
    </div>
  );
}

// ─── ABA 1: MAPA ────────────────────────────────────────────────────────

const obterCorIQA = (corOriginal?: string, qualidade?: string) => {
  const corLower = corOriginal?.toLowerCase();
  const qualLower = qualidade?.toLowerCase();

  if (corLower === "#00e396" || qualLower === "boa") {
    return "#00a859";
  }
  return corOriginal || "#00a859";
};

const criarIconeEstacao = (cor?: string) => {
  const corValida = cor || "#00a859";
  return L.divIcon({
    className: "custom-station-pin",
    html: `
      <div style="
        width: 34px;
        height: 46px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(3px 3px 0px #1a1a1a);
      ">
        <svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; overflow: visible;">
          <path
            d="M12 2C5.92 2 1 6.92 1 13C1 21.5 12 35 12 35C12 35 23 21.5 23 13C23 6.92 18.08 2 12 2Z"
            fill="${corValida}"
            stroke="#1a1a1a"
            stroke-width="2.5"
          />
          <circle cx="12" cy="13" r="4.5" fill="#ffffff" stroke="#1a1a1a" stroke-width="2" />
        </svg>
      </div>
    `,
    iconSize: [34, 46],
    iconAnchor: [17, 46],
    popupAnchor: [0, -42],
  });
};

// Medidor semicircular do IQAr (0 a 250+)
const FAIXAS_MEDIDOR = [
  { de: 0, ate: 40, cor: "#00a859" },
  { de: 40, ate: 80, cor: "#d97706" },
  { de: 80, ate: 120, cor: "#ea580c" },
  { de: 120, ate: 200, cor: "#dc2626" },
  { de: 200, ate: 250, cor: "#7c3aed" },
];
const MEDIDOR_MAX = 250;

const pontoNoArco = (cx: number, cy: number, r: number, graus: number) => {
  const a = ((graus - 180) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const caminhoArco = (cx: number, cy: number, r: number, g1: number, g2: number) => {
  const [x1, y1] = pontoNoArco(cx, cy, r, g1);
  const [x2, y2] = pontoNoArco(cx, cy, r, g2);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
};

function MedidorIQA({ valor, cor }: { valor: number; cor: string }) {
  const v = Math.max(0, Math.min(valor || 0, MEDIDOR_MAX));
  const graus = (v / MEDIDOR_MAX) * 180;
  const cx = 150;
  const cy = 150;
  const r = 110;

  return (
    <svg viewBox="0 0 300 175" className="w-full max-w-[300px]" role="img" aria-label={`IQAr ${formatarNumero(valor, 0)}`}>
      {/* contorno preto */}
      <path d={caminhoArco(cx, cy, r, 0, 180)} stroke="#1a1a1a" strokeWidth={34} fill="none" strokeLinecap="round" />
      {FAIXAS_MEDIDOR.map((f, i) => (
        <path
          key={i}
          d={caminhoArco(cx, cy, r, (f.de / MEDIDOR_MAX) * 180, (f.ate / MEDIDOR_MAX) * 180)}
          stroke={f.cor}
          strokeWidth={26}
          fill="none"
        />
      ))}
      {/* marcações */}
      {[0, 40, 80, 120, 200, 250].map((t) => {
        const [x, y] = pontoNoArco(cx, cy, r - 30, (t / MEDIDOR_MAX) * 180);
        return (
          <text key={t} x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight={700} fill="#1a1a1a" fontFamily="Space Mono, monospace">
            {t === 250 ? "250+" : t}
          </text>
        );
      })}
      {/* ponteiro */}
      <g className="iqa-needle" style={{ transform: `rotate(${graus - 90}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <path d={`M ${cx - 7} ${cy} L ${cx} ${cy - r + 8} L ${cx + 7} ${cy} Z`} fill="#1a1a1a" />
      </g>
      <circle cx={cx} cy={cy} r={16} fill={cor} stroke="#1a1a1a" strokeWidth={4} />
    </svg>
  );
}

const indiceFaixaAtual = (valor: number) => {
  if (valor <= 40) return 0;
  if (valor <= 80) return 1;
  if (valor <= 120) return 2;
  if (valor <= 200) return 3;
  return 4;
};

export function DashboardTab({ iqa, m }: { iqa?: IQAResumo | null; m?: Medicao | null }) {
  if (!iqa || !m) {
    return (
      <div className={`w-full h-[600px] flex items-center justify-center ${CARD}`}>
        <span className="text-stone-700 font-mono text-sm font-bold">
          Aguardando dados de medição da estação...
        </span>
      </div>
    );
  }

  const lat = typeof m.latitude === "number" && !isNaN(m.latitude) ? m.latitude : -22.979187;
  const lng = typeof m.longitude === "number" && !isNaN(m.longitude) ? m.longitude : -43.233206;
  const posicaoEstacao: [number, number] = [lat, lng];

  const corIqa = obterCorIQA(iqa.cor, iqa.qualidade);

  const poluenteFormatado = typeof normalizarPoluente === "function"
    ? normalizarPoluente(iqa.poluenteDeterminante || "")
    : iqa.poluenteDeterminante || "N/A";

  const valorIqaFormatado = typeof formatarNumero === "function"
    ? formatarNumero(iqa.iqa ?? 0, 0)
    : (iqa.iqa ?? 0);

  const dataHoraFormatada = typeof formatarDataHora === "function" && m.timestamp
    ? formatarDataHora(m.timestamp)
    : m.timestamp || "N/A";

  const iconeEstacao = criarIconeEstacao(corIqa);

  const faixasIqa = [
    { faixa: "0 – 40", rotulo: "Boa", cor: "#00a859", bgCor: "#D8F8E6", emoji: "😄" },
    { faixa: "41 – 80", rotulo: "Moderada", cor: "#b45309", bgCor: "#FFF0C2", emoji: "🙂" },
    { faixa: "81 – 120", rotulo: "Ruim", cor: "#ea580c", bgCor: "#FFE1CC", emoji: "😷" },
    { faixa: "121 – 200", rotulo: "Muito Ruim", cor: "#dc2626", bgCor: "#FFD6D6", emoji: "🤢" },
    { faixa: "> 200", rotulo: "Péssima", cor: "#7c3aed", bgCor: "#EADCFF", emoji: "☠️" },
  ];

  const faixaAtual = indiceFaixaAtual(iqa.iqa ?? 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="w-full font-mono">
        <div className="flex items-center gap-3 mb-4 px-1">
          <span className="text-xs text-[#1a1a1a] font-bold tracking-wider uppercase bg-[#33CCFF] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[3px_3px_0_#1a1a1a]">
            ÍNDICE DE QUALIDADE DO AR (IQAr) &mdash; RESOLUÇÃO CONAMA Nº 506/2024
          </span>
          <div className="flex-1 border-t-[3px] border-dashed border-[#1a1a1a]/40" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 w-full items-stretch">
          {/* Medidor */}
          <div className={`${CARD} p-4 flex flex-col items-center justify-center relative overflow-hidden`}>
            <div
              aria-hidden
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25"
              style={{ background: corIqa }}
            />
            <MedidorIQA valor={iqa.iqa ?? 0} cor={corIqa} />
            <div className="-mt-1 flex flex-col items-center">
              <span className="font-display text-5xl font-extrabold leading-none text-[#1a1a1a]">
                {valorIqaFormatado}
              </span>
              <span
                className="mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border-[2.5px] border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a] text-white"
                style={{ backgroundColor: corIqa }}
              >
                {iqa.qualidade || "N/A"}
              </span>
            </div>
          </div>

          {/* Faixas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 w-full">
            {faixasIqa.map((item, index) => {
              const ativa = index === faixaAtual;
              return (
                <div
                  key={index}
                  className={`relative flex xl:flex-col items-center xl:items-start justify-between gap-2 px-4 py-3 rounded-2xl border-[3px] border-[#1a1a1a] transition-all duration-200 hover:-translate-y-1 ${
                    ativa ? "shadow-[6px_6px_0_#1a1a1a] -translate-y-1 scale-[1.03]" : "shadow-[3px_3px_0_#1a1a1a]"
                  }`}
                  style={{ backgroundColor: item.bgCor }}
                >
                  {ativa && (
                    <span className="absolute -top-3 right-3 bg-[#1a1a1a] text-[#33CCFF] text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full iqa-wiggle">
                      ● agora
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      {item.emoji}
                    </span>
                    <span className="text-xs text-[#1a1a1a] font-bold tracking-tight">
                      {item.faixa}
                    </span>
                  </div>

                  <span
                    className="font-display text-base font-extrabold tracking-tight"
                    style={{ color: item.cor }}
                  >
                    {item.rotulo}
                  </span>

                  <span
                    aria-hidden
                    className="hidden xl:block w-full h-2.5 rounded-full border-2 border-[#1a1a1a]"
                    style={{ backgroundColor: item.cor }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`w-full h-[600px] overflow-hidden relative ${CARD}`}>
        <MapContainer
          center={posicaoEstacao}
          zoom={14}
          scrollWheelZoom={true}
          zoomSnap={1}
          zoomDelta={1}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            maxNativeZoom={19}
            detectRetina={true}
          />

          <Marker position={posicaoEstacao} icon={iconeEstacao}>
            <Popup className="custom-popup">
              <div className="w-[320px] font-mono text-stone-900 relative bg-white">
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#33CCFF] border-b-[3px] border-[#1a1a1a] pr-8">
                  <span className="font-bold text-xs uppercase tracking-wide text-[#1a1a1a] truncate">
                    ESTAÇÃO PUC-RIO
                  </span>

                  <span
                    className="px-2.5 py-1 rounded-xl text-xs font-bold font-mono tracking-wide shrink-0 text-white border-2 border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a]"
                    style={{ backgroundColor: corIqa }}
                  >
                    IQAr: {valorIqaFormatado}
                  </span>
                </div>

                <div className="px-4 pb-4 pt-2">
                  <div className="flex items-center justify-between my-2 text-xs">
                    <span className="text-stone-600 uppercase text-[10px] tracking-wider font-bold">
                      QUALIDADE DO AR:
                    </span>
                    <span
                      className="font-bold tracking-wide text-xs"
                      style={{ color: corIqa }}
                    >
                      {iqa.qualidade || "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between my-2 text-xs">
                    <span className="text-stone-600 uppercase text-[10px] tracking-wider font-bold">
                      POLUENTE DETERMINANTE:
                    </span>
                    <span className="font-bold text-stone-900 text-xs">
                      {poluenteFormatado}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t-2 border-dashed border-stone-300 flex items-center justify-between text-[10px] text-stone-600">
                    <span className="uppercase tracking-wider font-bold">
                      ÚLTIMA LEITURA
                    </span>
                    <span className="text-stone-900 font-mono font-bold">
                      {dataHoraFormatada}
                    </span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}

// ─── ABA 2: GRÁFICOS ─────────────────────────────────────────────────────────

const METRICAS = [
  "IQA",
  "PM2.5",
  "PM10",
  "SO2",
  "NO2",
  "CO",
  "O3",
  "Temperatura",
  "Umidade",
] as const;

type Metrica = (typeof METRICAS)[number];

const METRICAS_CARDS: Metrica[] = [
  "PM2.5",
  "PM10",
  "SO2",
  "NO2",
  "CO",
  "O3",
  "Temperatura",
  "Umidade",
];

const METRICA_CONFIG: Record<
  Metrica,
  {
    label: React.ReactNode;
    rawLabel: string;
    cardLabel: React.ReactNode;
    unit: string;
    color: string;
    decimals: number;
    icone: string;
  }
> = {
  IQA: {
    label: "IQAr",
    rawLabel: "IQAr",
    cardLabel: "IQAr",
    unit: "",
    color: "#E6007E",
    decimals: 0,
    icone: "📊",
  },
  "PM2.5": {
    label: (
      <span>
        MP<sub>2,5</sub>
      </span>
    ),
    rawLabel: "MP₂‚₅",
    cardLabel: (
      <span>
        MP<sub>2,5</sub>
      </span>
    ),
    unit: "µg/m³",
    color: "#00A3A3",
    decimals: 1,
    icone: "🌫️",
  },
  PM10: {
    label: (
      <span>
        MP<sub>10</sub>
      </span>
    ),
    rawLabel: "MP₁₀",
    cardLabel: (
      <span>
        MP<sub>10</sub>
      </span>
    ),
    unit: "µg/m³",
    color: "#7C3AED",
    decimals: 1,
    icone: "💨",
  },
  SO2: {
    label: (
      <span>
        SO<sub>2</sub>
      </span>
    ),
    rawLabel: "SO₂",
    cardLabel: (
      <span>
        SO<sub>2</sub>
      </span>
    ),
    unit: "µg/m³",
    color: "#C026D3",
    decimals: 1,
    icone: "🏭",
  },
  NO2: {
    label: (
      <span>
        NO<sub>2</sub>
      </span>
    ),
    rawLabel: "NO₂",
    cardLabel: (
      <span>
        NO<sub>2</sub>
      </span>
    ),
    unit: "µg/m³",
    color: "#F97316",
    decimals: 1,
    icone: "🚗",
  },
  CO: {
    label: "CO",
    rawLabel: "CO",
    cardLabel: "CO",
    unit: "µg/m³",
    color: "#E11D48",
    decimals: 0,
    icone: "🔥",
  },
  O3: {
    label: (
      <span>
        O<sub>3</sub>
      </span>
    ),
    rawLabel: "O₃",
    cardLabel: (
      <span>
        O<sub>3</sub>
      </span>
    ),
    unit: "µg/m³",
    color: "#CA8A04",
    decimals: 1,
    icone: "☀️",
  },
  Temperatura: {
    label: "Temperatura",
    rawLabel: "Temperatura",
    cardLabel: "TEMPERATURA",
    unit: "°C",
    color: "#EA580C",
    decimals: 1,
    icone: "🌡️",
  },
  Umidade: {
    label: "Umidade Relativa",
    rawLabel: "Umidade",
    cardLabel: "UMIDADE RELATIVA",
    unit: "%",
    color: "#0284C7",
    decimals: 1,
    icone: "💧",
  },
};

export function GraficosTab({
  historico,
  ultimaLeituraData,
}: {
  historico: any[];
  ultimaLeituraData?: string;
}) {
  const [metrica, setMetrica] = useState<Metrica>("IQA");
  const cfg = METRICA_CONFIG[metrica];

  const dados = historico.map((h) => ({
    hora: h.hora,
    valor: h[metrica as keyof typeof h],
  }));

  const valoresValidos = dados
    .map((d) => Number(d.valor))
    .filter((v) => !isNaN(v));
  const minValor = valoresValidos.length ? Math.min(...valoresValidos) : 0;
  const maxValor = valoresValidos.length ? Math.max(...valoresValidos) : 0;
  const ultimoValor = dados[dados.length - 1]?.valor ?? 0;

  const ultimaLeitura = historico[historico.length - 1] || {};

  return (
    <div className="space-y-8 text-stone-900">
      {ultimaLeituraData && (
        <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#1a1a1a] bg-[#8BE04E] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[3px_3px_0_#1a1a1a]">
          <span className="w-2 h-2 rounded-full bg-[#1a1a1a] animate-pulse" />
          <span>Última leitura: {ultimaLeituraData}</span>
        </div>
      )}

      <div>
        <h3 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#1a1a1a] mb-4 flex items-center gap-3">
          <span className="inline-block w-4 h-4 rounded-full bg-[#FF5FA2] border-[3px] border-[#1a1a1a]" aria-hidden />
          Últimos Registros
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {METRICAS_CARDS.map((m, idx) => {
            const itemCfg = METRICA_CONFIG[m];
            const valorCard = ultimaLeitura[m as keyof typeof ultimaLeitura];

            return (
              <div
                key={m}
                className={`relative overflow-hidden bg-white border-[3px] border-[#1a1a1a] rounded-2xl p-3 flex flex-col justify-between shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:rotate-0 hover:-translate-y-1 hover:shadow-[6px_6px_0_#1a1a1a] ${
                  idx % 2 === 0 ? "-rotate-1" : "rotate-1"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-2"
                  style={{ backgroundColor: itemCfg.color }}
                />
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[10px] font-mono text-[#1a1a1a] font-bold uppercase truncate">
                    {itemCfg.cardLabel}
                  </span>
                  <span className="text-base" aria-hidden>
                    {itemCfg.icone}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span
                    className="font-display text-2xl font-extrabold"
                    style={{ color: itemCfg.color }}
                  >
                    {formatarNumero(valorCard, itemCfg.decimals)}
                  </span>
                  {itemCfg.unit && (
                    <span className="text-[10px] text-stone-600 font-mono font-bold">
                      {itemCfg.unit}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#1a1a1a] mb-4 flex items-center gap-3">
          <span className="inline-block w-4 h-4 rounded-full bg-[#2699E6] border-[3px] border-[#1a1a1a]" aria-hidden />
          Histórico — Últimas 24 Horas
        </h3>

        <div className={`${CARD} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              {METRICAS.map((m) => {
                const isSelected = metrica === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMetrica(m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold border-[2.5px] border-[#1a1a1a] transition-all duration-150 ${
                      isSelected
                        ? "text-white shadow-[3px_3px_0_#1a1a1a] -translate-y-0.5"
                        : "bg-white text-[#1a1a1a] hover:-translate-y-0.5 hover:shadow-[2px_2px_0_#1a1a1a]"
                    }`}
                    style={
                      isSelected
                        ? { backgroundColor: METRICA_CONFIG[m].color }
                        : undefined
                    }
                  >
                    {METRICA_CONFIG[m].label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {[
                { rotulo: "Mín: ", valor: minValor, bg: "#D6F0FF" },
                { rotulo: "Máx: ", valor: maxValor, bg: "#FFE0EE" },
                { rotulo: "Atual: ", valor: ultimoValor, bg: "#FFF6B3" },
              ].map((s) => (
                <div
                  key={s.rotulo}
                  className="px-3 py-1.5 rounded-xl border-[2.5px] border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a]"
                  style={{ backgroundColor: s.bg }}
                >
                  <span className="text-[#1a1a1a] font-bold">{s.rotulo}</span>
                  <span className="font-bold" style={{ color: cfg.color }}>
                    {formatarNumero(s.valor as number, cfg.decimals)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={dados}
              margin={{ top: 10, right: 20, left: 15, bottom: 25 }}
            >
              <CartesianGrid
                strokeDasharray="4 6"
                stroke="#d6d3d1"
                vertical={false}
              />
              <XAxis
                dataKey="hora"
                dy={5}
                padding={{ left: 10, right: 10 }}
                tick={{
                  fill: "#1a1a1a",
                  fontSize: 11,
                  fontFamily: "Space Mono, monospace",
                  fontWeight: 700,
                }}
                tickLine={false}
                axisLine={{ stroke: "#1a1a1a", strokeWidth: 2.5 }}
                label={{
                  value: "Hora",
                  position: "insideBottom",
                  offset: -15,
                  style: {
                    fill: "#1a1a1a",
                    fontSize: 11,
                    fontFamily: "Space Mono, monospace",
                    fontWeight: 700,
                    textAnchor: "middle",
                  },
                }}
              />
              <YAxis
                width={55}
                tick={{
                  fill: "#1a1a1a",
                  fontSize: 11,
                  fontFamily: "Space Mono, monospace",
                  fontWeight: 700,
                }}
                tickFormatter={(v: number) => formatarNumero(v, cfg.decimals)}
                tickLine={false}
                axisLine={false}
                label={
                  cfg.unit
                    ? {
                        value: cfg.unit,
                        angle: -90,
                        position: "insideLeft",
                        style: {
                          fill: "#1a1a1a",
                          fontSize: 11,
                          fontFamily: "Space Mono, monospace",
                          fontWeight: 700,
                          textAnchor: "middle",
                        },
                      }
                    : undefined
                }
              />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "2.5px solid #1a1a1a",
                  borderRadius: 12,
                  fontSize: 12,
                  fontFamily: "Space Mono, monospace",
                  fontWeight: 700,
                  color: "#1a1a1a",
                  boxShadow: "3px 3px 0 #1a1a1a",
                }}
                cursor={{ stroke: "#1a1a1a", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                itemStyle={{ color: cfg.color }}
                formatter={(v: number) => [
                  `${formatarNumero(v, cfg.decimals)} ${cfg.unit}`,
                  cfg.rawLabel,
                ]}
              />
              {metrica === "IQA" && (
                <ReferenceLine
                  y={40}
                  stroke="#00a859"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  label={{
                    value: "Limite Bom (40)",
                    fill: "#00a859",
                    fontSize: 11,
                    fontWeight: 700,
                    position: "center",
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="valor"
                stroke={cfg.color}
                strokeWidth={3.5}
                dot={false}
                activeDot={{
                  r: 7,
                  fill: cfg.color,
                  stroke: "#1a1a1a",
                  strokeWidth: 2.5,
                }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── ABA 3: INFORMAÇÕES ──────────────────────────────────────────────────────

function InformacoesTab() {
  const dicasCores = [TEMA.rosa, TEMA.azul, TEMA.verde, TEMA.laranja];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-6">
        <div className={`${CARD} ${CARD_HOVER} overflow-hidden`}>
          <div className="flex items-center gap-2 px-6 py-3 bg-[#33CCFF] border-b-[3px] border-[#1a1a1a]">
            <span className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center">
              <svg
                className="w-4 h-4 text-[#33CCFF]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </span>
            <span className="text-xs font-mono font-bold text-[#1a1a1a] uppercase tracking-wider">
              Estação de Monitoramento
            </span>
          </div>

          <div className="p-6">
            <h2 className="font-display text-3xl font-extrabold text-[#1a1a1a]">PUC-Rio</h2>
            <p className="text-stone-800 text-sm mt-1 font-semibold">
              Gávea, Rio de Janeiro — RJ
            </p>
            <p className="inline-block text-[#1a1a1a] text-xs mt-3 font-mono font-bold bg-[#D6F0FF] border-2 border-[#1a1a1a] rounded-lg px-2 py-1">
              Laboratório de Química Atmosférica (LQA)
            </p>

            <a
              href="https://www.instagram.com/lqapucrio"
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF5FA2] via-[#C13BFF] to-[#FF8A3D] text-white text-xs font-bold w-full justify-center group ${BOTAO}`}
            >
              <svg
                className="w-4 h-4 transition-transform group-hover:scale-125 group-hover:rotate-12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Siga o @lqapucrio no Instagram
            </a>
          </div>
        </div>

        <div className={`${CARD} ${CARD_HOVER} overflow-hidden`}>
          <div className="flex items-center gap-2 px-6 py-3 bg-[#2699E6] border-b-[3px] border-[#1a1a1a]">
            <span className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center">
              <svg
                className="w-4 h-4 text-[#2699E6]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            <span className="text-xs font-mono font-bold text-[#1a1a1a] uppercase tracking-wider">
              Panorama Nacional
            </span>
          </div>

          <div className="p-6">
            <p className="font-display text-lg text-[#1a1a1a] font-extrabold leading-tight">
              MonitorAr — Ministério do Meio Ambiente
            </p>
            <p className="text-stone-700 text-xs mt-2 leading-relaxed">
              Acompanhe dados consolidados e a qualidade do ar em tempo real em todo o território nacional.
            </p>

            <a
              href="https://monitorar.mma.gov.br/"
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8BE04E] text-[#1a1a1a] text-xs font-bold w-full justify-center group ${BOTAO}`}
            >
              Acessar MonitorAr MMA
              <svg
                className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <div>
          <SectionLabel>Impactos da Qualidade do Ar na Saúde</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`relative overflow-hidden p-5 rounded-2xl bg-[#FFE0EA] border-[3px] border-[#1a1a1a] shadow-[4px_4px_0_#1a1a1a] ${CARD_HOVER}`}>
              <span aria-hidden className="absolute -right-2 -bottom-3 text-6xl opacity-25 select-none">🫁</span>
              <div className="relative flex items-center gap-2 text-rose-700 font-display font-extrabold text-base mb-2">
                <span className="w-3 h-3 rounded-full bg-rose-600 border-2 border-[#1a1a1a]" />
                Sistemas Respiratório e Cardiovascular
              </div>
              <p className="relative text-xs text-stone-800 leading-relaxed">
                Partículas finas (MP<sub>2,5</sub>) penetram profundamente nos alvéolos pulmonares e caem na corrente sanguínea, aumentando os riscos de asma, bronquite crônica, infartos e AVC.
              </p>
            </div>

            <div className={`relative overflow-hidden p-5 rounded-2xl bg-[#FFF0C2] border-[3px] border-[#1a1a1a] shadow-[4px_4px_0_#1a1a1a] ${CARD_HOVER}`}>
              <span aria-hidden className="absolute -right-2 -bottom-3 text-6xl opacity-25 select-none">👵</span>
              <div className="relative flex items-center gap-2 text-amber-800 font-display font-extrabold text-base mb-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-[#1a1a1a]" />
                Grupos de Maior Vulnerabilidade
              </div>
              <p className="relative text-xs text-stone-800 leading-relaxed">
                Crianças, idosos e pessoas com doenças cardíacas ou pulmonares pré-existentes sofrem efeitos mais severos, mesmo durante curtos períodos de exposição a ar moderado/ruim.
              </p>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Cuidados durante a Passagem do El Niño</SectionLabel>
          <div className="relative overflow-hidden p-6 rounded-2xl bg-[#FFF6B3] border-[3px] border-[#1a1a1a] shadow-[5px_5px_0_#1a1a1a] space-y-4">
            <span aria-hidden className="iqa-wiggle absolute right-4 top-3 text-4xl select-none">🌡️</span>
            <p className="text-sm text-stone-900 leading-relaxed pr-12">
              O fenômeno <strong className="bg-[#FF8A3D] text-[#1a1a1a] font-extrabold px-1.5 py-0.5 rounded-md border-2 border-[#1a1a1a]">El Niño</strong> altera o clima global; no Rio de Janeiro, ele provoca temperaturas acima da média e frentes frias que geram chuvas volumosas. Isso favorece episódios de temporais severos e picos de calor extremo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {[
                {
                  n: "01",
                  titulo: "Hidratação Reforçada",
                  texto: "Beba água constantemente e mantenha ambientes bem arejados ou climatizados para enfrentar os picos de calor extremo.",
                },
                {
                  n: "02",
                  titulo: "Atenção aos Horários",
                  texto: "Evite exercícios ao ar livre nos horários de pico de calor (10h às 16h) e fique atento a alertas de suspensões de atividades externas emitidas pelos órgãos oficiais.",
                },
                {
                  n: "03",
                  titulo: "Acompanhe os Índices",
                  texto: "Monitore diariamente o Alerta Rio e os avisos do Centro de Operações Rio (COR) para planejar suas atividades diárias com segurança.",
                },
                {
                  n: "04",
                  titulo: "Prevenção em Dias de Tempestade",
                  texto: "Em caso de chuva forte, evite deslocamentos, não enfrente bolsões d'água e fique atento às sirenes de aviso da Defesa Civil, caso morar em áreas de risco.",
                },
              ].map((d, i) => (
                <div
                  key={d.n}
                  className="flex items-start gap-3 p-4 rounded-xl bg-white border-[2.5px] border-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a] transition-all duration-200 hover:-translate-y-1 hover:shadow-[5px_5px_0_#1a1a1a]"
                >
                  <span
                    className="shrink-0 w-9 h-9 rounded-full border-[2.5px] border-[#1a1a1a] flex items-center justify-center text-[#1a1a1a] font-mono text-xs font-bold"
                    style={{ backgroundColor: dicasCores[i] }}
                  >
                    {d.n}
                  </span>
                  <div>
                    <p className="font-display text-sm font-extrabold text-[#1a1a1a]">{d.titulo}</p>
                    <p className="text-[11px] text-stone-700 mt-1 leading-relaxed">{d.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ABA 4: JOGO (Eco-Cleaner Mini-Game) ────────────────────────────────────

interface ItemDefinicao {
  id: string;
  poluente: React.ReactNode;
  nomeCompleto: string;
  definicao: string;
  dicaExplicativa: string;
}

const DESAFIOS_JOGO: ItemDefinicao[] = [
  {
    id: "pm25",
    poluente: (
      <span>
        MP<sub>2,5</sub>
      </span>
    ),
    nomeCompleto: "Material Particulado fino",
    definicao:
      "Partículas finas inaláveis que penetram profundamente nos alvéolos pulmonares e entram na corrente sanguínea.",
    dicaExplicativa:
      "Devido ao seu tamanho reduzido (≤ 2,5 µm), o MP₂.₅ consegue ultrapassar as barreiras do sistema respiratório.",
  },
  {
    id: "pm10",
    poluente: (
      <span>
        MP<sub>10</sub>
      </span>
    ),
    nomeCompleto: "Material Particulado",
    definicao:
      "Partículas inaláveis mais grossas que se depositam nas vias aéreas superiores (como poeira de vias e obras).",
    dicaExplicativa:
      "O MP₁₀ inclui poeira, pólen e fuligem que irritam garganta e olhos.",
  },
  {
    id: "o3",
    poluente: (
      <span>
        O<sub>3</sub>
      </span>
    ),
    nomeCompleto: "Ozônio Troposférico",
    definicao:
      "Gás oxidante secundário formado pela reação de compostos orgânicos e NOx impulsionada pela radiação solar.",
    dicaExplicativa:
      "Diferente da camada de ozônio protetora na estratosfera, o O₃ ao nível do solo é um poluente nocivo.",
  },
  {
    id: "no2",
    poluente: (
      <span>
        NO<sub>2</sub>
      </span>
    ),
    nomeCompleto: "Dióxido de Nitrogênio",
    definicao:
      "Gás de tom castanho-avermelhado liberado principalmente pela queima de combustíveis fósseis em veículos.",
    dicaExplicativa:
      "Altas concentrações de NO₂ contribuem para a formação de chuva ácida e contaminação por ozônio.",
  },
  {
    id: "so2",
    poluente: (
      <span>
        SO<sub>2</sub>
      </span>
    ),
    nomeCompleto: "Dióxido de Enxofre",
    definicao:
      "Gás de odor forte irritante emitido principalmente por indústrias e usinas que queimam combustíveis com enxofre.",
    dicaExplicativa:
      "Pode causar sérios problemas respiratórios e é um dos principais precursores da chuva ácida.",
  },
  {
    id: "co",
    poluente: "CO",
    nomeCompleto: "Monóxido de Carbono",
    definicao:
      "Gás inodoro e incolor que se liga à hemoglobina e reduz a capacidade de transporte de oxigênio no sangue.",
    dicaExplicativa:
      "Produzido pela combustão incompleta em veículos e processos industriais.",
  },
];

const embaralharArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

// Confete decorativo para a tela de vitória
const CORES_CONFETE = [TEMA.destaque, TEMA.rosa, TEMA.azul, TEMA.verde, TEMA.laranja, TEMA.roxo];
function Confete() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {Array.from({ length: 36 }).map((_, i) => (
        <span
          key={i}
          className="iqa-confetti absolute top-0 block border-2 border-[#1a1a1a]"
          style={{
            left: `${(i * 97) % 100}%`,
            width: i % 3 === 0 ? 10 : 14,
            height: i % 3 === 0 ? 10 : 7,
            borderRadius: i % 4 === 0 ? "9999px" : "2px",
            backgroundColor: CORES_CONFETE[i % CORES_CONFETE.length],
            animationDuration: `${3 + ((i * 7) % 5) * 0.6}s`,
            animationDelay: `${((i * 13) % 20) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}

export function JogoTab() {
  const [cartasPoluentes, setCartasPoluentes] = useState<ItemDefinicao[]>([]);
  const [cartasDefinicoes, setCartasDefinicoes] = useState<ItemDefinicao[]>([]);

  const [poluenteSelecionado, setPoluenteSelecionado] = useState<string | null>(null);
  const [definicaoSelecionada, setDefinicaoSelecionada] = useState<string | null>(null);

  const [acertos, setAcertos] = useState<string[]>([]);
  const [tentativas, setTentativas] = useState<number>(0);
  const [erroAtivo, setErroAtivo] = useState<boolean>(false);

  const reiniciarJogo = () => {
    setCartasPoluentes(embaralharArray(DESAFIOS_JOGO));
    setCartasDefinicoes(embaralharArray(DESAFIOS_JOGO));
    setAcertos([]);
    setTentativas(0);
    resetSelecao();
  };

  useEffect(() => {
    reiniciarJogo();
  }, []);

  const resetSelecao = () => {
    setPoluenteSelecionado(null);
    setDefinicaoSelecionada(null);
    setErroAtivo(false);
  };

  const checarPar = (pId: string, dId: string) => {
    setTentativas((prev) => prev + 1);

    if (pId === dId) {
      setAcertos((prev) => [...prev, pId]);
      resetSelecao();
    } else {
      setErroAtivo(true);
      setTimeout(() => {
        resetSelecao();
      }, 800);
    }
  };

  const handleSelectPoluente = (id: string) => {
    if (acertos.includes(id) || erroAtivo) return;
    setPoluenteSelecionado(id);
    if (definicaoSelecionada) {
      checarPar(id, definicaoSelecionada);
    }
  };

  const handleSelectDefinicao = (id: string) => {
    if (acertos.includes(id) || erroAtivo) return;
    setDefinicaoSelecionada(id);
    if (poluenteSelecionado) {
      checarPar(poluenteSelecionado, id);
    }
  };

  const precisao = tentativas > 0 ? Math.round((acertos.length / tentativas) * 100) : 0;
  const progressoPct = (acertos.length / DESAFIOS_JOGO.length) * 100;

  const classeCarta = (isAcertado: boolean, isErro: boolean, isSelected: boolean) =>
    isAcertado
      ? "bg-[#C9F27B] text-[#1a1a1a] cursor-default shadow-[2px_2px_0_#1a1a1a] opacity-90"
      : isErro
      ? "bg-[#FFC2C2] text-rose-900 iqa-shake shadow-[2px_2px_0_#1a1a1a]"
      : isSelected
      ? "bg-[#33CCFF] text-[#1a1a1a] font-bold -translate-y-1 shadow-[5px_5px_0_#1a1a1a]"
      : "bg-white text-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a] hover:-translate-y-0.5 hover:bg-[#FFFBEA] hover:shadow-[4px_4px_0_#1a1a1a]";

  return (
    <div className={`w-full ${CARD} overflow-hidden text-stone-900`}>
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-[#9B5CFF] border-b-[3px] border-[#1a1a1a] overflow-hidden">
        <span aria-hidden className="absolute -right-6 -top-8 w-28 h-28 rounded-full bg-[#FF5FA2] border-[3px] border-[#1a1a1a] opacity-60" />
        <span aria-hidden className="absolute right-24 -bottom-6 w-14 h-14 rounded-full bg-[#33CCFF] border-[3px] border-[#1a1a1a] opacity-60" />
        <div className="relative">
          <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white tracking-tight [text-shadow:2px_2px_0_#1a1a1a]">
            🧩 Você conhece os poluentes monitorados pela estação PUC-Rio?
          </h3>
          <p className="text-xs text-white/95 font-sans font-semibold mt-1.5">
            Associe a fórmula química do poluente à sua definição correspondente.
          </p>
        </div>

        <div className="relative flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-[#8BE04E] px-3 py-1.5 rounded-full border-[2.5px] border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a] text-xs font-mono">
            <span className="text-[#1a1a1a] font-bold">Progresso:</span>
            <span className="text-[#1a1a1a] font-bold">
              {acertos.length} / {DESAFIOS_JOGO.length}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#2699E6] px-3 py-1.5 rounded-full border-[2.5px] border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a] text-xs font-mono">
            <span className="text-[#1a1a1a] font-bold">Tentativas:</span>
            <span className="text-[#1a1a1a] font-bold">{tentativas}</span>
          </div>

          <button
            onClick={reiniciarJogo}
            className={`text-xs font-mono font-bold text-[#1a1a1a] bg-[#33CCFF] px-3 py-1.5 rounded-full flex items-center gap-1.5 ${BOTAO}`}
          >
            🔄 Reiniciar
          </button>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="px-6 pt-5">
        <div className="h-4 w-full rounded-full bg-stone-100 border-[2.5px] border-[#1a1a1a] overflow-hidden">
          <div
            className="h-full transition-all duration-500 ease-out bg-[repeating-linear-gradient(45deg,#8BE04E_0_10px,#6CC73A_10px_20px)] border-r-[2.5px] border-[#1a1a1a]"
            style={{ width: `${progressoPct}%`, borderRightWidth: progressoPct > 0 && progressoPct < 100 ? 2.5 : 0 }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
        <div className="space-y-3">
          <span className="text-[11px] font-mono font-bold text-[#1a1a1a] uppercase tracking-widest inline-block bg-[#FF5FA2] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[2px_2px_0_#1a1a1a]">
            1. Poluente
          </span>
          <div className="space-y-3">
            {cartasPoluentes.map((item) => {
              const isAcertado = acertos.includes(item.id);
              const isSelected = poluenteSelecionado === item.id;
              const isErro = isSelected && erroAtivo;

              return (
                <button
                  key={`p-${item.id}`}
                  disabled={isAcertado}
                  onClick={() => handleSelectPoluente(item.id)}
                  className={`w-full p-4 rounded-xl border-[2.5px] border-[#1a1a1a] text-left font-mono text-sm transition-all duration-200 flex items-center justify-between ${classeCarta(
                    isAcertado,
                    isErro,
                    isSelected
                  )}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-extrabold">{item.poluente}</span>
                    <span className="text-xs text-stone-700 font-sans font-semibold truncate">
                      ({item.nomeCompleto})
                    </span>
                  </div>
                  {isAcertado && (
                    <span className="iqa-pop w-7 h-7 rounded-full bg-[#1a1a1a] text-[#C9F27B] text-sm font-bold flex items-center justify-center">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-[11px] font-mono font-bold text-[#1a1a1a] uppercase tracking-widest inline-block bg-[#2699E6] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[2px_2px_0_#1a1a1a]">
            2. Definição
          </span>
          <div className="space-y-3">
            {cartasDefinicoes.map((item) => {
              const isAcertado = acertos.includes(item.id);
              const isSelected = definicaoSelecionada === item.id;
              const isErro = isSelected && erroAtivo;

              return (
                <button
                  key={`d-${item.id}`}
                  disabled={isAcertado}
                  onClick={() => handleSelectDefinicao(item.id)}
                  className={`w-full p-3.5 rounded-xl border-[2.5px] border-[#1a1a1a] text-xs text-left leading-relaxed transition-all duration-200 flex items-start justify-between gap-3 ${classeCarta(
                    isAcertado,
                    isErro,
                    isSelected
                  )}`}
                >
                  <span>{item.definicao}</span>
                  {isAcertado && (
                    <span className="iqa-pop shrink-0 w-7 h-7 rounded-full bg-[#1a1a1a] text-[#C9F27B] text-sm font-bold flex items-center justify-center">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {acertos.length === DESAFIOS_JOGO.length && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1a1a]/70 backdrop-blur-sm animate-in fade-in duration-300">
          <Confete />
          <div className="iqa-pop p-8 rounded-3xl bg-[#FFF8E1] border-[3px] border-[#1a1a1a] text-center space-y-4 max-w-md w-full shadow-[8px_8px_0_#1a1a1a] relative">
            <div className="iqa-wiggle inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#33CCFF] border-[3px] border-[#1a1a1a] text-4xl mb-1 shadow-[4px_4px_0_#1a1a1a]">
              🏆
            </div>

            <h4 className="font-display text-[#1a1a1a] font-extrabold text-2xl tracking-tight">
              Parabéns! Desafio concluído!
            </h4>

            <p className="text-stone-800 text-sm font-sans leading-relaxed">
              Você associou todos os poluentes atmosféricos às suas respectivas descrições com{" "}
              <span className="bg-[#8BE04E] text-[#1a1a1a] font-bold px-1.5 rounded border-2 border-[#1a1a1a]">{precisao}% de aproveitamento</span> ({tentativas} tentativas).
            </p>

            <div className="pt-2">
              <button
                onClick={reiniciarJogo}
                className={`w-full text-sm font-mono font-bold bg-[#FF5FA2] text-[#1a1a1a] py-3 rounded-xl ${BOTAO}`}
              >
                Jogar Novamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

const ABAS: { id: Tab; label: string; icone: string; cor: string }[] = [
  { id: "dashboard", label: "Mapa", icone: "🗺️", cor: TEMA.verde },
  { id: "graficos", label: "Painel e Gráficos", icone: "📈", cor: TEMA.azul },
  { id: "jogo", label: "Desafio", icone: "🧩", cor: TEMA.rosa },
  { id: "informacoes", label: "Informações", icone: "💡", cor: TEMA.laranja },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dadosApi, setDadosApi] = useState<RespostaFront | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscarDados = async () => {
    setCarregando(true);
    try {
      const resposta = await axios.get<RespostaApiDjango>(
        "https://iqa-lab.onrender.com/"
      );
      const raw = resposta.data;

      const ultima = raw.dados && raw.dados.length > 0 ? raw.dados[0] : null;

      if (!ultima) {
        throw new Error("Nenhum dado retornado da API.");
      }

      const dadosOrdenados = [...raw.dados].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const limite24h = new Date().getTime() - 24 * 60 * 60 * 1000;

      const historicoMapeado: ItemHistorico[] = dadosOrdenados
        .filter(
          (d) =>
            d &&
            d.timestamp &&
            new Date(d.timestamp).getTime() >= limite24h
        )
        .map((d) => ({
          hora: extrairHora(d.timestamp),
          IQA: d.iqa ?? 0,
          "PM2.5": d.pm25 ?? 0,
          PM10: d.pm10 ?? 0,
          SO2: d.so2 ?? 0,
          NO2: d.no2 ?? 0,
          CO: d.co ?? 0,
          O3: d.o3 ?? 0,
          Temperatura: d.temperatura ?? 0,
          Umidade: d.umidade ?? 0,
        }));

      const payloadFormatado: RespostaFront = {
        iqaResumo: {
          iqa: raw.iqa_resumo.iqa,
          qualidade: raw.iqa_resumo.qualidade,
          nivelSaude: raw.iqa_resumo.nivel_saude,
          poluenteDeterminante: raw.iqa_resumo.poluente_determinante,
          cor: raw.iqa_resumo.cor,
        },
        ultimaMedicao: {
          timestamp: ultima.timestamp,
          temperatura: ultima.temperatura,
          umidade: ultima.umidade,
          pm25: ultima.pm25,
          pm10: ultima.pm10,
          so2: ultima.so2,
          no2: ultima.no2,
          co: ultima.co,
          o3: ultima.o3,
        },
        historico: historicoMapeado,
      };

      setDadosApi(payloadFormatado);
      setErro(null);
    } catch (err) {
      console.error("Erro ao buscar dados do Django:", err);
      setErro("Não foi possível conectar ao servidor Django.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    buscarDados();
  }, []);

  return (
    <div
      className="relative min-h-screen bg-[#FFF8E1] text-stone-900 flex flex-col font-sans selection:bg-[#33CCFF] selection:text-[#1a1a1a]"
      style={{
        backgroundImage: "radial-gradient(rgba(26,26,26,0.12) 1.3px, transparent 1.3px)",
        backgroundSize: "22px 22px",
      }}
    >
      <EstilosGlobais />
      <DecoracaoFundo />

      {/* Top Navbar */}
      <div className="sticky top-0 z-50">
        <header className="border-b-[3px] border-[#1a1a1a] bg-[#33CCFF]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[72px] py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="iqa-wiggle w-11 h-11 rounded-2xl bg-[#1a1a1a] border-[3px] border-[#1a1a1a] flex items-center justify-center text-[#33CCFF] shadow-[3px_3px_0_#FF5FA2]">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
                  <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
                  <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
                </svg>
              </div>
              <div>
                <h1 className="font-display text-2xl font-extrabold leading-none text-[#1a1a1a] tracking-tight">
                  IQArLab
                </h1>
                <p className="inline-block text-[10px] font-mono text-white bg-[#1a1a1a] font-bold uppercase tracking-widest mt-1 px-1.5 py-0.5 rounded">
                  Estação PUC-Rio
                </p>
              </div>
            </div>

            {/* Tab Selection */}
            <nav className="order-3 md:order-none w-full md:w-auto flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              {ABAS.map((t) => {
                const ativa = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border-[2.5px] border-[#1a1a1a] transition-all duration-150 ${
                      ativa
                        ? "text-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a] -translate-y-0.5"
                        : "bg-white/70 text-[#1a1a1a] hover:bg-white hover:-translate-y-0.5 hover:shadow-[2px_2px_0_#1a1a1a]"
                    }`}
                    style={ativa ? { backgroundColor: t.cor } : undefined}
                  >
                    <span aria-hidden>{t.icone}</span>
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Refresh Action */}
            <button
              onClick={buscarDados}
              className={`p-2.5 rounded-xl bg-white text-[#1a1a1a] hover:bg-[#8BE04E] ${BOTAO}`}
              title="Atualizar dados"
            >
              <svg
                className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
              </svg>
            </button>
          </div>
        </header>
        {dadosApi && (
          <FaixaAoVivo iqa={dadosApi.iqaResumo} timestamp={dadosApi.ultimaMedicao?.timestamp} />
        )}
      </div>

      {/* Main Content Body */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {carregando && !dadosApi && tab !== "jogo" ? (
          <div className="h-96 flex flex-col items-center justify-center gap-5">
            <div className="flex items-end gap-2">
              {[TEMA.rosa, TEMA.destaque, TEMA.azul, TEMA.verde].map((c, i) => (
                <span
                  key={i}
                  className="iqa-bounce-dot w-5 h-5 rounded-full border-[3px] border-[#1a1a1a]"
                  style={{ backgroundColor: c, animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
            <span className="text-[#1a1a1a] font-mono text-xs font-bold bg-white border-[2.5px] border-[#1a1a1a] rounded-full px-4 py-1.5 shadow-[3px_3px_0_#1a1a1a]">
              Carregando dados da estação de monitoramento...
            </span>
          </div>
        ) : erro && tab !== "jogo" ? (
          <div className="h-96 flex flex-col items-center justify-center text-center gap-4">
            <div className="iqa-wiggle p-4 rounded-full bg-[#FFC2C2] border-[3px] border-[#1a1a1a] text-red-700 shadow-[4px_4px_0_#1a1a1a]">
              <svg
                className="w-8 h-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="text-red-700 font-mono text-sm max-w-md font-bold">
              {erro}
            </span>
            <button
              onClick={buscarDados}
              className={`px-5 py-2.5 bg-[#33CCFF] text-[#1a1a1a] rounded-xl text-xs font-mono font-bold ${BOTAO}`}
            >
              Tentar Novamente
            </button>
          </div>
        ) : (
          <>
            {tab === "dashboard" && dadosApi && (
              <DashboardTab
                iqa={dadosApi.iqaResumo}
                m={dadosApi.ultimaMedicao}
              />
            )}
            {tab === "graficos" && dadosApi && (
              <GraficosTab historico={dadosApi.historico} />
            )}
            {tab === "informacoes" && <InformacoesTab />}
            {tab === "jogo" && <JogoTab />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-auto">
        <svg aria-hidden className="block w-full h-5 text-[#1a1a1a]" viewBox="0 0 1200 20" preserveAspectRatio="none">
          <path d="M0 20 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 T 250 10 T 300 10 T 350 10 T 400 10 T 450 10 T 500 10 T 550 10 T 600 10 T 650 10 T 700 10 T 750 10 T 800 10 T 850 10 T 900 10 T 950 10 T 1000 10 T 1050 10 T 1100 10 T 1150 10 T 1200 10 V 20 Z" fill="currentColor" />
        </svg>
        <div className="bg-[#1a1a1a] py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono font-bold">
            <p className="text-[#33CCFF]">© Laboratório de Química Atmosférica — PUC-Rio</p>
            <p className="text-white">Mestrado Profissional em Ciência da Sustentabilidade</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
