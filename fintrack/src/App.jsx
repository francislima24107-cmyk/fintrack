import { useState, useMemo, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const CATS = ["Moradia","Alimentação","Transporte","Saúde","Educação","Lazer","Assinatura","Concurso","Outro"];
const COLORS = ["#00e5ff","#ff6b6b","#ffd166","#06d6a0","#a78bfa","#f77f00","#4cc9f0","#e63946","#b5e48c","#94a3b8"];

function autoCategory(desc) {
  const d = desc.toLowerCase();
  if (/aluguel|imobi|awd neg/.test(d)) return "Moradia";
  if (/mercado|supermercado|visao alimento|frios|hortifruti|acai|lanchonete|pastelaria|esfiharia|padock|doce sabor|delivery|jatai/.test(d)) return "Alimentação";
  if (/posto|combustivel|uber|99|onibus|masut/.test(d)) return "Transporte";
  if (/drogao|farmacia|saude|medic/.test(d)) return "Saúde";
  if (/tec concursos|estrategia|caveira|waid|edzprf|concurso/.test(d)) return "Concurso";
  if (/apple|netflix|spotify|amazon|allrede|internet|assinatura/.test(d)) return "Assinatura";
  if (/escola|curso|livro|top informatica/.test(d)) return "Educação";
  if (/lazer|beer|predador/.test(d)) return "Lazer";
  return "Outro";
}

function fmt(v) { return "R$ " + Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2}); }
function makeKey(date, desc, valor, pessoa) { return `${date}|${desc.toLowerCase().trim()}|${Number(valor).toFixed(2)}|${pessoa}`; }
function tsLabel() {
  const d = new Date();
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

const SUPA_URL = "https://bkysuaqabuacfierdzzu.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJreXN1YXFhYnVhY2ZpZXJkenp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTc3MDUsImV4cCI6MjA5MDI3MzcwNX0.no2HY6GF-oM5PcJ1qM1Pa0pc-c_UPyIpKdSHT-BX7t0";
const HEADERS = { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY };

async function cloudLoad() {
  try {
    const res = await fetch(SUPA_URL + "/rest/v1/fintrack?id=eq.dados&select=data", { headers: HEADERS });
    if (!res.ok) {
      console.error("cloudLoad HTTP error", res.status, await res.text());
      return null;
    }
    const rows = await res.json();
    if (rows && rows.length > 0 && rows[0].data) return rows[0].data;
    return null;
  } catch(e) {
    console.error("cloudLoad fetch error", e);
    return null;
  }
}

async function cloudSave(data) {
  try {
    const res = await fetch(SUPA_URL + "/rest/v1/fintrack", {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "dados", data, updated_at: new Date().toISOString() })
    });
    if (!res.ok) {
      console.error("cloudSave HTTP error", res.status, await res.text());
    }
  } catch(e) {
    console.error("cloudSave fetch error", e);
  }
}

function parseNubankCSV(text, pessoa) {
  const lines = text.trim().split("\n").filter(Boolean);
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 3) continue;
    const date = parts[0].trim();
    const title = parts.slice(1, parts.length - 1).join(",").trim();
    const amount = parseFloat(parts[parts.length - 1].trim());
    if (isNaN(amount) || amount <= 0) continue;
    const [y, m] = date.split("-").map(Number);
    results.push({ id: makeKey(date, title, amount, pessoa), desc: title, valor: amount, date, mes: m-1, ano: y, cat: autoCategory(title), origem: "cartao", pago: true, fixo: false, pessoa });
  }
  return results;
}

// ════════════════════════════════
//  MODAIS — componentes isolados
// ════════════════════════════════

function ModalConfirm({ label, onCancel, onConfirm }) {
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{width:"min(360px,96vw)"}}>
        <div style={{fontSize:28,textAlign:"center",marginBottom:12}}>⚠️</div>
        <div style={{fontWeight:700,fontSize:15,textAlign:"center",marginBottom:8}}>Desfazer esta ação?</div>
        <div style={{fontSize:13,color:"#a0b4cc",textAlign:"center",marginBottom:6}}>"{label}"</div>
        <div style={{fontSize:11,color:"#5a7090",textAlign:"center",marginBottom:24}}>O app vai voltar ao estado anterior.</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:10,padding:"12px",fontSize:13,fontWeight:600}}>Cancelar</button>
          <button onClick={onConfirm} style={{flex:1,background:"#ff6b6b",color:"#fff",border:"none",borderRadius:10,padding:"12px",fontSize:13,fontWeight:700}}>Desfazer</button>
        </div>
      </div>
    </div>
  );
}

