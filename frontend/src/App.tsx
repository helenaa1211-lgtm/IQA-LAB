import React, { useState, useEffect, useMemo } from "react";
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
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── CONFIGURAÇÕES DO SITE (edite aqui) ──────────────────────────────────────

const API_BASE = "https://iqa-lab.onrender.com";
const TITULO_PAGINA = "IQARio | Qualidade do ar na estação PUC-Rio";

// O sensor mede monóxido de carbono (CO)?
// false → o cartão de CO mostra "não monitorado" e o CO sai dos gráficos.
// true  → os valores (que chegam da API em mg/m³) passam a ser exibidos em ppm,
//         a unidade usada pela CONAMA 506/2024.
const CO_MONITORADO = false;

// Dados da estação. Campos com texto vazio ("") não aparecem no site.
const ESTACAO = {
  nome: "Estação PUC-Rio",
  equipamento: "MS800A — monitor compacto de baixo custo",
  instalacao: "18/11/2025",
  endereco: "Campus da PUC-Rio — Rua Marquês de São Vicente, 225, Gávea, Rio de Janeiro — RJ",
  localInstalacao: "", // ex.: "Terraço do prédio X" (preencher)
  altura: "", // ex.: "Entrada de ar a 4 m do solo" (preencher)
  frequencia: "1 leitura por minuto (60 leituras por hora)",
  laboratorio: "Laboratório de Química Atmosférica (LQA)",
  latitude: -22.979187,
  longitude: -43.233206,
};

// Fotos da estação: coloque os arquivos em frontend/public/estacao/
// e liste aqui, por exemplo { src: "/estacao/foto1.jpg", legenda: "Vista geral" }.
const FOTOS_ESTACAO: { src: string; legenda: string }[] = [];

// Relatórios: coloque o PDF em frontend/public/relatorios/ e preencha "url",
// por exemplo "/relatorios/relatorio-anual-ms800a.pdf". Sem url, aparece "Em breve".
const RELATORIOS: {
  titulo: string;
  periodo: string;
  data: string;
  descricao: string;
  url: string;
}[] = [
  {
    titulo: "Relatório anual de monitoramento — MS800A / PUC-Rio",
    periodo: "Primeiro ano de operação (a partir de 18/11/2025)",
    data: "",
    descricao:
      "Análise da série de um ano da estação, produzida como parte da dissertação do Mestrado Profissional em Ciência da Sustentabilidade.",
    url: "",
  },
];

// Estações vizinhas de outra rede. As posições são APROXIMADAS (centro do bairro);
// substitua pelas coordenadas oficiais quando tiver.
const ESTACOES_VIZINHAS: {
  nome: string;
  rede: string;
  tipo: "referencia" | "compacta";
  latitude: number;
  longitude: number;
  aproximada: boolean;
  nota: string;
}[] = [
  {
    nome: "Copacabana",
    rede: "MonitorAr-Rio (Prefeitura)",
    tipo: "referencia",
    latitude: -22.9711,
    longitude: -43.1863,
    aproximada: true,
    nota: "Estação de referência, com analisadores de métodos certificados.",
  },
  {
    nome: "Lagoa",
    rede: "MonitorAr-Rio (Prefeitura)",
    tipo: "compacta",
    latitude: -22.9733,
    longitude: -43.212,
    aproximada: true,
    nota:
      "Estação compacta de baixo custo, a poucos quilômetros da PUC-Rio. É uma boa candidata para comparar com o MS800A.",
  },
];

const LINKS = {
  monitorArRio: "https://ambienteclima.prefeitura.rio/monitoramento-diario-da-qualidade-do-ar/",
  monitorArMMA: "https://monitorar.mma.gov.br/",
  orientacaoIQAr:
    "https://www.gov.br/mma/pt-br/assuntos/meio-ambiente-urbano-recursos-hidricos-qualidade-ambiental/qualidade-do-ar/indice-de-qualidade-do-ar-iqar/orientacao-tecnica-indice-de-qualidade-do-ar-jan-25.pdf",
  ineaIQAr: "https://www.inea.rj.gov.br/ar-agua-e-solo/qualidade-do-ar/iqar/",
  ineaSIGQAr: "https://portalsigqar.inea.rj.gov.br/",
  institutoAr: "https://institutoar.org.br/",
  respiraAmazonia: "https://ipam.org.br/wp-content/uploads/2024/11/RESPIRA-AMAZONIA-v2-1-1.pdf",
  instagram: "https://www.instagram.com/lqapucrio",
};

const LEITURAS: { referencia: string; link: string; rotuloLink: string }[] = [
  {
    referencia:
      "Vormittag, E. M. P. A. A.; Cirqueira, S. S. R. (2021). Análise do monitoramento da qualidade do ar no Brasil. Estudos Avançados, 35(102).",
    link: "https://doi.org/10.1590/s0103-4014.2021.35102.002",
    rotuloLink: "doi:10.1590/s0103-4014.2021.35102.002",
  },
  {
    referencia:
      "De Simoni, W. et al. (2021). O Estado da Qualidade do Ar no Brasil. Working Paper. São Paulo: WRI Brasil.",
    link: "https://wribrasil.org.br/sites/default/files/wri-o-estado-da-_qualidade-do-ar-no-brasil.pdf",
    rotuloLink: "PDF (WRI Brasil)",
  },
  {
    referencia:
      "Instituto Alana e Instituto Ar (2024). Qualidade do ar em alerta: análise comparativa dos níveis críticos e planos de emergência entre o Brasil e oito países.",
    link: "https://alana.org.br/wp-content/uploads/2024/08/Qualidade-do-ar-em-alerta-2024.pdf",
    rotuloLink: "PDF (alana.org.br)",
  },
  {
    referencia:
      "Coalizão Respira Amazônia (2024). Desafios e perspectivas do monitoramento da qualidade do ar na Amazônia Legal — policy brief.",
    link: "https://ipam.org.br/wp-content/uploads/2024/11/RESPIRA-AMAZONIA-v2-1-1.pdf",
    rotuloLink: "PDF (IPAM)",
  },
  {
    referencia:
      "Ministério do Meio Ambiente e Mudança do Clima (2025). Orientação técnica — Índice de Qualidade do Ar (IQAr).",
    link: LINKS.orientacaoIQAr,
    rotuloLink: "PDF (gov.br/mma)",
  },
];

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
  IQA: number | null;
  "PM2.5": number | null;
  PM10: number | null;
  SO2: number | null;
  NO2: number | null;
  CO: number | null;
  O3: number | null;
  Temperatura: number | null;
  Umidade: number | null;
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

// A API envia o CO em mg/m³; a CONAMA 506/2024 expressa o CO em ppm (25 °C, 1 atm).
const coParaPpm = (mgM3: number | null | undefined) =>
  mgM3 === null || mgM3 === undefined || isNaN(mgM3) ? null : (mgM3 * 24.45) / 28.01;

const numeroOuNulo = (v: number | null | undefined) =>
  v === null || v === undefined || isNaN(v) ? null : v;

const distanciaKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

type Tab = "dashboard" | "graficos" | "informacoes" | "jogo" | "sobre";

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
    "ESTAÇÃO PUC-RIO — SENSOR DE BAIXO CUSTO EM AVALIAÇÃO",
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

// ─── COMPONENTES COMUNS ───────────────────────────────────────────────────────

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

function IconeLinkExterno({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// Aviso de que a estação é de baixo custo e está em avaliação
function AvisoBaixoCusto({ compacto = false }: { compacto?: boolean }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-2xl bg-[#FFF6B3] border-[3px] border-[#1a1a1a] shadow-[4px_4px_0_#1a1a1a] ${
        compacto ? "p-3" : "p-4"
      }`}
    >
      <span className="shrink-0 w-8 h-8 rounded-full bg-[#1a1a1a] text-[#FFF6B3] flex items-center justify-center font-display font-extrabold text-lg" aria-hidden>
        !
      </span>
      <p className={`${compacto ? "text-[11px]" : "text-xs sm:text-sm"} text-stone-900 leading-relaxed font-semibold`}>
        Dados de um sensor de baixo custo, em fase de avaliação, sem validação por órgão ambiental. Para fins oficiais, consulte o{" "}
        <a
          href={LINKS.monitorArRio}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-2 underline-offset-2 font-bold hover:text-[#2699E6]"
        >
          MonitorAr-Rio
        </a>
        .
      </p>
    </div>
  );
}

// ─── FAIXAS DO IQAr (CONAMA 506/2024 e orientação técnica do MMA) ────────────

const FAIXAS_IQAR = [
  {
    rotulo: "Boa",
    faixa: "0 – 40",
    de: 0,
    ate: 40,
    cor: "#00a859",
    corMedidor: "#00a859",
    bgCor: "#D8F8E6",
    emoji: "😄",
    quem: "Nenhum grupo em especial",
    saude: "Qualidade do ar satisfatória. Não são esperados efeitos à saúde.",
  },
  {
    rotulo: "Moderada",
    faixa: "41 – 80",
    de: 40,
    ate: 80,
    cor: "#A16207",
    corMedidor: "#FACC15",
    bgCor: "#FFF0C2",
    emoji: "🙂",
    quem: "Grupos sensíveis",
    saude:
      "Pessoas de grupos sensíveis (crianças, idosos e pessoas com doenças respiratórias e cardíacas) podem apresentar tosse seca e cansaço. A população em geral não é afetada.",
  },
  {
    rotulo: "Ruim",
    faixa: "81 – 120",
    de: 80,
    ate: 120,
    cor: "#ea580c",
    corMedidor: "#ea580c",
    bgCor: "#FFE1CC",
    emoji: "😷",
    quem: "Toda a população, sobretudo grupos sensíveis",
    saude:
      "Toda a população pode apresentar tosse seca, cansaço e ardor nos olhos, nariz e garganta. Pessoas de grupos sensíveis podem ter efeitos mais sérios.",
  },
  {
    rotulo: "Muito Ruim",
    faixa: "121 – 200",
    de: 120,
    ate: 200,
    cor: "#dc2626",
    corMedidor: "#dc2626",
    bgCor: "#FFD6D6",
    emoji: "🤢",
    quem: "Toda a população, sobretudo grupos sensíveis",
    saude:
      "Toda a população pode ter agravamento desses sintomas, além de falta de ar e respiração ofegante. Efeitos ainda mais graves para os grupos sensíveis.",
  },
  {
    rotulo: "Péssima",
    faixa: "201 – 400",
    de: 200,
    ate: 400,
    cor: "#7c3aed",
    corMedidor: "#7c3aed",
    bgCor: "#EADCFF",
    emoji: "☠️",
    quem: "Toda a população",
    saude:
      "Toda a população pode apresentar sérios riscos de doenças respiratórias e cardiovasculares. Aumento de mortes prematuras em pessoas de grupos sensíveis.",
  },
];

const indiceFaixaAtual = (valor: number) => {
  if (valor <= 40) return 0;
  if (valor <= 80) return 1;
  if (valor <= 120) return 2;
  if (valor <= 200) return 3;
  return 4;
};

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

// Marcador das estações de outra rede (losango branco com contorno, sem cor de IQAr)
const criarIconeVizinha = (tipo: "referencia" | "compacta") => {
  const preenchimento = tipo === "referencia" ? "#ffffff" : "#E7E5E4";
  return L.divIcon({
    className: "custom-station-pin",
    html: `
      <div style="width: 26px; height: 26px; filter: drop-shadow(2px 2px 0px #1a1a1a);">
        <svg viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
          <rect x="5" y="5" width="16" height="16" transform="rotate(45 13 13)" fill="${preenchimento}" stroke="#1a1a1a" stroke-width="2.5" stroke-dasharray="${
            tipo === "compacta" ? "3 2" : "0"
          }" />
        </svg>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
  });
};