function ModalSalario({ pessoa, valorAtual, onCancel, onSave }) {
  const [val, setVal] = useState(String(valorAtual||""));
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{width:"min(320px,96vw)"}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{pessoa==="eu"?"👤 Seu salário":"👩 Salário da esposa"}</div>
        <label className="lbl">Valor mensal (R$)</label>
        <input type="number" value={val} onChange={e=>setVal(e.target.value)} placeholder="0.00" autoFocus
          onKeyDown={e=>e.key==="Enter"&&onSave(parseFloat(String(val).replace(",","."))||0)}
          style={{fontSize:22,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:pessoa==="eu"?"#00e5ff":"#f472b6",borderColor:pessoa==="eu"?"#00e5ff44":"#f472b644"}}/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:13}}>Cancelar</button>
          <button className="btn-p" onClick={()=>onSave(parseFloat(String(val).replace(",","."))||0)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ModalEntrada({ mesAtual, anoAtual, itemEdit, onCancel, onSave }) {
  const [desc, setDesc] = useState(itemEdit?.desc||"");
  const [valor, setValor] = useState(itemEdit?.valor||"");
  const [pessoa, setPessoa] = useState(itemEdit?.pessoa||"eu");
  const [mes, setMes] = useState(itemEdit?.mes??mesAtual);
  const [ano, setAno] = useState(itemEdit?.ano??anoAtual);
  function handleSave() {
    const v = parseFloat(String(valor).replace(",","."));
    if (!desc.trim() || !v || v <= 0) return;
    onSave({ desc: desc.trim(), valor: v, pessoa, mes, ano });
  }
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{itemEdit?"Editar":"Nova"} Entrada</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><label className="lbl">Descrição</label><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ex: Pix de João"/></div>
          <div><label className="lbl">Valor (R$)</label><input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="0.00"/></div>
          <div><label className="lbl">Pessoa</label>
            <div style={{display:"flex",gap:8}}>
              {[["eu","👤 Você","#00e5ff"],["esposa","👩 Esposa","#f472b6"]].map(([k,l,c])=>(
                <button key={k} onClick={()=>setPessoa(k)} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${pessoa===k?c:"#1e2d45"}`,background:pessoa===k?c+"22":"#080c14",color:pessoa===k?c:"#5a7090",fontSize:12,fontWeight:700}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="lbl">Mês</label>
              <select value={mes} onChange={e=>setMes(Number(e.target.value))}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div><label className="lbl">Ano</label>
              <select value={ano} onChange={e=>setAno(Number(e.target.value))}>
                {[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:13}}>Cancelar</button>
            <button className="btn-p" onClick={handleSave}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalSaida({ mesAtual, anoAtual, itemEdit, onCancel, onSave }) {
  const [desc, setDesc] = useState(itemEdit?.desc||"");
  const [valor, setValor] = useState(itemEdit?.valor||"");
  const [pessoa, setPessoa] = useState(itemEdit?.pessoa||"eu");
  const [cat, setCat] = useState(itemEdit?.cat||"Outro");
  const [mes, setMes] = useState(itemEdit?.mes??mesAtual);
  const [ano, setAno] = useState(itemEdit?.ano??anoAtual);
  const [fixo, setFixo] = useState(itemEdit?.fixo||false);
  const [pago, setPago] = useState(itemEdit?.pago||false);
  function handleSave() {
    const v = parseFloat(String(valor).replace(",","."));
    if (!desc.trim() || !v || v <= 0) return;
    onSave({ desc: desc.trim(), valor: v, pessoa, cat, mes, ano, fixo, pago });
  }
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{itemEdit?"Editar":"Nova"} Saída</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><label className="lbl">Descrição</label><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ex: Supermercado"/></div>
          <div><label className="lbl">Valor (R$)</label><input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="0.00"/></div>
          <div><label className="lbl">Pessoa</label>
            <div style={{display:"flex",gap:8}}>
              {[["eu","👤 Você","#00e5ff"],["esposa","👩 Esposa","#f472b6"],["casal","👫 Casal","#ffd166"]].map(([k,l,c])=>(
                <button key={k} onClick={()=>setPessoa(k)} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${pessoa===k?c:"#1e2d45"}`,background:pessoa===k?c+"22":"#080c14",color:pessoa===k?c:"#5a7090",fontSize:11,fontWeight:700}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="lbl">Mês</label>
              <select value={mes} onChange={e=>setMes(Number(e.target.value))}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div><label className="lbl">Ano</label>
              <select value={ano} onChange={e=>setAno(Number(e.target.value))}>
                {[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div><label className="lbl">Categoria</label>
            <select value={cat} onChange={e=>setCat(e.target.value)}>
              {CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:20}}>
            <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={fixo} onChange={e=>setFixo(e.target.checked)}/> Fixo</label>
            <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={pago} onChange={e=>setPago(e.target.checked)}/> Pago</label>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:13}}>Cancelar</button>
            <button className="btn-p" onClick={handleSave}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalPix({ mesAtual, anoAtual, itemEdit, onCancel, onSave }) {
  const [desc, setDesc] = useState(itemEdit?.desc||"");
  const [valor, setValor] = useState(itemEdit?.valor||"");
  const [pessoa, setPessoa] = useState(itemEdit?.pessoa||"eu");
  const [mes, setMes] = useState(itemEdit?.mes??mesAtual);
  const [ano, setAno] = useState(itemEdit?.ano??anoAtual);
  function handleSave() {
    const v = parseFloat(String(valor).replace(",","."));
    if (!desc.trim() || !v || v <= 0) return;
    onSave({ desc: desc.trim(), valor: v, pessoa, mes, ano });
  }
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{itemEdit?"Editar":"Novo"} Pix</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><label className="lbl">Descrição (para quem / motivo)</label><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ex: Aluguel, João..."/></div>
          <div><label className="lbl">Valor (R$)</label><input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="0.00"/></div>
          <div><label className="lbl">Pessoa</label>
            <div style={{display:"flex",gap:8}}>
              {[["eu","👤 Você","#00e5ff"],["esposa","👩 Esposa","#f472b6"],["casal","👫 Casal","#ffd166"]].map(([k,l,c])=>(
                <button key={k} onClick={()=>setPessoa(k)} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${pessoa===k?c:"#1e2d45"}`,background:pessoa===k?c+"22":"#080c14",color:pessoa===k?c:"#5a7090",fontSize:11,fontWeight:700}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="lbl">Mês</label>
              <select value={mes} onChange={e=>setMes(Number(e.target.value))}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div><label className="lbl">Ano</label>
              <select value={ano} onChange={e=>setAno(Number(e.target.value))}>
                {[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:13}}>Cancelar</button>
            <button className="btn-p" onClick={handleSave}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalCSVDono({ nomes, onCancel, onConfirm }) {
  return (
    <div className="overlay">
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>De quem é essa fatura?</div>
        <div style={{fontSize:12,color:"#5a7090",marginBottom:20}}>{nomes}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["eu","👤","Você","#00e5ff"],["esposa","👩","Esposa","#f472b6"]].map(([v,icon,label,color])=>(
            <button key={v} onClick={()=>onConfirm(v)} style={{border:`2px solid ${color}44`,background:"#080c14",borderRadius:14,padding:"20px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer"}}>
              <div style={{fontSize:32}}>{icon}</div>
              <div style={{fontWeight:700,color,fontSize:14}}>{label}</div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{marginTop:14,width:"100%",background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"10px",fontSize:13}}>Cancelar</button>
      </div>
    </div>
  );
}

// ════════════════════════════════
//  APP PRINCIPAL
// ════════════════════════════════

const EMPTY = { salarios:{eu:0,esposa:0}, entradas:[], saidasManuais:[], saidasCSV:[], pixList:[], actionLog:[] };

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState("dashboard");
  const [filterPessoa, setFilterPessoa] = useState("todos");

  const [salarios, setSalarios] = useState(EMPTY.salarios);
  const [entradas, setEntradas] = useState([]);
  const [saidasManuais, setSaidasManuais] = useState([]);
  const [saidasCSV, setSaidasCSV] = useState([]);
  const [pixList, setPixList] = useState([]);
  const [actionLog, setActionLog] = useState([]);

  // Modais — qual está aberto e qual item está sendo editado
  const [modal, setModal] = useState(null); // null | 'entrada' | 'saida' | 'pix' | 'salario' | 'csv' | 'confirmaUndo'
  const [editItem, setEditItem] = useState(null);
  const [editSalPessoa, setEditSalPessoa] = useState(null);
  const [confirmUndoId, setConfirmUndoId] = useState(null);
  const [pendingCSV, setPendingCSV] = useState(null);
  const [importMsg, setImportMsg] = useState([]);
  const [importModal, setImportModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  // ── Carregar do cloud storage ──
  useEffect(() => {
    cloudLoad().then(data => {
      if (data) {
        setSalarios(data.salarios||EMPTY.salarios);
        setEntradas(data.entradas||[]);
        setSaidasManuais(data.saidasManuais||[]);
        setSaidasCSV(data.saidasCSV||[]);
        setPixList(data.pixList||[]);
        setActionLog(data.actionLog||[]);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  // ── Autosave: salva na nuvem sempre que dados mudam ──
  useEffect(() => {
    if (!loaded) return;
    const data = { salarios, entradas, saidasManuais, saidasCSV, pixList, actionLog };
    setSaving(true);
    setSaveError(false);
    cloudSave(data)
      .then(() => setSaving(false))
      .catch(() => { setSaving(false); setSaveError(true); });
  }, [salarios, entradas, saidasManuais, saidasCSV, pixList, actionLog, loaded]);

  // ── Persist (save explícito) ──
  function persist(overrides={}) {
    const data = {
      salarios: overrides.salarios??salarios,
      entradas: overrides.entradas??entradas,
      saidasManuais: overrides.saidasManuais??saidasManuais,
      saidasCSV: overrides.saidasCSV??saidasCSV,
      pixList: overrides.pixList??pixList,
      actionLog: overrides.actionLog??actionLog,
    };
    cloudSave(data);
  }

  // ── Snapshot para log ──
  function snap() {
    return {
      salarios: JSON.parse(JSON.stringify(salarios)),
      entradas: JSON.parse(JSON.stringify(entradas)),
      saidasManuais: JSON.parse(JSON.stringify(saidasManuais)),
      saidasCSV: JSON.parse(JSON.stringify(saidasCSV)),
      pixList: JSON.parse(JSON.stringify(pixList)),
    };
  }
  function addLog(type, label, snapshot) {
    const icons = {entrada_add:"➕",entrada_edit:"✏️",entrada_del:"🗑️",saida_add:"➕",saida_edit:"✏️",saida_del:"🗑️",saida_pago:"✅",csv_import:"📥",salario_edit:"💰"};
    const colors = {entrada_add:"#06d6a0",entrada_edit:"#00e5ff",entrada_del:"#ff6b6b",saida_add:"#ff6b6b",saida_edit:"#ffd166",saida_del:"#ff6b6b",saida_pago:"#06d6a0",csv_import:"#a78bfa",salario_edit:"#ffd166"};
    const entry = { id: Date.now()+Math.random(), ts: tsLabel(), type, label, icon: icons[type]||"•", color: colors[type]||"#e2e8f0", snapshot };
    const newLog = [entry, ...actionLog].slice(0,100);
    setActionLog(newLog);
    return newLog;
  }

  // ── Desfazer ──
  function undoAction(id) {
    const entry = actionLog.find(l=>l.id===id);
    if (!entry) return;
    const s = entry.snapshot;
    setSalarios(s.salarios); setEntradas(s.entradas); setSaidasManuais(s.saidasManuais); setSaidasCSV(s.saidasCSV); setPixList(s.pixList||[]);
    const newLog = actionLog.filter(l=>l.id!==id);
    setActionLog(newLog);
    persist({...s, actionLog:newLog});
    setModal(null); setConfirmUndoId(null);
  }

  // ── Cálculos ──
  const salEu = Number(salarios.eu)||0;
  const salEsposa = Number(salarios.esposa)||0;
  const salTotal = salEu + salEsposa;
  const entradasMes = entradas.filter(e=>e.mes===month&&e.ano===year);
  const saidasMes = [...saidasManuais,...saidasCSV].filter(s=>s.mes===month&&s.ano===year);
  const pixMes = pixList.filter(p=>p.mes===month&&p.ano===year);
  const totalEntradasAvulsas = entradasMes.reduce((a,e)=>a+Number(e.valor),0);
  const baseTotal = salTotal + totalEntradasAvulsas;
  const totalSaidasCSV = saidasMes.reduce((a,s)=>a+Number(s.valor),0);
  const totalPix = pixMes.reduce((a,p)=>a+Number(p.valor),0);
  const totalSaidas = totalSaidasCSV + totalPix;
  const totalPago = saidasMes.filter(s=>s.pago).reduce((a,s)=>a+Number(s.valor),0);
  const saldo = baseTotal - totalSaidas;
  const disponivel = baseTotal - totalPago - totalPix;
  const pct = baseTotal>0?Math.min(100,totalSaidas/baseTotal*100):0;
  const faturasEu = saidasMes.filter(s=>s.origem==="cartao"&&s.pessoa==="eu").reduce((a,s)=>a+Number(s.valor),0);
  const faturasEsposa = saidasMes.filter(s=>s.origem==="cartao"&&s.pessoa==="esposa").reduce((a,s)=>a+Number(s.valor),0);

  const applyFilter = arr => filterPessoa==="todos"?arr:arr.filter(t=>!t.pessoa||t.pessoa===filterPessoa||t.pessoa==="casal");
  const saidasFiltradas = applyFilter(saidasMes);
  const entradasFiltradas = applyFilter(entradasMes);
  const pixFiltrados = applyFilter(pixMes);

  const catData = useMemo(()=>{
    const map={};
    saidasFiltradas.forEach(s=>{map[s.cat]=(map[s.cat]||0)+Number(s.valor);});
    return Object.entries(map).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  },[saidasFiltradas]);

  const barData = useMemo(()=>Array.from({length:6},(_,i)=>{
    const m=(month-5+i+12)%12; const y=month-5+i<0?year-1:year;
    return {name:MONTHS[m].slice(0,3),saidas:[...saidasManuais,...saidasCSV,...pixList].filter(s=>s.mes===m&&s.ano===y).reduce((a,s)=>a+Number(s.valor),0)};
  }),[month,year,saidasManuais,saidasCSV,pixList]);

  // ── Handlers ──
  function handleSalario(val) {
    const s = snap(); const newSal = {...salarios,[editSalPessoa]:val};
    setSalarios(newSal);
    const newLog = addLog("salario_edit",`Salário (${editSalPessoa==="eu"?"Você":"Esposa"}) → ${fmt(val)}`,s);
    persist({salarios:newSal,actionLog:newLog});
    setModal(null);
  }

  function handleEntrada(dados) {
    const s = snap();
    const item = {...dados, id:editItem?editItem.id:"e-"+Date.now()};
    const newEntradas = editItem?entradas.map(e=>e.id===item.id?item:e):[...entradas,item];
    setEntradas(newEntradas);
    const newLog = addLog(editItem?"entrada_edit":"entrada_add",`${editItem?"Editou":"Adicionou"} entrada "${item.desc}" · ${fmt(item.valor)}`,s);
    persist({entradas:newEntradas,actionLog:newLog});
    setModal(null); setEditItem(null);
  }

  function handleSaida(dados) {
    const s = snap();
    const item = {...dados, id:editItem?editItem.id:"s-"+Date.now(), origem:"manual"};
    const newSM = editItem?saidasManuais.map(x=>x.id===item.id?item:x):[...saidasManuais,item];
    setSaidasManuais(newSM);
    const newLog = addLog(editItem?"saida_edit":"saida_add",`${editItem?"Editou":"Adicionou"} saída "${item.desc}" · ${fmt(item.valor)}`,s);
    persist({saidasManuais:newSM,actionLog:newLog});
    setModal(null); setEditItem(null);
  }

  function handlePix(dados) {
    const s = snap();
    const item = {...dados, id:editItem?editItem.id:"p-"+Date.now(), origem:"pix"};
    const newPix = editItem?pixList.map(x=>x.id===item.id?item:x):[...pixList,item];
    setPixList(newPix);
    const newLog = addLog(editItem?"saida_edit":"saida_add",`${editItem?"Editou":"Adicionou"} pix "${item.desc}" · ${fmt(item.valor)}`,s);
    persist({pixList:newPix,actionLog:newLog});
    setModal(null); setEditItem(null);
  }

  function delEntrada(id) {
    const item=entradas.find(e=>e.id===id); const s=snap();
    const newEntradas=entradas.filter(e=>e.id!==id); setEntradas(newEntradas);
    const newLog=addLog("entrada_del",`Apagou entrada "${item?.desc}" · ${fmt(item?.valor)}`,s);
    persist({entradas:newEntradas,actionLog:newLog});
  }
  function delSaida(id,origem) {
    const item=[...saidasManuais,...saidasCSV].find(x=>x.id===id); const s=snap();
    const newSM=origem==="manual"?saidasManuais.filter(x=>x.id!==id):saidasManuais;
    const newCSV=origem==="cartao"?saidasCSV.filter(x=>x.id!==id):saidasCSV;
    setSaidasManuais(newSM); setSaidasCSV(newCSV);
    const newLog=addLog("saida_del",`Apagou saída "${item?.desc}" · ${fmt(item?.valor)}`,s);
    persist({saidasManuais:newSM,saidasCSV:newCSV,actionLog:newLog});
  }
  function delPix(id) {
    const item=pixList.find(p=>p.id===id); const s=snap();
    const newPix=pixList.filter(p=>p.id!==id); setPixList(newPix);
    const newLog=addLog("saida_del",`Apagou pix "${item?.desc}" · ${fmt(item?.valor)}`,s);
    persist({pixList:newPix,actionLog:newLog});
  }
  function togglePago(id,origem) {
    const item=[...saidasManuais,...saidasCSV].find(x=>x.id===id); const s=snap();
    const nowPago=!item?.pago;
    const newSM=saidasManuais.map(x=>x.id===id?{...x,pago:!x.pago}:x);
    const newCSV=saidasCSV.map(x=>x.id===id?{...x,pago:!x.pago}:x);
    setSaidasManuais(newSM); setSaidasCSV(newCSV);
    const newLog=addLog("saida_pago",`Marcou "${item?.desc}" como ${nowPago?"pago":"não pago"}`,s);
    persist({saidasManuais:newSM,saidasCSV:newCSV,actionLog:newLog});
  }

  // ── CSV ──
  async function handleFiles(files) {
    const csvFiles=Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".csv"));
    if(!csvFiles.length)return;
    const loaded=[];
    for(const f of csvFiles) loaded.push({file:f,text:await f.text()});
    setPendingCSV(loaded); setImportModal(false); setImportMsg([]);
  }
  function confirmCSV(pessoa) {
    const s=snap();
    const existingKeys=new Set(saidasCSV.map(t=>t.id));
    let allFresh=[],msgs=[];
    for(const {file,text} of pendingCSV){
      const newTx=parseNubankCSV(text,pessoa);
      const fresh=newTx.filter(t=>!existingKeys.has(t.id));
      fresh.forEach(t=>existingKeys.add(t.id));
      allFresh=[...allFresh,...fresh];
      msgs.push(`✅ ${file.name} (${pessoa==="eu"?"Você":"Esposa"}): ${fresh.length} importadas${newTx.length-fresh.length>0?`, ${newTx.length-fresh.length} duplicatas`:""}`);
    }
    const newCSV=[...saidasCSV,...allFresh]; setSaidasCSV(newCSV);
    const newLog=addLog("csv_import",`Importou ${allFresh.length} transações (${pessoa==="eu"?"Você":"Esposa"})`,s);
    persist({saidasCSV:newCSV,actionLog:newLog});
    setImportMsg(msgs); setPendingCSV(null); setImportModal(true);
  }

  const saldoColor=saldo>=0?"#06d6a0":"#ff6b6b";
  const PBadge=({p})=>{const cfg={eu:["#00e5ff","VOCÊ"],esposa:["#f472b6","ESPOSA"],casal:["#ffd166","CASAL"]}[p]||["#5a7090","—"];return <span style={{background:cfg[0]+"22",color:cfg[0],padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{cfg[1]}</span>;};
  const OBadge=({o})=>o==="cartao"?<span style={{background:"#a78bfa22",color:"#a78bfa",padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>CARTÃO</span>:<span style={{background:"#5a709022",color:"#94a3b8",padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>MANUAL</span>;

  if (!loaded) return (
    <div style={{minHeight:"100vh",background:"#080c14",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <div style={{width:40,height:40,background:"linear-gradient(135deg,#00e5ff,#7c3aed)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:"#fff"}}>₦</div>
      <div style={{color:"#5a7090",fontSize:13,fontFamily:"monospace"}}>Carregando...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080c14",color:"#e2e8f0",fontFamily:"'DM Sans',sans-serif",paddingBottom:60}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:4px;}
        input,select{background:#0d1626;border:1.5px solid #1e2d45;color:#e2e8f0;border-radius:8px;padding:10px 14px;width:100%;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border .2s;}
        input:focus,select:focus{border-color:#00e5ff;}
        select option{background:#0d1626;}
        button{cursor:pointer;font-family:'DM Sans',sans-serif;}
        .tab{background:none;border:none;padding:10px 14px;color:#5a7090;font-size:13px;font-weight:500;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;}
        .tab.on{color:#00e5ff;border-bottom-color:#00e5ff;}
        .card{background:#0d1626;border:1px solid #1e2d45;border-radius:14px;padding:18px;}
        .btn-p{background:linear-gradient(135deg,#00c8e0,#007a99);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;}
        .btn-s{border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;}
        .btn-d{background:#ff6b6b18;color:#ff6b6b;border:1px solid #ff6b6b33;}
        .btn-e{background:#00e5ff18;color:#00e5ff;border:1px solid #00e5ff33;}
        .overlay{position:fixed;inset:0;background:#00000099;backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;}
        .modal{background:#0d1626;border:1px solid #1e2d45;border-radius:20px;padding:28px;width:min(420px,96vw);max-height:92vh;overflow-y:auto;}
        .lbl{font-size:11px;color:#5a7090;margin-bottom:5px;display:block;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
        .mono{font-family:'JetBrains Mono',monospace;}
        .drop{border:2px dashed #1e2d45;border-radius:14px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;}
        .drop.over{border-color:#00e5ff;background:#00e5ff08;}
        .row{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:10px;background:#080c14;margin-bottom:7px;border:1px solid #1e2d45;}
        .pill{border:1px solid #1e2d45;background:none;color:#5a7090;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;}
        .pill.on{color:#080c14;border-color:transparent;}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0a0f1e",borderBottom:"1px solid #1e2d45",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:920,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 0",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:30,height:30,background:"linear-gradient(135deg,#00e5ff,#7c3aed)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#fff"}}>₦</div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:2,color:"#00e5ff"}}>FINTRACK</span>
              {saving&&<span style={{fontSize:10,color:"#ffd166",fontFamily:"monospace"}}>💾 salvando...</span>}
              {!saving&&!saveError&&loaded&&<span style={{fontSize:10,color:"#06d6a0",fontFamily:"monospace"}}>☁️ salvo</span>}
              {saveError&&<span style={{fontSize:10,color:"#ff6b6b",fontFamily:"monospace"}}>⚠️ erro ao salvar</span>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>{setImportModal(true);setImportMsg([]);}} style={{background:"#1e2d4580",border:"1px solid #2a3d5a",color:"#a0b4cc",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600}}>⬆ CSV</button>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={{width:"auto",fontSize:12,padding:"5px 8px",borderRadius:7}}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <select value={year} onChange={e=>setYear(Number(e.target.value))} style={{width:"auto",fontSize:12,padding:"5px 8px",borderRadius:7}}>
                {[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:0,marginTop:6,overflowX:"auto"}}>
            {["dashboard","entradas","saídas","pix","gráficos","log"].map(t=>(
              <button key={t} className={`tab${tab===t?" on":""}`} onClick={()=>setTab(t)}>
                {t==="log"?`📋 Log${actionLog.length>0?` (${actionLog.length})`:""}`:`${t.charAt(0).toUpperCase()+t.slice(1)}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:"20px 16px"}}>

        {/* FILTRO PESSOA */}
        {!["dashboard","log"].includes(tab)&&(
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {[["todos","Todos","#e2e8f0"],["eu","Você","#00e5ff"],["esposa","Esposa","#f472b6"]].map(([v,l,c])=>(
              <button key={v} className={`pill${filterPessoa===v?" on":""}`} style={filterPessoa===v?{background:c,color:"#080c14",borderColor:c}:{}} onClick={()=>setFilterPessoa(v)}>{l}</button>
            ))}
          </div>
        )}

        {/* DASHBOARD */}
        {tab==="dashboard"&&<>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:"#5a7090",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>💰 Salários — toque para editar</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[["eu","👤 Você","#00e5ff",salEu],["esposa","👩 Esposa","#f472b6",salEsposa],[null,"👫 Total","#ffd166",salTotal]].map(([key,label,color,val])=>(
                <div key={label} onClick={()=>{if(key){setEditSalPessoa(key);setModal("salario");}}}
                  style={{borderRadius:14,padding:"16px",border:`2px solid ${color}33`,background:"#080c14",cursor:key?"pointer":"default"}}>
                  <div style={{fontSize:10,color:"#5a7090",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                  <div className="mono" style={{fontSize:16,fontWeight:700,color}}>{fmt(val)}</div>
                  {key&&<div style={{fontSize:10,color:"#5a7090",marginTop:4}}>✎ editar</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {[{label:"Saídas",val:totalSaidas,color:"#ff6b6b"},{label:"Saldo",val:saldo,color:saldoColor},{label:"Disponível",val:disponivel,color:"#a78bfa"}].map(c=>(
              <div key={c.label} className="card" style={{borderColor:c.color+"22"}}>
                <div style={{fontSize:10,color:"#5a7090",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>{c.label}</div>
                <div className="mono" style={{fontSize:14,fontWeight:700,color:c.color}}>{fmt(c.val)}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[["👤 Você","#00e5ff",salEu,faturasEu],["👩 Esposa","#f472b6",salEsposa,faturasEsposa]].map(([label,color,sal,fat])=>(
              <div key={label} className="card" style={{borderColor:color+"22"}}>
                <div style={{fontSize:10,color:"#5a7090",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>{label}</div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:11,color:"#5a7090"}}>Salário</span>
                  <span className="mono" style={{fontSize:12,color}}>{fmt(sal)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,color:"#5a7090"}}>Fatura</span>
                  <span className="mono" style={{fontSize:12,color:"#ff6b6b"}}>-{fmt(fat)}</span>
                </div>
                <div style={{background:"#1e2d45",borderRadius:999,height:4}}>
                  <div style={{width:`${sal>0?Math.min(100,fat/sal*100):0}%`,height:"100%",background:color,borderRadius:999}}/>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
              <span style={{fontSize:12,color:"#5a7090"}}>Comprometido do total</span>
              <span className="mono" style={{fontSize:12,color:pct>80?"#ff6b6b":"#ffd166"}}>{Math.round(pct)}%</span>
            </div>
            <div style={{background:"#1e2d45",borderRadius:999,height:10}}>
              <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,#06d6a0,#ffd166${pct>80?",#ff6b6b":""})`,borderRadius:999,transition:"width .6s"}}/>
            </div>
            <div style={{marginTop:6,fontSize:11,color:"#5a7090"}}>
              {fmt(totalPago)} pagos · {fmt(totalSaidas-totalPago)} a pagar · sobra <span style={{color:saldoColor,fontWeight:700}}>{fmt(saldo)}</span>
            </div>
          </div>
        </>}

        {/* ENTRADAS */}
        {tab==="entradas"&&<>
          <div className="card" style={{marginBottom:16,borderColor:"#ffd16633"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#ffd166",marginBottom:12}}>💰 Salários Mensais</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[["eu","👤 Você","#00e5ff",salEu],["esposa","👩 Esposa","#f472b6",salEsposa],[null,"👫 Total","#ffd166",salTotal]].map(([key,label,color,val])=>(
                <div key={label} onClick={()=>{if(key){setEditSalPessoa(key);setModal("salario");}}}
                  style={{background:"#080c14",border:`2px solid ${color}33`,borderRadius:12,padding:"14px",cursor:key?"pointer":"default",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#5a7090",marginBottom:5}}>{label}</div>
                  <div className="mono" style={{fontSize:15,fontWeight:700,color}}>{fmt(val)}</div>
                  {key&&<div style={{fontSize:10,color:"#5a7090",marginTop:3}}>✎ editar</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:"#5a7090",fontWeight:700,textTransform:"uppercase"}}>Pix & Entradas Avulsas · {MONTHS[month]}</div>
              <div className="mono" style={{fontSize:16,fontWeight:700,color:"#06d6a0",marginTop:2}}>{fmt(entradasFiltradas.reduce((a,e)=>a+Number(e.valor),0))}</div>
            </div>
            <button className="btn-p" onClick={()=>{setEditItem(null);setModal("entrada");}}>+ Adicionar</button>
          </div>
          {entradasFiltradas.length===0
            ?<div className="card" style={{color:"#5a7090",textAlign:"center",padding:36,fontSize:13}}>Nenhuma entrada avulsa</div>
            :entradasFiltradas.map(e=>(
              <div key={e.id} className="row">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.desc}</div>
                  <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}><PBadge p={e.pessoa}/></div>
                </div>
                <span className="mono" style={{fontWeight:700,color:"#06d6a0",marginRight:8,flexShrink:0}}>{fmt(e.valor)}</span>
                <button className="btn-s btn-e" onClick={()=>{setEditItem(e);setModal("entrada");}}>✎</button>
                <button className="btn-s btn-d" style={{marginLeft:4}} onClick={()=>delEntrada(e.id)}>✕</button>
              </div>
            ))
          }
        </>}

        {/* SAÍDAS */}
        {tab==="saídas"&&<>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:"#5a7090",textTransform:"uppercase",letterSpacing:.5}}>Total saídas CSV · {MONTHS[month]}</div>
            <div className="mono" style={{fontSize:20,fontWeight:700,color:"#ff6b6b"}}>{fmt(saidasFiltradas.reduce((a,s)=>a+Number(s.valor),0))}</div>
          </div>
          {CATS.filter(c=>saidasFiltradas.some(s=>s.cat===c)).map(cat=>{
            const items=saidasFiltradas.filter(s=>s.cat===cat);
            const ct=items.reduce((a,s)=>a+Number(s.valor),0);
            return(
              <div key={cat} style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#5a7090",textTransform:"uppercase",letterSpacing:1}}>{cat}</span>
                  <span className="mono" style={{fontSize:11,color:"#ff6b6b"}}>{fmt(ct)}</span>
                </div>
                {items.map(s=>(
                  <div key={s.id} className="row">
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.desc}</div>
                      <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                        <PBadge p={s.pessoa}/><OBadge o={s.origem}/>
                        {s.fixo&&<span style={{background:"#a78bfa22",color:"#a78bfa",padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>FIXO</span>}
                        {s.pago&&<span style={{background:"#06d6a018",color:"#06d6a0",padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>PAGO</span>}
                        {s.date&&<span style={{fontSize:10,color:"#5a7090"}}>{s.date}</span>}
                      </div>
                    </div>
                    <span className="mono" style={{fontWeight:700,color:"#ff6b6b",marginRight:8,flexShrink:0}}>{fmt(s.valor)}</span>
                    {s.origem==="manual"&&<button className="btn-s btn-e" onClick={()=>{setEditItem(s);setModal("saida");}}>✎</button>}
                    <button className="btn-s btn-d" style={{marginLeft:4}} onClick={()=>delSaida(s.id,s.origem)}>✕</button>
                  </div>
                ))}
              </div>
            );
          })}
          {saidasFiltradas.length===0&&<div className="card" style={{color:"#5a7090",textAlign:"center",padding:40,fontSize:13}}>Nenhuma saída · importe o CSV</div>}
        </>}

        {/* PIX */}
        {tab==="pix"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:10,color:"#5a7090",textTransform:"uppercase",letterSpacing:.5}}>Total Pix · {MONTHS[month]}</div>
              <div className="mono" style={{fontSize:20,fontWeight:700,color:"#a78bfa"}}>{fmt(pixFiltrados.reduce((a,p)=>a+Number(p.valor),0))}</div>
              <div style={{fontSize:11,color:"#5a7090",marginTop:2}}>{pixFiltrados.length} transações</div>
            </div>
            <button className="btn-p" onClick={()=>{setEditItem(null);setModal("pix");}}>+ Novo Pix</button>
          </div>
          {pixFiltrados.length===0
            ?<div className="card" style={{color:"#5a7090",textAlign:"center",padding:40,fontSize:13}}>Nenhum pix registrado</div>
            :pixFiltrados.map(p=>(
              <div key={p.id} className="row">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.desc}</div>
                  <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                    <PBadge p={p.pessoa}/>
                    <span style={{background:"#a78bfa22",color:"#a78bfa",padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>PIX</span>
                    {p.date&&<span style={{fontSize:10,color:"#5a7090"}}>{p.date}</span>}
                  </div>
                </div>
                <span className="mono" style={{fontWeight:700,color:"#a78bfa",marginRight:8,flexShrink:0}}>{fmt(p.valor)}</span>
                <button className="btn-s btn-e" onClick={()=>{setEditItem(p);setModal("pix");}}>✎</button>
                <button className="btn-s btn-d" style={{marginLeft:4}} onClick={()=>delPix(p.id)}>✕</button>
              </div>
            ))
          }
        </>}

        {/* GRÁFICOS */}
        {tab==="gráficos"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div className="card">
              <div style={{fontSize:10,fontWeight:700,marginBottom:12,color:"#5a7090",textTransform:"uppercase",letterSpacing:1}}>Por Categoria</div>
              {catData.length===0?<div style={{color:"#5a7090",fontSize:12,textAlign:"center",padding:30}}>Sem dados</div>:(
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {catData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie><Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#0d1626",border:"1px solid #1e2d45",borderRadius:8,fontSize:11}}/></PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card">
              <div style={{fontSize:10,fontWeight:700,marginBottom:10,color:"#5a7090",textTransform:"uppercase",letterSpacing:1}}>Breakdown</div>
              {catData.map((c,i)=>(
                <div key={c.name} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:11,color:COLORS[i%COLORS.length]}}>{c.name}</span>
                    <span className="mono" style={{fontSize:10}}>{fmt(c.value)}</span>
                  </div>
                  <div style={{background:"#1e2d45",borderRadius:999,height:4}}>
                    <div style={{width:`${totalSaidas>0?c.value/totalSaidas*100:0}%`,height:"100%",background:COLORS[i%COLORS.length],borderRadius:999}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div style={{fontSize:10,fontWeight:700,marginBottom:12,color:"#5a7090",textTransform:"uppercase",letterSpacing:1}}>Saídas — 6 Meses</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{fill:"#5a7090",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#5a7090",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>"R$"+v}/>
                <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#0d1626",border:"1px solid #1e2d45",borderRadius:8,fontSize:11}}/>
                {salTotal>0&&<ReferenceLine y={salTotal} stroke="#ffd166" strokeDasharray="4 4" label={{value:"Salário",fill:"#ffd166",fontSize:10,position:"insideTopRight"}}/>}
                <Bar dataKey="saidas" fill="#ff6b6b" radius={[5,5,0,0]} name="Saídas"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>}

        {/* LOG */}
        {tab==="log"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:16,fontWeight:700}}>📋 Histórico de Ações</div>
              <div style={{fontSize:11,color:"#5a7090",marginTop:2}}>Lixeira = desfaz aquela ação</div>
            </div>
            {actionLog.length>0&&<button onClick={()=>{setActionLog([]);persist({actionLog:[]});}} style={{background:"#ff6b6b18",color:"#ff6b6b",border:"1px solid #ff6b6b33",borderRadius:9,padding:"7px 14px",fontSize:12,fontWeight:600}}>Limpar</button>}
          </div>
          {actionLog.length===0&&<div className="card" style={{color:"#5a7090",textAlign:"center",padding:40,fontSize:13}}>Nenhuma ação ainda</div>}
          {actionLog.map(entry=>(
            <div key={entry.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 16px",borderRadius:12,background:"#080c14",marginBottom:8,border:"1px solid #1e2d45"}}>
              <div style={{width:36,height:36,borderRadius:10,background:(entry.color||"#5a7090")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{entry.icon||"•"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:entry.color||"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.label}</div>
                <div style={{fontSize:11,color:"#5a7090",marginTop:2}}>{entry.ts}</div>
              </div>
              <button onClick={()=>{setConfirmUndoId(entry.id);setModal("confirmaUndo");}} style={{background:"none",border:"1px solid #ff6b6b33",color:"#ff6b6b",borderRadius:8,padding:"5px 8px",fontSize:14,flexShrink:0}}>🗑️</button>
            </div>
          ))}
        </>}
      </div>

      {/* ════ MODAIS ════ */}
      {modal==="salario"&&<ModalSalario
        pessoa={editSalPessoa}
        valorAtual={salarios[editSalPessoa]}
        onCancel={()=>setModal(null)}
        onSave={handleSalario}
      />}
      {modal==="entrada"&&<ModalEntrada
        mesAtual={month} anoAtual={year} itemEdit={editItem}
        onCancel={()=>{setModal(null);setEditItem(null);}}
        onSave={handleEntrada}
      />}
      {modal==="saida"&&<ModalSaida
        mesAtual={month} anoAtual={year} itemEdit={editItem}
        onCancel={()=>{setModal(null);setEditItem(null);}}
        onSave={handleSaida}
      />}
      {modal==="pix"&&<ModalPix
        mesAtual={month} anoAtual={year} itemEdit={editItem}
        onCancel={()=>{setModal(null);setEditItem(null);}}
        onSave={handlePix}
      />}
      {modal==="confirmaUndo"&&<ModalConfirm
        label={actionLog.find(l=>l.id===confirmUndoId)?.label||""}
        onCancel={()=>setModal(null)}
        onConfirm={()=>undoAction(confirmUndoId)}
      />}

      {/* MODAL CSV DONO */}
      {pendingCSV&&<ModalCSVDono
        nomes={pendingCSV.map(f=>f.file.name).join(", ")}
        onCancel={()=>setPendingCSV(null)}
        onConfirm={confirmCSV}
      />}

      {/* MODAL IMPORTAR CSV */}
      {importModal&&(
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setImportModal(false)}>
          <div className="modal">
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Importar Fatura CSV</div>
            <div style={{fontSize:12,color:"#5a7090",marginBottom:18}}>CSV da fatura Nubank · <span style={{color:"#ffd166"}}>duplicatas ignoradas automaticamente</span></div>
            <input ref={fileRef} type="file" accept=".csv" multiple onChange={e=>{handleFiles(e.target.files);e.target.value='';}} style={{display:'none'}}/>
            <div className={`drop${dragOver?" over":""}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}} onClick={()=>fileRef.current?.click()}>
              <div style={{fontSize:32,marginBottom:8}}>📂</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Arraste ou clique</div>
              <div style={{fontSize:11,color:"#5a7090"}}>Nubank_YYYY-MM-DD.csv</div>
            </div>
            {importMsg.length>0&&(
              <div style={{marginTop:14,background:"#080c14",borderRadius:10,padding:"10px 14px"}}>
                {importMsg.map((l,i)=><div key={i} style={{fontSize:11,color:"#a0b4cc",marginBottom:2,fontFamily:"monospace"}}>{l}</div>)}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:14,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#5a7090"}}>{saidasCSV.length} transações</span>
              <div style={{display:"flex",gap:8}}>
                {saidasCSV.length>0&&<button onClick={()=>{setSaidasCSV([]);persist({saidasCSV:[]});setImportMsg([]);}} style={{background:"#ff6b6b18",color:"#ff6b6b",border:"1px solid #ff6b6b33",borderRadius:8,padding:"8px 12px",fontSize:12}}>Limpar</button>}
                <button className="btn-p" onClick={()=>setImportModal(false)}>Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