// Medidor semicircular do IQAr (0 a 400, como a faixa Péssima da orientação do MMA)
const MEDIDOR_MAX = 400;

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
      {FAIXAS_IQAR.map((f, i) => (
        <path
          key={i}
          d={caminhoArco(cx, cy, r, (f.de / MEDIDOR_MAX) * 180, (f.ate / MEDIDOR_MAX) * 180)}
          stroke={f.corMedidor}
          strokeWidth={26}
          fill="none"
        />
      ))}
      {/* marcações */}
      {[0, 40, 80, 120, 200, 400].map((t) => {
        const [x, y] = pontoNoArco(cx, cy, r - 30, (t / MEDIDOR_MAX) * 180);
        return (
          <text key={t} x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight={700} fill="#1a1a1a" fontFamily="Space Mono, monospace">
            {t}
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

export function DashboardTab({
  iqa,
  m,
  irPara,
}: {
  iqa?: IQAResumo | null;
  m?: Medicao | null;
  irPara: (t: Tab) => void;
}) {
  const [faixaAberta, setFaixaAberta] = useState<number | null>(null);

  if (!iqa || !m) {
    return (
      <div className={`w-full h-[600px] flex items-center justify-center ${CARD}`}>
        <span className="text-stone-700 font-mono text-sm font-bold">
          Aguardando dados de medição da estação...
        </span>
      </div>
    );
  }

  const lat = typeof m.latitude === "number" && !isNaN(m.latitude) ? m.latitude : ESTACAO.latitude;
  const lng = typeof m.longitude === "number" && !isNaN(m.longitude) ? m.longitude : ESTACAO.longitude;
  const posicaoEstacao: [number, number] = [lat, lng];

  const limitesMapa: [number, number][] = [
    posicaoEstacao,
    ...ESTACOES_VIZINHAS.map((e) => [e.latitude, e.longitude] as [number, number]),
  ];

  const corIqa = obterCorIQA(iqa.cor, iqa.qualidade);
  const poluenteFormatado = normalizarPoluente(iqa.poluenteDeterminante || "");
  const valorIqaFormatado = formatarNumero(iqa.iqa ?? 0, 0);
  const dataHoraFormatada = m.timestamp ? formatarDataHora(m.timestamp) : "N/A";
  const iconeEstacao = criarIconeEstacao(corIqa);

  const faixaAtual = indiceFaixaAtual(iqa.iqa ?? 0);
  const infoFaixaAtual = FAIXAS_IQAR[faixaAtual];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="w-full font-mono">
        <div className="flex items-center gap-3 mb-4 px-1">
          <span className="text-xs text-[#1a1a1a] font-bold tracking-wider uppercase bg-[#33CCFF] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[3px_3px_0_#1a1a1a]">
            ÍNDICE DE QUALIDADE DO AR (IQAr) &mdash; RESOLUÇÃO CONAMA Nº 506/2024
          </span>
          <div className="flex-1 border-t-[3px] border-dashed border-[#1a1a1a]/40" />
        </div>

        <p className="font-sans text-sm text-stone-800 mb-5 px-1 max-w-3xl leading-relaxed">
          O <strong>IQAr</strong> transforma as concentrações de vários poluentes numa escala única, sem unidade. Quanto maior o número, pior o ar. O valor divulgado é o do poluente em pior situação.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 w-full items-stretch">
          {/* Medidor + significado da faixa atual */}
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

            <div
              className="mt-4 w-full rounded-xl border-[2.5px] border-[#1a1a1a] p-3 font-sans"
              style={{ backgroundColor: infoFaixaAtual.bgCor }}
            >
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#1a1a1a]">
                O que significa agora
              </p>
              <p className="text-xs text-stone-900 mt-1 leading-relaxed">{infoFaixaAtual.saude}</p>
              <p className="text-[11px] text-stone-700 mt-1.5 font-semibold">
                Quem deve ter atenção: {infoFaixaAtual.quem}.
              </p>
            </div>
          </div>

          {/* Faixas: o significado aparece ao passar o mouse ou tocar */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 w-full">
              {FAIXAS_IQAR.map((item, index) => {
                const ativa = index === faixaAtual;
                const aberta = faixaAberta === index;
                return (
                  <div
                    key={index}
                    role="button"
                    tabIndex={0}
                    aria-expanded={aberta}
                    onMouseEnter={() => setFaixaAberta(index)}
                    onMouseLeave={() => setFaixaAberta(null)}
                    onFocus={() => setFaixaAberta(index)}
                    onBlur={() => setFaixaAberta(null)}
                    onClick={() => setFaixaAberta(aberta ? null : index)}
                    className={`relative cursor-pointer flex xl:flex-col items-center xl:items-start justify-between gap-2 px-4 py-3 rounded-2xl border-[3px] border-[#1a1a1a] transition-all duration-200 hover:-translate-y-1 ${
                      ativa ? "shadow-[6px_6px_0_#1a1a1a] -translate-y-1 scale-[1.03]" : "shadow-[3px_3px_0_#1a1a1a]"
                    } ${aberta ? "z-30" : "z-0"}`}
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
                      style={{ backgroundColor: item.corMedidor }}
                    />

                    {aberta && (
                      <div
                        className={`iqa-pop absolute top-full mt-2 w-64 max-w-[80vw] p-3 rounded-xl bg-white border-[2.5px] border-[#1a1a1a] shadow-[4px_4px_0_#1a1a1a] font-sans ${
                          index >= 3 ? "right-0" : "left-0"
                        }`}
                      >
                        <p className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: item.cor }}>
                          {item.rotulo} · {item.faixa}
                        </p>
                        <p className="text-xs text-stone-900 mt-1 leading-relaxed">{item.saude}</p>
                        <p className="text-[11px] text-stone-700 mt-1.5 font-semibold">Quem deve ter atenção: {item.quem}.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-stone-600 font-mono font-bold px-1">
              Passe o mouse ou toque numa faixa para ver o que ela significa para a saúde.
            </p>
          </div>
        </div>
      </div>

      {/* Por que monitorar / aviso de baixo custo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <p className="font-display text-lg font-extrabold text-[#1a1a1a]">Por que monitorar o ar?</p>
          <p className="text-xs text-stone-800 mt-2 leading-relaxed">
            A poluição do ar afeta principalmente o sistema respiratório e o cardiovascular, e pesa mais sobre crianças, idosos e pessoas com doenças crônicas. Medir é o que permite alertar a população e orientar políticas públicas. No Brasil, as estações de monitoramento ainda são poucas.
          </p>
          <button
            onClick={() => irPara("sobre")}
            className={`mt-4 text-xs font-mono font-bold text-[#1a1a1a] bg-[#33CCFF] px-4 py-2 rounded-xl ${BOTAO}`}
          >
            Saiba mais sobre o projeto →
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <AvisoBaixoCusto />
          <p className="text-[11px] text-stone-700 font-semibold px-1 leading-relaxed">
            A estação PUC-Rio usa um monitor compacto ({ESTACAO.equipamento.split(" — ")[0]}). Esse tipo de equipamento custa menos e permite mais pontos de medição, mas tem incertezas maiores que as estações de referência e precisa ser comparado com elas.
          </p>
        </div>
      </div>

      {/* Mapa + localização */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className={`w-full h-[440px] overflow-hidden relative ${CARD}`}>
          <MapContainer
            bounds={limitesMapa}
            boundsOptions={{ padding: [50, 50] }}
            scrollWheelZoom={false}
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
                <div className="w-[300px] font-mono text-stone-900 relative bg-white">
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
                      <span className="font-bold tracking-wide text-xs" style={{ color: corIqa }}>
                        {iqa.qualidade || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between my-2 text-xs">
                      <span className="text-stone-600 uppercase text-[10px] tracking-wider font-bold">
                        POLUENTE DETERMINANTE:
                      </span>
                      <span className="font-bold text-stone-900 text-xs">{poluenteFormatado}</span>
                    </div>

                    <div className="flex items-center justify-between my-2 text-xs">
                      <span className="text-stone-600 uppercase text-[10px] tracking-wider font-bold">REDE:</span>
                      <span className="font-bold text-stone-900 text-[11px]">LQA/PUC-Rio · baixo custo</span>
                    </div>

                    <div className="mt-3 pt-2.5 border-t-2 border-dashed border-stone-300 flex items-center justify-between text-[10px] text-stone-600">
                      <span className="uppercase tracking-wider font-bold">ÚLTIMA LEITURA</span>
                      <span className="text-stone-900 font-mono font-bold">{dataHoraFormatada}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>

            {ESTACOES_VIZINHAS.map((e) => (
              <Marker key={e.nome} position={[e.latitude, e.longitude]} icon={criarIconeVizinha(e.tipo)}>
                <Popup className="custom-popup">
                  <div className="w-[280px] font-mono text-stone-900 bg-white">
                    <div className="px-4 py-3 bg-stone-200 border-b-[3px] border-[#1a1a1a] pr-8">
                      <p className="font-bold text-xs uppercase tracking-wide text-[#1a1a1a]">{e.nome}</p>
                      <p className="text-[10px] font-bold text-stone-700 mt-0.5">
                        {e.rede} · {e.tipo === "referencia" ? "estação de referência" : "estação compacta"}
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2 font-sans">
                      <p className="text-xs leading-relaxed">{e.nota}</p>
                      <p className="text-[11px] text-stone-700">
                        Outra rede: os dados desta estação não fazem parte deste site.
                        {e.aproximada && " Posição aproximada no mapa."}
                      </p>
                      <p className="text-[11px] font-mono font-bold">
                        {formatarNumero(distanciaKm(lat, lng, e.latitude, e.longitude), 1)} km da estação PUC-Rio
                      </p>
                      <a
                        href={LINKS.monitorArRio}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-mono font-bold underline"
                      >
                        Ver dados no MonitorAr-Rio <IconeLinkExterno className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className={`${CARD} p-5 flex flex-col gap-4`}>
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-600">Localização</p>
            <p className="font-display text-xl font-extrabold text-[#1a1a1a] mt-1">{ESTACAO.nome}</p>
            <p className="text-xs text-stone-800 mt-1 leading-relaxed">{ESTACAO.endereco}</p>
            {ESTACAO.localInstalacao && (
              <p className="text-xs text-stone-800 mt-1 leading-relaxed">{ESTACAO.localInstalacao}</p>
            )}
            <p className="text-[11px] text-stone-600 font-mono font-bold mt-2">
              {lat.toFixed(5).replace(".", ",")}, {lng.toFixed(5).replace(".", ",")}
            </p>
          </div>

          <div className="space-y-2 text-[11px] font-mono font-bold text-[#1a1a1a]">
            <p className="uppercase tracking-widest text-[10px] text-stone-600">Legenda do mapa</p>
            <p className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#1a1a1a]" style={{ backgroundColor: corIqa }} />
              Estação PUC-Rio (cor do IQAr atual)
            </p>
            <p className="flex items-center gap-2">
              <span className="w-3 h-3 rotate-45 bg-white border-2 border-[#1a1a1a]" />
              MonitorAr-Rio — referência
            </p>
            <p className="flex items-center gap-2">
              <span className="w-3 h-3 rotate-45 bg-stone-200 border-2 border-dashed border-[#1a1a1a]" />
              MonitorAr-Rio — compacta
            </p>
            <p className="text-[10px] text-stone-600 font-sans font-semibold leading-relaxed">
              Losangos indicam estações de outra rede, em posição aproximada.
            </p>
          </div>

          {FOTOS_ESTACAO.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {FOTOS_ESTACAO.map((f) => (
                <figure key={f.src} className="rounded-xl overflow-hidden border-[2.5px] border-[#1a1a1a] bg-stone-100">
                  <img src={f.src} alt={f.legenda} className="w-full h-24 object-cover" loading="lazy" />
                  <figcaption className="text-[10px] font-mono font-bold px-2 py-1">{f.legenda}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ABA 2: PAINEL E GRÁFICOS ────────────────────────────────────────────────

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

const METRICAS_GRAFICO: Metrica[] = METRICAS.filter((m) => m !== "CO" || CO_MONITORADO);

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
    unit: "ppm",
    color: "#E11D48",
    decimals: 2,
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

// Valor de uma métrica a partir de um registro da API (CO convertido para ppm)
const valorDaApi = (d: DadoApi, metrica: Metrica): number | null => {
  switch (metrica) {
    case "IQA":
      return numeroOuNulo(d.iqa);
    case "PM2.5":
      return numeroOuNulo(d.pm25);
    case "PM10":
      return numeroOuNulo(d.pm10);
    case "SO2":
      return numeroOuNulo(d.so2);
    case "NO2":
      return numeroOuNulo(d.no2);
    case "CO":
      return CO_MONITORADO ? coParaPpm(d.co) : null;
    case "O3":
      return numeroOuNulo(d.o3);
    case "Temperatura":
      return numeroOuNulo(d.temperatura);
    case "Umidade":
      return numeroOuNulo(d.umidade);
  }
};

const valorDaMedicao = (m: Medicao, metrica: Metrica): number | null => {
  switch (metrica) {
    case "PM2.5":
      return numeroOuNulo(m.pm25);
    case "PM10":
      return numeroOuNulo(m.pm10);
    case "SO2":
      return numeroOuNulo(m.so2);
    case "NO2":
      return numeroOuNulo(m.no2);
    case "CO":
      return CO_MONITORADO ? coParaPpm(m.co) : null;
    case "O3":
      return numeroOuNulo(m.o3);
    case "Temperatura":
      return numeroOuNulo(m.temperatura);
    case "Umidade":
      return numeroOuNulo(m.umidade);
    default:
      return null;
  }
};

// Botões de escolha de métrica (compartilhados pelos dois gráficos)
function SeletorMetrica({
  metrica,
  onChange,
}: {
  metrica: Metrica;
  onChange: (m: Metrica) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {METRICAS_GRAFICO.map((m) => {
        const isSelected = metrica === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold border-[2.5px] border-[#1a1a1a] transition-all duration-150 ${
              isSelected
                ? "text-white shadow-[3px_3px_0_#1a1a1a] -translate-y-0.5"
                : "bg-white text-[#1a1a1a] hover:-translate-y-0.5 hover:shadow-[2px_2px_0_#1a1a1a]"
            }`}
            style={isSelected ? { backgroundColor: METRICA_CONFIG[m].color } : undefined}
          >
            {METRICA_CONFIG[m].label}
          </button>
        );
      })}
    </div>
  );
}

function GraficoLinha({
  dados,
  metrica,
  rotuloX,
}: {
  dados: { x: string; valor: number | null }[];
  metrica: Metrica;
  rotuloX: string;
}) {
  const cfg = METRICA_CONFIG[metrica];
  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={dados} margin={{ top: 10, right: 20, left: 15, bottom: 25 }}>
        <CartesianGrid strokeDasharray="4 6" stroke="#d6d3d1" vertical={false} />
        <XAxis
          dataKey="x"
          dy={5}
          padding={{ left: 10, right: 10 }}
          minTickGap={16}
          tick={{
            fill: "#1a1a1a",
            fontSize: 11,
            fontFamily: "Space Mono, monospace",
            fontWeight: 700,
          }}
          tickLine={false}
          axisLine={{ stroke: "#1a1a1a", strokeWidth: 2.5 }}
          label={{
            value: rotuloX,
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
          formatter={(v: number) => [`${formatarNumero(v, cfg.decimals)} ${cfg.unit}`, cfg.rawLabel]}
        />
        {metrica === "IQA" && (
          <ReferenceLine
            y={40}
            stroke="#00a859"
            strokeWidth={2}
            strokeDasharray="6 4"
            label={{
              value: "Limite Boa (40)",
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
  );
}

function ResumoMinMax({ valores, metrica, rotuloUltimo }: { valores: (number | null)[]; metrica: Metrica; rotuloUltimo: string }) {
  const cfg = METRICA_CONFIG[metrica];
  const validos = valores.filter((v): v is number => v !== null && !isNaN(v));
  const min = validos.length ? Math.min(...validos) : null;
  const max = validos.length ? Math.max(...validos) : null;
  const ultimo = validos.length ? validos[validos.length - 1] : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
      {[
        { rotulo: "Mín: ", valor: min, bg: "#D6F0FF" },
        { rotulo: "Máx: ", valor: max, bg: "#FFE0EE" },
        { rotulo: rotuloUltimo, valor: ultimo, bg: "#FFF6B3" },
      ].map((s) => (
        <div
          key={s.rotulo}
          className="px-3 py-1.5 rounded-xl border-[2.5px] border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a]"
          style={{ backgroundColor: s.bg }}
        >
          <span className="text-[#1a1a1a] font-bold">{s.rotulo}</span>
          <span className="font-bold" style={{ color: cfg.color }}>
            {formatarNumero(s.valor, cfg.decimals)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Agrega as médias horárias em médias diárias (para a série longa)
type PontoDiario = { dia: string; rotulo: string; horas: number } & Record<Metrica, number | null>;

const agregarDiario = (dados: DadoApi[]): PontoDiario[] => {
  const grupos = new Map<string, DadoApi[]>();
  for (const d of dados) {
    if (!d || !d.timestamp) continue;
    // O horário da média horária marca o FIM da hora; recua 1 min para cair no dia certo
    const ref = new Date(new Date(d.timestamp).getTime() - 60000);
    const chave = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
    const lista = grupos.get(chave) || [];
    lista.push(d);
    grupos.set(chave, lista);
  }
  const media = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, itens]) => {
      const ponto = {
        dia,
        rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(2, 4)}`,
        horas: itens.length,
      } as PontoDiario;
      METRICAS.forEach((m) => {
        ponto[m] = media(itens.map((i) => valorDaApi(i, m)));
      });
      return ponto;
    });
};

const PERIODOS = [
  { id: "30", rotulo: "30 dias", dias: 30 },
  { id: "90", rotulo: "90 dias", dias: 90 },
  { id: "365", rotulo: "1 ano", dias: 365 },
  { id: "tudo", rotulo: "Tudo", dias: Infinity },
];

function SerieHistorica() {
  const [serie, setSerie] = useState<PontoDiario[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("IQA");
  const [periodo, setPeriodo] = useState("90");

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await axios.get<RespostaApiDjango>(`${API_BASE}/api/painel/`, {
        params: { tipo: "horario", limite: 24 * 400 },
      });
      setSerie(agregarDiario(r.data?.dados || []));
    } catch (e) {
      console.error("Erro ao buscar a série histórica:", e);
      setErro("Não foi possível carregar a série histórica agora.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 90;
  const recorte = useMemo(() => {
    if (!serie) return [];
    return Number.isFinite(dias) ? serie.slice(-dias) : serie;
  }, [serie, dias]);

  const dados = recorte.map((p) => ({ x: p.rotulo, valor: p[metrica] }));

  return (
    <div>
      <h3 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#1a1a1a] mb-2 flex items-center gap-3">
        <span className="inline-block w-4 h-4 rounded-full bg-[#8BE04E] border-[3px] border-[#1a1a1a]" aria-hidden />
        Série Histórica — Médias Diárias
      </h3>
      <p className="text-xs text-stone-700 font-semibold mb-4 max-w-3xl leading-relaxed">
        Cada ponto é a média das médias horárias do dia. Para o IQAr, é a média do índice horário (não o IQAr oficial do dia).
      </p>

      <div className={`${CARD} p-6`}>
        {carregando && !serie ? (
          <div className="h-60 flex items-center justify-center text-xs font-mono font-bold text-stone-700">
            Carregando a série histórica...
          </div>
        ) : erro ? (
          <div className="h-60 flex flex-col items-center justify-center gap-3 text-center">
            <span className="text-red-700 font-mono text-xs font-bold">{erro}</span>
            <button
              onClick={carregar}
              className={`px-4 py-2 bg-[#33CCFF] text-[#1a1a1a] rounded-xl text-xs font-mono font-bold ${BOTAO}`}
            >
              Tentar novamente
            </button>
          </div>
        ) : serie && serie.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <SeletorMetrica metrica={metrica} onChange={setMetrica} />
              <div className="flex flex-wrap gap-2">
                {PERIODOS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriodo(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border-[2.5px] border-[#1a1a1a] ${
                      periodo === p.id ? "bg-[#1a1a1a] text-white" : "bg-white text-[#1a1a1a]"
                    }`}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span className="text-[11px] font-mono font-bold text-stone-700">
                Dados disponíveis: {serie[0].rotulo} a {serie[serie.length - 1].rotulo} ({serie.length} dias)
              </span>
              <ResumoMinMax valores={dados.map((d) => d.valor)} metrica={metrica} rotuloUltimo="Último dia: " />
            </div>
            <GraficoLinha dados={dados} metrica={metrica} rotuloX="Dia" />
          </>
        ) : (
          <div className="h-60 flex items-center justify-center text-xs font-mono font-bold text-stone-700">
            Ainda não há dados suficientes para a série histórica.
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoRelatorio({ r }: { r: (typeof RELATORIOS)[number] }) {
  return (
    <div className="p-4 rounded-xl bg-white border-[2.5px] border-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a] flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-sm font-extrabold text-[#1a1a1a] leading-tight">{r.titulo}</p>
        {!r.url && (
          <span className="shrink-0 text-[10px] font-mono font-bold uppercase bg-[#FFF6B3] border-2 border-[#1a1a1a] rounded-full px-2 py-0.5">
            Em breve
          </span>
        )}
      </div>
      <p className="text-[11px] font-mono font-bold text-stone-700">
        Período: {r.periodo}
        {r.data && ` · Publicado em ${r.data}`}
      </p>
      <p className="text-[11px] text-stone-700 leading-relaxed">{r.descricao}</p>
      {r.url && (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`self-start mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#8BE04E] text-[#1a1a1a] text-xs font-bold ${BOTAO}`}
        >
          Baixar PDF <IconeLinkExterno />
        </a>
      )}
    </div>
  );
}

function CartaoEstacao({ irPara }: { irPara: (t: Tab) => void }) {
  const linhas = [
    { rotulo: "Equipamento", valor: ESTACAO.equipamento },
    { rotulo: "Em operação desde", valor: ESTACAO.instalacao },
    { rotulo: "Leituras", valor: ESTACAO.frequencia },
    { rotulo: "Local", valor: ESTACAO.localInstalacao },
    { rotulo: "Altura", valor: ESTACAO.altura },
  ].filter((l) => l.valor);

  return (
    <div className={`${CARD} ${CARD_HOVER} overflow-hidden`}>
      <div className="flex items-center gap-2 px-6 py-3 bg-[#33CCFF] border-b-[3px] border-[#1a1a1a]">
        <span className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center">
          <svg className="w-4 h-4 text-[#33CCFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
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
        <p className="text-stone-800 text-sm mt-1 font-semibold">Gávea, Rio de Janeiro — RJ</p>
        <p className="inline-block text-[#1a1a1a] text-xs mt-3 font-mono font-bold bg-[#D6F0FF] border-2 border-[#1a1a1a] rounded-lg px-2 py-1">
          {ESTACAO.laboratorio}
        </p>

        <dl className="mt-4 space-y-1.5 text-[11px]">
          {linhas.map((l) => (
            <div key={l.rotulo} className="flex justify-between gap-3 border-b border-dashed border-stone-300 pb-1">
              <dt className="font-mono font-bold text-stone-600 uppercase">{l.rotulo}</dt>
              <dd className="text-right text-stone-900 font-semibold">{l.valor}</dd>
            </div>
          ))}
        </dl>

        <button
          onClick={() => irPara("sobre")}
          className="mt-3 text-[11px] font-mono font-bold underline decoration-2 underline-offset-2 text-[#1a1a1a] hover:text-[#2699E6]"
        >
          Limitações e detalhes técnicos →
        </button>

        <a
          href={LINKS.instagram}
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
  );
}

export function GraficosTab({
  historico,
  iqa,
  m,
  ultimaLeituraData,
  irPara,
}: {
  historico: ItemHistorico[];
  iqa: IQAResumo;
  m: Medicao;
  ultimaLeituraData?: string;
  irPara: (t: Tab) => void;
}) {
  const [metrica, setMetrica] = useState<Metrica>("IQA");

  const dados = historico.map((h) => ({ x: h.hora, valor: h[metrica] }));
  const corIqa = obterCorIQA(iqa.cor, iqa.qualidade);

  return (
    <div className="space-y-8 text-stone-900">
      <AvisoBaixoCusto />

      {ultimaLeituraData && (
        <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#1a1a1a] bg-[#8BE04E] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[3px_3px_0_#1a1a1a]">
          <span className="w-2 h-2 rounded-full bg-[#1a1a1a] animate-pulse" />
          <span>Última leitura: {ultimaLeituraData}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CartaoEstacao irPara={irPara} />

        {/* IQAr oficial: a mesma fonte do topo e da aba Mapa */}
        <div className={`${CARD} p-6 flex flex-col`}>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-600">IQAr agora</p>
          <div className="flex items-end gap-3 mt-2">
            <span className="font-display text-6xl font-extrabold leading-none text-[#1a1a1a]">
              {formatarNumero(iqa.iqa ?? 0, 0)}
            </span>
            <span
              className="mb-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border-[2.5px] border-[#1a1a1a] shadow-[2px_2px_0_#1a1a1a] text-white"
              style={{ backgroundColor: corIqa }}
            >
              {iqa.qualidade || "N/A"}
            </span>
          </div>
          <p className="text-xs font-mono font-bold text-stone-700 mt-3">
            Poluente determinante: {normalizarPoluente(iqa.poluenteDeterminante || "")}
          </p>
          <p className="text-[11px] text-stone-700 mt-3 leading-relaxed">
            Calculado com as médias móveis da CONAMA 506/2024: MP<sub>2,5</sub>, MP<sub>10</sub> e SO<sub>2</sub> em 24 h; O<sub>3</sub> e CO em 8 h; NO<sub>2</sub> em 1 h. É o mesmo valor da faixa “Ao vivo” e da aba Mapa.
          </p>
        </div>

        <div className={`${CARD} p-6 flex flex-col gap-3`}>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-600">Relatório anual</p>
          {RELATORIOS.slice(0, 1).map((r) => (
            <CartaoRelatorio key={r.titulo} r={r} />
          ))}
          <button
            onClick={() => irPara("informacoes")}
            className="self-start text-[11px] font-mono font-bold underline decoration-2 underline-offset-2 hover:text-[#2699E6]"
          >
            Todos os relatórios →
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#1a1a1a] mb-4 flex items-center gap-3">
          <span className="inline-block w-4 h-4 rounded-full bg-[#FF5FA2] border-[3px] border-[#1a1a1a]" aria-hidden />
          Últimos Registros
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {METRICAS_CARDS.map((mt, idx) => {
            const itemCfg = METRICA_CONFIG[mt];
            const naoMonitorado = mt === "CO" && !CO_MONITORADO;
            const valorCard = valorDaMedicao(m, mt);

            return (
              <div
                key={mt}
                className={`relative overflow-hidden bg-white border-[3px] border-[#1a1a1a] rounded-2xl p-3 flex flex-col justify-between shadow-[4px_4px_0_#1a1a1a] transition-all duration-200 hover:rotate-0 hover:-translate-y-1 hover:shadow-[6px_6px_0_#1a1a1a] ${
                  idx % 2 === 0 ? "-rotate-1" : "rotate-1"
                } ${naoMonitorado ? "opacity-70" : ""}`}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-2"
                  style={{ backgroundColor: naoMonitorado ? "#d6d3d1" : itemCfg.color }}
                />
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[10px] font-mono text-[#1a1a1a] font-bold uppercase truncate">
                    {itemCfg.cardLabel}
                  </span>
                  <span className="text-base" aria-hidden>
                    {itemCfg.icone}
                  </span>
                </div>
                {naoMonitorado ? (
                  <div className="mt-2 text-[11px] font-mono font-bold text-stone-600 leading-tight">
                    não monitorado
                  </div>
                ) : (
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-display text-2xl font-extrabold" style={{ color: itemCfg.color }}>
                      {formatarNumero(valorCard, itemCfg.decimals)}
                    </span>
                    {itemCfg.unit && (
                      <span className="text-[10px] text-stone-600 font-mono font-bold">{itemCfg.unit}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-600 font-mono font-bold mt-3">
          Valores da última média horária.
        </p>
      </div>

      <div>
        <h3 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#1a1a1a] mb-4 flex items-center gap-3">
          <span className="inline-block w-4 h-4 rounded-full bg-[#2699E6] border-[3px] border-[#1a1a1a]" aria-hidden />
          Histórico — Últimas 24 Horas
        </h3>

        <div className={`${CARD} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <SeletorMetrica metrica={metrica} onChange={setMetrica} />
            <ResumoMinMax valores={dados.map((d) => d.valor)} metrica={metrica} rotuloUltimo="Última hora: " />
          </div>

          {dados.length > 0 ? (
            <GraficoLinha dados={dados} metrica={metrica} rotuloX="Hora" />
          ) : (
            <div className="h-60 flex items-center justify-center text-xs font-mono font-bold text-stone-700">
              Sem médias horárias nas últimas 24 horas.
            </div>
          )}

          {metrica === "IQA" && (
            <p className="mt-4 text-[11px] text-stone-700 leading-relaxed bg-[#D6F0FF] border-2 border-[#1a1a1a] rounded-xl p-3">
              <strong>Por que este número pode diferir do IQAr agora ({formatarNumero(iqa.iqa ?? 0, 0)})?</strong> O gráfico mostra o índice horário, calculado só com a média de cada hora. O IQAr oficial usa as médias móveis da CONAMA (24 h, 8 h e 1 h, conforme o poluente), que variam mais devagar.
            </p>
          )}
        </div>
      </div>

      <SerieHistorica />
    </div>
  );
}

// ─── ABA 3: INFORMAÇÕES ──────────────────────────────────────────────────────

function CartaoLink({
  titulo,
  subtitulo,
  texto,
  href,
  rotulo,
  cor,
}: {
  titulo: string;
  subtitulo: string;
  texto: string;
  href: string;
  rotulo: string;
  cor: string;
}) {
  return (
    <div className={`p-5 rounded-2xl bg-white border-[3px] border-[#1a1a1a] shadow-[4px_4px_0_#1a1a1a] flex flex-col ${CARD_HOVER}`}>
      <span
        className="self-start text-[10px] font-mono font-bold uppercase tracking-widest border-2 border-[#1a1a1a] rounded-full px-2 py-0.5"
        style={{ backgroundColor: cor }}
      >
        {subtitulo}
      </span>
      <p className="font-display text-base text-[#1a1a1a] font-extrabold leading-tight mt-3">{titulo}</p>
      <p className="text-stone-700 text-xs mt-2 leading-relaxed flex-1">{texto}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[#1a1a1a] text-xs font-bold justify-center group ${BOTAO}`}
        style={{ backgroundColor: cor }}
      >
        {rotulo}
        <IconeLinkExterno className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
      </a>
    </div>
  );
}

function InformacoesTab() {
  const dicasCores = [TEMA.rosa, TEMA.azul, TEMA.verde, TEMA.laranja];

  return (
    <div className="space-y-8">
      {/* Relatórios */}
      <div>
        <SectionLabel>Relatórios da Estação</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RELATORIOS.map((r) => (
            <CartaoRelatorio key={r.titulo} r={r} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 space-y-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
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

      {/* Redes oficiais */}
      <div>
        <SectionLabel>Redes Oficiais de Monitoramento</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CartaoLink
            subtitulo="Município"
            titulo="MonitorAr-Rio — Prefeitura do Rio"
            texto="Rede municipal com estações de referência e estações compactas em vários bairros, com boletim diário do IQAr."
            href={LINKS.monitorArRio}
            rotulo="Acessar MonitorAr-Rio"
            cor={TEMA.destaque}
          />
          <CartaoLink
            subtitulo="Estado"
            titulo="INEA — Qualidade do Ar (RJ)"
            texto="Boletim diário do IQAr para o estado do Rio de Janeiro e o portal SIGQAr, com mapa e dados horários."
            href={LINKS.ineaIQAr}
            rotulo="Acessar INEA"
            cor={TEMA.laranja}
          />
          <CartaoLink
            subtitulo="País"
            titulo="MonitorAr — Ministério do Meio Ambiente"
            texto="Plataforma nacional que reúne as estações oficiais do país e divulga o IQAr pela CONAMA 506/2024."
            href={LINKS.monitorArMMA}
            rotulo="Acessar MonitorAr MMA"
            cor={TEMA.verde}
          />
        </div>
      </div>

      {/* Sociedade civil e Amazônia */}
      <div>
        <SectionLabel>Iniciativas da Sociedade Civil e da Amazônia</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CartaoLink
            subtitulo="Organização"
            titulo="Instituto Ar"
            texto="Organização sem fins lucrativos dedicada à proteção da saúde frente à poluição do ar e à mudança do clima."
            href={LINKS.institutoAr}
            rotulo="Conhecer o Instituto Ar"
            cor={TEMA.rosa}
          />
          <CartaoLink
            subtitulo="Amazônia"
            titulo="Coalizão Respira Amazônia"
            texto="Instituto Ar, IPAM, UFPR e Woodwell Climate Research Center ampliam o monitoramento na Amazônia com sensores de baixo custo."
            href={LINKS.respiraAmazonia}
            rotulo="Ler o policy brief"
            cor={TEMA.roxo}
          />
        </div>
      </div>

      {/* Leituras */}
      <div>
        <SectionLabel>Para Ler Mais</SectionLabel>
        <ul className={`${CARD} p-6 space-y-4`}>
          {LEITURAS.map((l) => (
            <li key={l.link} className="text-xs text-stone-800 leading-relaxed flex gap-3">
              <span className="shrink-0 mt-1 w-2.5 h-2.5 rounded-full bg-[#33CCFF] border-2 border-[#1a1a1a]" aria-hidden />
              <span>
                {l.referencia}{" "}
                <a
                  href={l.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-bold underline decoration-2 underline-offset-2 hover:text-[#2699E6]"
                >
                  {l.rotuloLink}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── ABA 4: QUIZ DO AR ───────────────────────────────────────────────────────

interface PerguntaQuiz {
  pergunta: string;
  opcoes: string[];
  correta: number;
  explicacao: string;
}

const PERGUNTAS_QUIZ: PerguntaQuiz[] = [
  {
    pergunta: "O que é o Índice de Qualidade do Ar (IQAr)?",
    opcoes: [
      "A concentração de oxigênio no ar, em porcentagem",
      "Um número sem unidade que converte as concentrações de vários poluentes numa escala única",
      "A quantidade de poluentes emitida por carros num dia",
      "A temperatura do ar corrigida pela umidade",
    ],
    correta: 1,
    explicacao:
      "O IQAr traduz concentrações medidas em µg/m³ ou ppm numa escala comum, que vai de Boa a Péssima, para facilitar a comunicação com a população.",
  },
  {
    pergunta: "Uma estação mede vários poluentes. Qual IQAr ela divulga?",
    opcoes: [
      "A média dos índices de todos os poluentes",
      "O índice do poluente em melhor situação",
      "O índice do poluente em pior situação",
      "O índice do material particulado, sempre",
    ],
    correta: 2,
    explicacao:
      "Calcula-se um índice para cada poluente e divulga-se o maior deles. Esse poluente é chamado de poluente determinante.",
  },
  {
    pergunta: "Um IQAr de 65 corresponde a qual faixa?",
    opcoes: ["Boa", "Moderada", "Ruim", "Muito Ruim"],
    correta: 1,
    explicacao: "A faixa Moderada vai de 41 a 80. Nela, pessoas de grupos sensíveis podem apresentar tosse seca e cansaço.",
  },
  {
    pergunta: "Quem faz parte dos chamados grupos sensíveis?",
    opcoes: [
      "Apenas atletas profissionais",
      "Crianças, idosos e pessoas com doenças respiratórias e cardíacas",
      "Somente quem trabalha em indústrias",
      "Pessoas que moram longe de avenidas",
    ],
    correta: 1,
    explicacao:
      "São os grupos que sentem efeitos primeiro e com mais intensidade. Por isso as mensagens de saúde das faixas Moderada em diante citam esses grupos.",
  },
  {
    pergunta: "O que significa o “2,5” em MP₂,₅?",
    opcoes: [
      "Partículas com diâmetro de até 2,5 micrômetros",
      "2,5 microgramas de poeira por litro de ar",
      "Partículas que ficam 2,5 horas no ar",
      "A média de 2,5 dias de medição",
    ],
    correta: 0,
    explicacao:
      "O MP₂,₅ reúne partículas com até 2,5 µm, cerca de 30 vezes mais finas que um fio de cabelo. Elas chegam aos alvéolos pulmonares e à corrente sanguínea.",
  },
  {
    pergunta: "Como se forma o ozônio (O₃) perto do solo?",
    opcoes: [
      "É emitido diretamente pelos escapamentos",
      "Vem da camada de ozônio, que desce à noite",
      "Por reações entre óxidos de nitrogênio e compostos orgânicos voláteis sob luz solar",
      "Pela evaporação da água do mar",
    ],
    correta: 2,
    explicacao:
      "O ozônio troposférico é um poluente secundário: não é emitido, mas formado na atmosfera. Por isso tende a subir em dias quentes e ensolarados.",
  },
  {
    pergunta: "Qual é a principal fonte de dióxido de nitrogênio (NO₂) nas cidades?",
    opcoes: [
      "Queima de combustíveis, sobretudo no tráfego de veículos",
      "Árvores e parques urbanos",
      "Ar-condicionado doméstico",
      "Chuvas de verão",
    ],
    correta: 0,
    explicacao:
      "O NO₂ vem principalmente da combustão em motores. Ele irrita as vias respiratórias e participa da formação do ozônio.",
  },
  {
    pergunta: "Qual norma define hoje os padrões de qualidade do ar no Brasil usados no IQAr?",
    opcoes: [
      "Resolução CONAMA nº 03/1990",
      "Resolução CONAMA nº 506/2024",
      "Código de Trânsito Brasileiro",
      "Lei de Diretrizes Orçamentárias",
    ],
    correta: 1,
    explicacao:
      "A CONAMA 506/2024 atualizou os padrões nacionais e prevê uma aproximação gradual dos valores recomendados pela Organização Mundial da Saúde.",
  },
  {
    pergunta: "No cálculo do IQAr, qual tempo de média se usa para o MP₂,₅?",
    opcoes: ["1 hora", "8 horas", "24 horas", "1 ano"],
    correta: 2,
    explicacao:
      "Pela CONAMA 506/2024, MP₂,₅, MP₁₀ e SO₂ usam média de 24 h; O₃ e CO, de 8 h; e NO₂, de 1 h.",
  },
  {
    pergunta: "Qual a principal diferença entre uma estação de referência e um sensor de baixo custo?",
    opcoes: [
      "Não há diferença: os dois são certificados",
      "A de referência usa métodos certificados; o sensor de baixo custo é mais barato e permite mais pontos, mas tem incertezas maiores e precisa ser comparado e calibrado",
      "O sensor de baixo custo só funciona à noite",
      "A estação de referência não mede material particulado",
    ],
    correta: 1,
    explicacao:
      "Sensores de baixo custo ampliam a cobertura, mas seus resultados podem ser revistos após análise técnica. Por isso a estação PUC-Rio é comparada com estações de referência.",
  },
  {
    pergunta: "Em dias muito úmidos, o que pode acontecer com sensores ópticos de partículas de baixo custo?",
    opcoes: [
      "Nada: a umidade não interfere",
      "Eles param de medir o ozônio",
      "Podem superestimar o material particulado, porque as partículas absorvem água e “crescem”",
      "Passam a medir apenas temperatura",
    ],
    correta: 2,
    explicacao:
      "A umidade alta faz as partículas incharem e espalharem mais luz, o que tende a elevar a leitura. É uma das limitações conhecidas desses sensores.",
  },
  {
    pergunta: "Um IQAr de 230 corresponde a qual faixa?",
    opcoes: ["Ruim", "Muito Ruim", "Péssima", "Moderada"],
    correta: 2,
    explicacao:
      "A faixa Péssima vai de 201 a 400. Toda a população pode apresentar sérios riscos de doenças respiratórias e cardiovasculares.",
  },
  {
    pergunta: "Onde consultar dados oficiais da qualidade do ar na cidade do Rio de Janeiro?",
    opcoes: ["No MonitorAr-Rio, da Prefeitura", "Na previsão do tempo da TV", "Em aplicativos de trânsito", "No site da Receita Federal"],
    correta: 0,
    explicacao:
      "O MonitorAr-Rio publica boletins diários com o IQAr das estações municipais. No estado, há o INEA; no país, o MonitorAr do MMA.",
  },
];

function QuizPerguntas() {
  const [indice, setIndice] = useState(0);
  const [escolha, setEscolha] = useState<number | null>(null);
  const [acertos, setAcertos] = useState(0);
  const [fim, setFim] = useState(false);

  const p = PERGUNTAS_QUIZ[indice];
  const respondida = escolha !== null;

  const responder = (i: number) => {
    if (respondida) return;
    setEscolha(i);
    if (i === p.correta) setAcertos((a) => a + 1);
  };

  const proxima = () => {
    if (indice + 1 >= PERGUNTAS_QUIZ.length) {
      setFim(true);
      return;
    }
    setIndice((x) => x + 1);
    setEscolha(null);
  };

  const reiniciar = () => {
    setIndice(0);
    setEscolha(null);
    setAcertos(0);
    setFim(false);
  };

  const progressoPct = ((indice + (respondida ? 1 : 0)) / PERGUNTAS_QUIZ.length) * 100;

  if (fim) {
    const pct = Math.round((acertos / PERGUNTAS_QUIZ.length) * 100);
    return (
      <div className="p-8 flex flex-col items-center text-center gap-4">
        <div className="iqa-wiggle inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#33CCFF] border-[3px] border-[#1a1a1a] text-4xl shadow-[4px_4px_0_#1a1a1a]">
          {pct >= 70 ? "🏆" : "📚"}
        </div>
        <h4 className="font-display text-2xl font-extrabold text-[#1a1a1a]">
          Você acertou {acertos} de {PERGUNTAS_QUIZ.length}
        </h4>
        <p className="text-sm text-stone-800 max-w-md">
          {pct >= 70
            ? "Ótimo resultado! Que tal compartilhar o que aprendeu?"
            : "Dá para ir mais longe: a aba Informações e a aba Sobre o projeto explicam tudo o que caiu no quiz."}
        </p>
        <button onClick={reiniciar} className={`text-sm font-mono font-bold bg-[#FF5FA2] text-[#1a1a1a] px-6 py-3 rounded-xl ${BOTAO}`}>
          Refazer o quiz
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] font-mono font-bold text-[#1a1a1a] uppercase tracking-widest bg-[#FF5FA2] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[2px_2px_0_#1a1a1a]">
          Pergunta {indice + 1} de {PERGUNTAS_QUIZ.length}
        </span>
        <span className="text-xs font-mono font-bold bg-[#8BE04E] border-[2.5px] border-[#1a1a1a] rounded-full px-3 py-1 shadow-[2px_2px_0_#1a1a1a]">
          Acertos: {acertos}
        </span>
      </div>

      <div className="h-4 w-full rounded-full bg-stone-100 border-[2.5px] border-[#1a1a1a] overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out bg-[repeating-linear-gradient(45deg,#8BE04E_0_10px,#6CC73A_10px_20px)]"
          style={{ width: `${progressoPct}%` }}
        />
      </div>

      <h4 className="font-display text-xl sm:text-2xl font-extrabold text-[#1a1a1a] leading-tight">{p.pergunta}</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {p.opcoes.map((op, i) => {
          const certa = respondida && i === p.correta;
          const errada = respondida && i === escolha && i !== p.correta;
          return (
            <button
              key={i}
              onClick={() => responder(i)}
              disabled={respondida}
              className={`w-full p-4 rounded-xl border-[2.5px] border-[#1a1a1a] text-left text-sm font-semibold transition-all duration-200 flex items-start gap-3 ${
                certa
                  ? "bg-[#C9F27B] shadow-[2px_2px_0_#1a1a1a]"
                  : errada
                  ? "bg-[#FFC2C2] text-rose-900 iqa-shake shadow-[2px_2px_0_#1a1a1a]"
                  : respondida
                  ? "bg-white opacity-60 shadow-[2px_2px_0_#1a1a1a]"
                  : "bg-white shadow-[3px_3px_0_#1a1a1a] hover:-translate-y-0.5 hover:bg-[#FFFBEA] hover:shadow-[4px_4px_0_#1a1a1a]"
              }`}
            >
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#1a1a1a] text-white text-xs font-mono font-bold flex items-center justify-center">
                {certa ? "✓" : errada ? "✗" : String.fromCharCode(65 + i)}
              </span>
              <span>{op}</span>
            </button>
          );
        })}
      </div>

      {respondida && (
        <div className="iqa-pop p-4 rounded-xl bg-[#FFF8E1] border-[2.5px] border-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a] flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="text-sm text-stone-900 leading-relaxed flex-1">
            <strong>{escolha === p.correta ? "Isso mesmo! " : "Não foi dessa vez. "}</strong>
            {p.explicacao}
          </p>
          <button
            onClick={proxima}
            className={`shrink-0 text-xs font-mono font-bold bg-[#33CCFF] text-[#1a1a1a] px-4 py-2.5 rounded-xl ${BOTAO}`}
          >
            {indice + 1 >= PERGUNTAS_QUIZ.length ? "Ver resultado" : "Próxima →"}
          </button>
        </div>
      )}
    </div>
  );
}

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
      "Devido ao seu tamanho reduzido (≤ 2,5 µm), o MP₂,₅ consegue ultrapassar as barreiras do sistema respiratório.",
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
    dicaExplicativa: "O MP₁₀ inclui poeira, pólen e fuligem que irritam garganta e olhos.",
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
    dicaExplicativa: "Produzido pela combustão incompleta em veículos e processos industriais.",
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

// Atividade "Associe os poluentes" (o antigo Desafio)
export function JogoTab() {
  const [cartasPoluentes, setCartasPoluentes] = useState<ItemDefinicao[]>([]);
  const [cartasDefinicoes, setCartasDefinicoes] = useState<ItemDefinicao[]>([]);

  const [poluenteSelecionado, setPoluenteSelecionado] = useState<string | null>(null);
  const [definicaoSelecionada, setDefinicaoSelecionada] = useState<string | null>(null);

  const [acertos, setAcertos] = useState<string[]>([]);
  const [tentativas, setTentativas] = useState<number>(0);
  const [erroAtivo, setErroAtivo] = useState<boolean>(false);
  const [ultimoAcerto, setUltimoAcerto] = useState<ItemDefinicao | null>(null);

  const resetSelecao = () => {
    setPoluenteSelecionado(null);
    setDefinicaoSelecionada(null);
    setErroAtivo(false);
  };

  const reiniciarJogo = () => {
    setCartasPoluentes(embaralharArray(DESAFIOS_JOGO));
    setCartasDefinicoes(embaralharArray(DESAFIOS_JOGO));
    setAcertos([]);
    setTentativas(0);
    setUltimoAcerto(null);
    resetSelecao();
  };

  useEffect(() => {
    reiniciarJogo();
  }, []);

  const checarPar = (pId: string, dId: string) => {
    setTentativas((prev) => prev + 1);

    if (pId === dId) {
      setAcertos((prev) => [...prev, pId]);
      setUltimoAcerto(DESAFIOS_JOGO.find((d) => d.id === pId) || null);
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
    <div className="text-stone-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 pt-6">
        <p className="text-sm font-semibold text-stone-800">
          Associe a fórmula química do poluente à sua definição correspondente.
        </p>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
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

      {ultimoAcerto && acertos.length < DESAFIOS_JOGO.length && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-[#FFF8E1] border-[2.5px] border-[#1a1a1a] text-xs leading-relaxed">
          <strong>Você sabia? </strong>
          {ultimoAcerto.dicaExplicativa}
        </div>
      )}

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
              Parabéns! Atividade concluída!
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

function QuizTab() {
  const [modo, setModo] = useState<"perguntas" | "associar">("perguntas");

  return (
    <div className={`w-full ${CARD} overflow-hidden text-stone-900`}>
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-[#9B5CFF] border-b-[3px] border-[#1a1a1a] overflow-hidden">
        <span aria-hidden className="absolute -right-6 -top-8 w-28 h-28 rounded-full bg-[#FF5FA2] border-[3px] border-[#1a1a1a] opacity-60" />
        <span aria-hidden className="absolute right-24 -bottom-6 w-14 h-14 rounded-full bg-[#33CCFF] border-[3px] border-[#1a1a1a] opacity-60" />
        <div className="relative">
          <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white tracking-tight [text-shadow:2px_2px_0_#1a1a1a]">
            🧩 Quiz do Ar: teste seus conhecimentos
          </h3>
          <p className="text-xs text-white/95 font-sans font-semibold mt-1.5">
            {PERGUNTAS_QUIZ.length} perguntas com explicação e um jogo de associação sobre os poluentes medidos na estação PUC-Rio.
          </p>
        </div>

        <div className="relative flex gap-2 shrink-0">
          {[
            { id: "perguntas" as const, rotulo: "❓ Perguntas" },
            { id: "associar" as const, rotulo: "🔗 Associe os poluentes" },
          ].map((o) => (
            <button
              key={o.id}
              onClick={() => setModo(o.id)}
              className={`text-xs font-mono font-bold px-3 py-1.5 rounded-full ${BOTAO} ${
                modo === o.id ? "bg-[#FFF6B3] text-[#1a1a1a]" : "bg-white/80 text-[#1a1a1a]"
              }`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>

      {modo === "perguntas" ? <QuizPerguntas /> : <JogoTab />}
    </div>
  );
}

// ─── ABA 5: SOBRE O PROJETO ──────────────────────────────────────────────────

function BlocoSobre({
  titulo,
  cor,
  children,
}: {
  titulo: string;
  cor: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-6 py-3 border-b-[3px] border-[#1a1a1a]" style={{ backgroundColor: cor }}>
        <h2 className="font-display text-lg font-extrabold text-[#1a1a1a]">{titulo}</h2>
      </div>
      <div className="p-6 text-sm text-stone-800 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function SobreTab({ irPara }: { irPara: (t: Tab) => void }) {
  const fichaTecnica = [
    { rotulo: "Equipamento", valor: ESTACAO.equipamento },
    { rotulo: "Instalação", valor: `${ESTACAO.instalacao}` },
    { rotulo: "Local", valor: [ESTACAO.endereco, ESTACAO.localInstalacao].filter(Boolean).join(" — ") },
    { rotulo: "Altura", valor: ESTACAO.altura },
    { rotulo: "Coordenadas", valor: `${ESTACAO.latitude}, ${ESTACAO.longitude}` },
    { rotulo: "Frequência de leitura", valor: ESTACAO.frequencia },
    { rotulo: "Médias horárias", valor: "Média das leituras de cada hora; horas com menos de 55 leituras são sinalizadas como incompletas" },
    {
      rotulo: "Poluentes",
      valor: CO_MONITORADO ? "MP₂,₅, MP₁₀, O₃, NO₂, SO₂ e CO" : "MP₂,₅, MP₁₀, O₃, NO₂ e SO₂ (CO não monitorado)",
    },
    { rotulo: "Meteorologia", valor: "Temperatura, umidade relativa, pressão, velocidade e direção do vento" },
    { rotulo: "Responsável", valor: `${ESTACAO.laboratorio} — PUC-Rio` },
  ].filter((l) => l.valor);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BlocoSobre titulo="O que é o IQAr?" cor={TEMA.destaque}>
        <p>
          O Índice de Qualidade do Ar (IQAr) é um número sem unidade que converte as concentrações de vários poluentes numa escala única, de Boa a Péssima. Cada poluente recebe um índice próprio, e o valor divulgado é o do poluente em pior situação, chamado de <strong>poluente determinante</strong>.
        </p>
        <p>
          As faixas e as concentrações de referência seguem a Resolução CONAMA nº 506/2024 e a orientação técnica do Ministério do Meio Ambiente e Mudança do Clima (2025).
        </p>
      </BlocoSobre>

      <BlocoSobre titulo="Por que monitorar a qualidade do ar?" cor={TEMA.verde}>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>A poluição do ar está ligada a doenças respiratórias e cardiovasculares, como asma, bronquite, infarto e AVC.</li>
          <li>Crianças, idosos e pessoas com doenças respiratórias ou cardíacas são os mais afetados.</li>
          <li>Dados contínuos permitem alertar a população em episódios críticos e apoiar políticas públicas.</li>
          <li>O Brasil ainda tem poucas estações: muitas cidades e bairros não sabem que ar respiram.</li>
        </ul>
      </BlocoSobre>

      <div className="lg:col-span-2">
        <BlocoSobre titulo="O que cada faixa significa para a saúde" cor={TEMA.laranja}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-separate border-spacing-y-2">
              <thead>
                <tr className="font-mono uppercase tracking-wider text-[10px] text-stone-600">
                  <th className="pr-3">Qualidade</th>
                  <th className="pr-3">IQAr</th>
                  <th className="pr-3">Quem deve ter atenção</th>
                  <th>Efeitos à saúde</th>
                </tr>
              </thead>
              <tbody>
                {FAIXAS_IQAR.map((f) => (
                  <tr key={f.rotulo} style={{ backgroundColor: f.bgCor }}>
                    <td className="p-2.5 rounded-l-xl border-y-2 border-l-2 border-[#1a1a1a] font-display font-extrabold whitespace-nowrap" style={{ color: f.cor }}>
                      {f.emoji} {f.rotulo}
                    </td>
                    <td className="p-2.5 border-y-2 border-[#1a1a1a] font-mono font-bold whitespace-nowrap">{f.faixa}</td>
                    <td className="p-2.5 border-y-2 border-[#1a1a1a] font-semibold">{f.quem}</td>
                    <td className="p-2.5 rounded-r-xl border-y-2 border-r-2 border-[#1a1a1a]">{f.saude}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-600">
            Fonte: quadro de efeitos à saúde da{" "}
            <a href={LINKS.orientacaoIQAr} target="_blank" rel="noopener noreferrer" className="underline font-bold">
              orientação técnica do IQAr (MMA, 2025)
            </a>
            .
          </p>
        </BlocoSobre>
      </div>

      <BlocoSobre titulo="A estação PUC-Rio" cor={TEMA.rosa}>
        <dl className="space-y-2 text-xs">
          {fichaTecnica.map((l) => (
            <div key={l.rotulo} className="grid grid-cols-[130px_1fr] gap-3 border-b border-dashed border-stone-300 pb-1.5">
              <dt className="font-mono font-bold uppercase text-stone-600 text-[10px] pt-0.5">{l.rotulo}</dt>
              <dd className="text-stone-900 font-semibold">{l.valor}</dd>
            </div>
          ))}
        </dl>
        <button
          onClick={() => irPara("dashboard")}
          className="text-[11px] font-mono font-bold underline decoration-2 underline-offset-2 hover:text-[#2699E6]"
        >
          Ver a estação no mapa →
        </button>
      </BlocoSobre>

      <BlocoSobre titulo="Sobre os dados: como o índice é calculado" cor={TEMA.azul}>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>O monitor registra uma leitura por minuto de cada poluente e das variáveis meteorológicas.</li>
          <li>As leituras de cada hora viram uma média horária.</li>
          <li>
            O servidor calcula as médias móveis no período de cada poluente, conforme a CONAMA 506/2024: MP<sub>2,5</sub>, MP<sub>10</sub> e SO<sub>2</sub> em 24 h; O<sub>3</sub> e CO em 8 h; NO<sub>2</sub> em 1 h.
          </li>
          <li>Cada média é convertida em índice por interpolação nas faixas da CONAMA. O maior índice é o IQAr divulgado, limitado a 400.</li>
        </ol>
        <p className="text-xs bg-[#D6F0FF] border-2 border-[#1a1a1a] rounded-xl p-3">
          <strong>Índice horário × IQAr oficial.</strong> Nos gráficos, o índice de cada hora usa só a média daquela hora. Por isso ele pode diferir do IQAr oficial do momento, que usa as médias móveis.
        </p>
        {!CO_MONITORADO && (
          <p className="text-xs">
            O monóxido de carbono (CO) não é monitorado de forma confiável por esta estação e não entra nos gráficos.
          </p>
        )}
      </BlocoSobre>

      <BlocoSobre titulo="Limitações da estação" cor="#FFF6B3">
        <p>
          O MS800A é um monitor compacto de <strong>baixo custo</strong>. Ele permite medir em mais lugares, mas os dados ainda estão em avaliação e <strong>não são validados por órgão ambiental</strong>. Limitações conhecidas desse tipo de equipamento:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Sensores ópticos de partículas podem superestimar o MP em dias muito úmidos.</li>
          <li>Sensores de gases sofrem deriva ao longo do tempo e interferência de temperatura, umidade e outros gases.</li>
          <li>Sem comparação periódica com uma estação de referência, a exatidão absoluta é incerta; as tendências e variações são mais confiáveis que os valores isolados.</li>
          <li>Falhas de energia ou de comunicação podem gerar horas incompletas ou sem dados.</li>
        </ul>
        <p className="text-xs">
          Como faz o MonitorAr-Rio com as suas estações compactas, os resultados desta estação podem ser revistos após análise técnica.
        </p>
      </BlocoSobre>

      <BlocoSobre titulo="Como a estação dialoga com outras redes" cor={TEMA.verde}>
        <p>
          A estação não substitui as redes oficiais: ela as complementa. O MonitorAr-Rio separa as estações de <strong>referência</strong>, com analisadores certificados (como a de Copacabana), das estações <strong>compactas de baixo custo</strong> (como a da Lagoa), e avisa que os dados destas podem ser revisados.
        </p>
        <p>
          A estação compacta da Lagoa fica a poucos quilômetros da PUC-Rio. Comparar o MS800A com ela e com uma estação de referência é um próximo passo da pesquisa, para estimar a exatidão do equipamento.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={LINKS.monitorArRio} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs font-bold bg-[#33CCFF] px-3 py-2 rounded-xl ${BOTAO}`}>
            MonitorAr-Rio <IconeLinkExterno />
          </a>
          <a href={LINKS.ineaIQAr} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs font-bold bg-[#FF8A3D] px-3 py-2 rounded-xl ${BOTAO}`}>
            INEA <IconeLinkExterno />
          </a>
          <a href={LINKS.monitorArMMA} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs font-bold bg-[#8BE04E] px-3 py-2 rounded-xl ${BOTAO}`}>
            MonitorAr MMA <IconeLinkExterno />
          </a>
        </div>
      </BlocoSobre>

      <div className="lg:col-span-2">
        <BlocoSobre titulo="Contribuições e legado" cor={TEMA.roxo}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icone: "🎓",
                titulo: "Educação ambiental",
                texto:
                  "Dados abertos e em tempo real, explicados em linguagem simples, com quiz e materiais que podem ser usados em escolas e na universidade.",
              },
              {
                icone: "🔬",
                titulo: "Avaliação de sensores de baixo custo",
                texto:
                  "A série de um ano e a comparação com estações de referência ajudam a entender quando esses equipamentos são confiáveis, um tema central para redes como o MonitorAr-Rio e a Coalizão Respira Amazônia.",
              },
              {
                icone: "🧩",
                titulo: "Método replicável",
                texto:
                  "Coleta automática, cálculo do IQAr pela CONAMA 506/2024 e publicação na web formam um caminho que outras instituições podem reproduzir para ampliar o monitoramento.",
              },
            ].map((c) => (
              <div key={c.titulo} className="p-4 rounded-xl bg-white border-[2.5px] border-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a]">
                <p className="text-2xl" aria-hidden>
                  {c.icone}
                </p>
                <p className="font-display font-extrabold text-[#1a1a1a] mt-1">{c.titulo}</p>
                <p className="text-xs text-stone-700 mt-1.5 leading-relaxed">{c.texto}</p>
              </div>
            ))}
          </div>
          <p className="text-xs">
            Projeto do {ESTACAO.laboratorio} da PUC-Rio, no âmbito do Mestrado Profissional em Ciência da Sustentabilidade.
          </p>
        </BlocoSobre>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

const ABAS: { id: Tab; label: string; icone: string; cor: string }[] = [
  { id: "dashboard", label: "Mapa", icone: "🗺️", cor: TEMA.verde },
  { id: "graficos", label: "Painel e Gráficos", icone: "📈", cor: TEMA.azul },
  { id: "informacoes", label: "Informações", icone: "💡", cor: TEMA.laranja },
  { id: "jogo", label: "Quiz do Ar", icone: "🧩", cor: TEMA.rosa },
  { id: "sobre", label: "Sobre o Projeto", icone: "📘", cor: TEMA.roxo },
];

const ABAS_COM_DADOS: Tab[] = ["dashboard", "graficos"];

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dadosApi, setDadosApi] = useState<RespostaFront | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const irPara = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    document.title = TITULO_PAGINA;
  }, []);

  const buscarDados = async () => {
    setCarregando(true);
    try {
      const resposta = await axios.get<RespostaApiDjango>(`${API_BASE}/`);
      const raw = resposta.data;

      const ultima = raw.dados && raw.dados.length > 0 ? raw.dados[0] : null;

      if (!ultima) {
        throw new Error("Nenhum dado retornado da API.");
      }

      const dadosOrdenados = [...raw.dados].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const limite24h = new Date().getTime() - 24 * 60 * 60 * 1000;

      const historicoMapeado: ItemHistorico[] = dadosOrdenados
        .filter((d) => d && d.timestamp && new Date(d.timestamp).getTime() >= limite24h)
        .map((d) => ({
          hora: extrairHora(d.timestamp),
          IQA: valorDaApi(d, "IQA"),
          "PM2.5": valorDaApi(d, "PM2.5"),
          PM10: valorDaApi(d, "PM10"),
          SO2: valorDaApi(d, "SO2"),
          NO2: valorDaApi(d, "NO2"),
          CO: valorDaApi(d, "CO"),
          O3: valorDaApi(d, "O3"),
          Temperatura: valorDaApi(d, "Temperatura"),
          Umidade: valorDaApi(d, "Umidade"),
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

  const precisaDados = ABAS_COM_DADOS.includes(tab);

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
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
                  <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
                  <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
                </svg>
              </div>
              <div>
                <h1 className="font-display text-2xl font-extrabold leading-none text-[#1a1a1a] tracking-tight">
                  IQARio
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
        {carregando && !dadosApi && precisaDados ? (
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
        ) : erro && precisaDados ? (
          <div className="h-96 flex flex-col items-center justify-center text-center gap-4">
            <div className="iqa-wiggle p-4 rounded-full bg-[#FFC2C2] border-[3px] border-[#1a1a1a] text-red-700 shadow-[4px_4px_0_#1a1a1a]">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="text-red-700 font-mono text-sm max-w-md font-bold">{erro}</span>
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
              <DashboardTab iqa={dadosApi.iqaResumo} m={dadosApi.ultimaMedicao} irPara={irPara} />
            )}
            {tab === "graficos" && dadosApi && (
              <GraficosTab
                historico={dadosApi.historico}
                iqa={dadosApi.iqaResumo}
                m={dadosApi.ultimaMedicao}
                ultimaLeituraData={dadosApi.ultimaMedicao?.timestamp ? formatarDataHora(dadosApi.ultimaMedicao.timestamp) : undefined}
                irPara={irPara}
              />
            )}
            {tab === "informacoes" && <InformacoesTab />}
            {tab === "jogo" && <QuizTab />}
            {tab === "sobre" && <SobreTab irPara={irPara} />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-auto">
        <svg aria-hidden className="block w-full h-5 text-[#1a1a1a]" viewBox="0 0 1200 20" preserveAspectRatio="none">
          <path d="M0 20 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 T 250 10 T 300 10 T 350 10 T 400 10 T 450 10 T 500 10 T 550 10 T 600 10 T 650 10 T 700 10 T 750 10 T 800 10 T 850 10 T 900 10 T 950 10 T 1000 10 T 1050 10 T 1100 10 T 1150 10 T 1200 10 V 20 Z" fill="currentColor" />
        </svg>
        <div className="bg-[#1a1a1a] py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-3 text-xs font-mono font-bold">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[#33CCFF]">© Laboratório de Química Atmosférica — PUC-Rio</p>
              <p className="text-white">Mestrado Profissional em Ciência da Sustentabilidade</p>
            </div>
            <p className="text-stone-400 text-[10px] text-center sm:text-left font-sans font-semibold">
              Dados de sensor de baixo custo em avaliação, sem validação por órgão ambiental. Para fins oficiais, consulte o MonitorAr-Rio.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}