import { useState, useMemo, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const YEARS = Array.from({length:28},(_,i)=>2023+i); // 2023-2050
const DEFAULT_TAGS = ["Moradia","Alimentação","Transporte","Saúde","Educação","Lazer","Assinatura","Concurso","Outro"];
const COLORS = ["#00e5ff","#ff6b6b","#ffd166","#06d6a0","#a78bfa","#f77f00","#4cc9f0","#e63946","#b5e48c","#94a3b8","#f472b6","#34d399"];

function autoTag(desc, tagMemory) {
  const key = desc.toLowerCase().trim();
  if (tagMemory[key]) return tagMemory[key];
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
function makeKey(date,desc,valor,pessoa) { return `${date}|${desc.toLowerCase().trim()}|${Number(valor).toFixed(2)}|${pessoa}`; }
function tsLabel() { const d=new Date(); return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }

const SUPA_URL = "https://bkysuaqabuacfierdzzu.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJreXN1YXFhYnVhY2ZpZXJkenp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTc3MDUsImV4cCI6MjA5MDI3MzcwNX0.no2HY6GF-oM5PcJ1qM1Pa0pc-c_UPyIpKdSHT-BX7t0";
const H = {"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":"Bearer "+SUPA_KEY};

async function cloudLoad() {
  try { const r=await fetch(SUPA_URL+"/rest/v1/fintrack?id=eq.dados&select=data",{headers:H}); if(!r.ok)return null; const rows=await r.json(); if(rows&&rows.length>0&&rows[0].data)return rows[0].data; } catch {} return null;
}
async function cloudSave(data) {
  try { await fetch(SUPA_URL+"/rest/v1/fintrack",{method:"POST",headers:{...H,"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:"dados",data,updated_at:new Date().toISOString()})}); } catch {}
}

function parseNubankCSV(text,pessoa,tagMemory) {
  const lines=text.trim().split("\n").filter(Boolean); const results=[];
  for(let i=1;i<lines.length;i++){
    const parts=lines[i].split(","); if(parts.length<3)continue;
    const date=parts[0].trim(); const title=parts.slice(1,parts.length-1).join(",").trim();
    const amount=parseFloat(parts[parts.length-1].trim()); if(isNaN(amount)||amount<=0)continue;
    const [y,m]=date.split("-").map(Number);
    results.push({id:makeKey(date,title,amount,pessoa),desc:title,valor:amount,date,mes:m-1,ano:y,cat:autoTag(title,tagMemory),origem:"cartao",pago:true,fixo:false,pessoa,ativo:true});
  }
  return results;
}

const EMPTY={salarios:{eu:0,esposa:0},entradas:[],saidasManuais:[],saidasCSV:[],pixList:[],actionLog:[],tags:DEFAULT_TAGS,tagMemory:{}};

// ════ MODAIS ════

function ModalConfirm({label,onCancel,onConfirm}) {
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{width:"min(360px,96vw)"}}>
        <div style={{fontSize:28,textAlign:"center",marginBottom:12}}>⚠️</div>
        <div style={{fontWeight:700,fontSize:15,textAlign:"center",marginBottom:8}}>Desfazer esta ação?</div>
        <div style={{fontSize:14,color:"#a0b4cc",textAlign:"center",marginBottom:6}}>"{label}"</div>
        <div style={{fontSize:14,color:"#5a7090",textAlign:"center",marginBottom:24}}>O app vai voltar ao estado anterior.</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:10,padding:"12px",fontSize:14,fontWeight:600}}>Cancelar</button>
          <button onClick={onConfirm} style={{flex:1,background:"#ff6b6b",color:"#fff",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:700}}>Desfazer</button>
        </div>
      </div>
    </div>
  );
}

function ModalExcluirDesativar({item,onCancel,onExcluir,onDesativar}) {
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{width:"min(360px,96vw)"}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>O que deseja fazer?</div>
        <div style={{fontSize:14,color:"#a0b4cc",marginBottom:20}}>"{item?.desc}"</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={onDesativar} style={{background:"#ffd16622",color:"#ffd166",border:"2px solid #ffd16644",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,textAlign:"left",cursor:"pointer"}}>
            ⏸ Desativar — valor não conta, item fica riscado
          </button>
          <button onClick={onExcluir} style={{background:"#ff6b6b22",color:"#ff6b6b",border:"2px solid #ff6b6b44",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,textAlign:"left",cursor:"pointer"}}>
            🗑️ Excluir permanentemente
          </button>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:10,padding:"11px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModalEditarTag({item,tags,onCancel,onSave}) {
  const [cat,setCat]=useState(item?.cat||"Outro");
  const [salvarMem,setSalvarMem]=useState(true);
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Editar Tag</div>
        <div style={{fontSize:14,color:"#5a7090",marginBottom:16}}>{item?.desc}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
          {tags.map(t=>(
            <button key={t} onClick={()=>setCat(t)} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${cat===t?"#00e5ff":"#1e2d45"}`,background:cat===t?"#00e5ff22":"#080c14",color:cat===t?"#00e5ff":"#5a7090",fontSize:14,fontWeight:600,cursor:"pointer"}}>
              {t}
            </button>
          ))}
        </div>
        <label style={{display:"flex",gap:8,alignItems:"center",fontSize:14,cursor:"pointer",marginBottom:20}}>
          <input type="checkbox" checked={salvarMem} onChange={e=>setSalvarMem(e.target.checked)} style={{accentColor:"#00e5ff"}}/>
          Lembrar para "{item?.desc}"
        </label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
          <button className="btn-p" onClick={()=>onSave(cat,salvarMem)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ModalGerenciarTags({tags,onCancel,onSave}) {
  const [lista,setLista]=useState([...tags]);
  const [nova,setNova]=useState("");
  const [editIdx,setEditIdx]=useState(null);
  const [editVal,setEditVal]=useState("");
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>🏷️ Gerenciar Tags</div>
        <div style={{maxHeight:260,overflowY:"auto",marginBottom:14}}>
          {lista.map((t,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #1e2d45"}}>
              {editIdx===i
                ?<><input value={editVal} onChange={e=>setEditVal(e.target.value)} style={{flex:1,fontSize:14,padding:"6px 10px"}} onKeyDown={e=>e.key==="Enter"&&(()=>{if(editVal.trim()){const l=[...lista];l[i]=editVal.trim();setLista(l);}setEditIdx(null);})()}/>
                  <button onClick={()=>{if(editVal.trim()){const l=[...lista];l[i]=editVal.trim();setLista(l);}setEditIdx(null);}} className="btn-p" style={{padding:"6px 12px",fontSize:14}}>OK</button></>
                :<><span style={{flex:1,fontSize:14,color:"#e2e8f0"}}>{t}</span>
                  <button onClick={()=>{setEditIdx(i);setEditVal(t);}} style={{background:"#00e5ff18",color:"#00e5ff",border:"1px solid #00e5ff33",borderRadius:7,padding:"4px 10px",fontSize:14,fontWeight:600,cursor:"pointer"}}>✎</button>
                  <button onClick={()=>setLista(l=>l.filter((_,j)=>j!==i))} style={{background:"#ff6b6b18",color:"#ff6b6b",border:"1px solid #ff6b6b33",borderRadius:7,padding:"4px 10px",fontSize:14,fontWeight:600,cursor:"pointer"}}>✕</button></>
              }
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <input value={nova} onChange={e=>setNova(e.target.value)} placeholder="Nova tag..." onKeyDown={e=>e.key==="Enter"&&(()=>{if(nova.trim()&&!lista.includes(nova.trim())){setLista(l=>[...l,nova.trim()]);setNova("");}})()}/>
          <button onClick={()=>{if(nova.trim()&&!lista.includes(nova.trim())){setLista(l=>[...l,nova.trim()]);setNova("");}}} className="btn-p" style={{flexShrink:0}}>+</button>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
          <button className="btn-p" onClick={()=>onSave(lista)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ModalConfig({tema,setTema,onClose}) {
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:20}}>⚙️ Configurações</div>
        <div style={{marginBottom:20}}>
          <div className="lbl">Aparência</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["dark","🌙 Escuro"],["light","☀️ Claro"]].map(([v,label])=>(
              <button key={v} onClick={()=>setTema(v)}
                style={{padding:"16px",borderRadius:14,border:`2px solid ${tema===v?"#00e5ff":"#1e2d45"}`,background:tema===v?"#00e5ff22":"#080c14",color:tema===v?"#00e5ff":"#5a7090",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:24}}>{v==="dark"?"🌙":"☀️"}</span>
                {label.split(" ")[1]}
                {tema===v&&<span style={{fontSize:14,color:"#00e5ff"}}>✓ Ativo</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{background:"#0d1626",border:"1px solid #1e2d45",borderRadius:12,padding:14,marginBottom:20}}>
          <div style={{fontSize:14,color:"#5a7090",textAlign:"center"}}>🔧 Mais opções em breve</div>
        </div>
        <button className="btn-p" onClick={onClose} style={{width:"100%"}}>Fechar</button>
      </div>
    </div>
  );
}

function ModalSalario({pessoa,valorAtual,onCancel,onSave}) {
  const [val,setVal]=useState(String(valorAtual||""));
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{width:"min(320px,96vw)"}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{pessoa==="eu"?"👤 Seu salário":"👩 Salário da esposa"}</div>
        <label className="lbl">Valor mensal (R$)</label>
        <input type="number" value={val} onChange={e=>setVal(e.target.value)} placeholder="0.00" autoFocus onKeyDown={e=>e.key==="Enter"&&onSave(parseFloat(String(val).replace(",","."))||0)}
          style={{fontSize:22,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:pessoa==="eu"?"#00e5ff":"#f472b6",borderColor:pessoa==="eu"?"#00e5ff44":"#f472b644"}}/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
          <button className="btn-p" onClick={()=>onSave(parseFloat(String(val).replace(",","."))||0)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ModalEntrada({mesAtual,anoAtual,itemEdit,onCancel,onSave}) {
  const [desc,setDesc]=useState(itemEdit?.desc||"");
  const [valor,setValor]=useState(itemEdit?.valor||"");
  const [pessoa,setPessoa]=useState(itemEdit?.pessoa||"eu");
  const [mes,setMes]=useState(itemEdit?.mes??mesAtual);
  const [ano,setAno]=useState(itemEdit?.ano??anoAtual);
  function save(){const v=parseFloat(String(valor).replace(",","."));if(!desc.trim()||!v||v<=0)return;onSave({desc:desc.trim(),valor:v,pessoa,mes,ano});}
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
                <button key={k} onClick={()=>setPessoa(k)} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${pessoa===k?c:"#1e2d45"}`,background:pessoa===k?c+"22":"#080c14",color:pessoa===k?c:"#5a7090",fontSize:14,fontWeight:700,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="lbl">Mês</label><select value={mes} onChange={e=>setMes(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
            <div><label className="lbl">Ano</label><select value={ano} onChange={e=>setAno(Number(e.target.value))}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
            <button className="btn-p" onClick={save}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalPix({mesAtual,anoAtual,itemEdit,onCancel,onSave}) {
  const [desc,setDesc]=useState(itemEdit?.desc||"");
  const [valor,setValor]=useState(itemEdit?.valor||"");
  const [pessoa,setPessoa]=useState(itemEdit?.pessoa||"eu");
  const [mes,setMes]=useState(itemEdit?.mes??mesAtual);
  const [ano,setAno]=useState(itemEdit?.ano??anoAtual);
  function save(){const v=parseFloat(String(valor).replace(",","."));if(!desc.trim()||!v||v<=0)return;onSave({desc:desc.trim(),valor:v,pessoa,mes,ano});}
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>{itemEdit?"Editar":"Novo"} Pix</div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><label className="lbl">Descrição</label><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ex: Aluguel..."/></div>
          <div><label className="lbl">Valor (R$)</label><input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="0.00"/></div>
          <div><label className="lbl">Pessoa</label>
            <div style={{display:"flex",gap:8}}>
              {[["eu","👤 Você","#00e5ff"],["esposa","👩 Esposa","#f472b6"],["casal","👫 Casal","#ffd166"]].map(([k,l,c])=>(
                <button key={k} onClick={()=>setPessoa(k)} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${pessoa===k?c:"#1e2d45"}`,background:pessoa===k?c+"22":"#080c14",color:pessoa===k?c:"#5a7090",fontSize:14,fontWeight:700,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="lbl">Mês</label><select value={mes} onChange={e=>setMes(Number(e.target.value))}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
            <div><label className="lbl">Ano</label><select value={ano} onChange={e=>setAno(Number(e.target.value))}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={onCancel} style={{background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"9px 16px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
            <button className="btn-p" onClick={save}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalCSVDono({nomes,onCancel,onConfirm}) {
  return (
    <div className="overlay">
      <div className="modal">
        <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>De quem é essa fatura?</div>
        <div style={{fontSize:14,color:"#5a7090",marginBottom:20}}>{nomes}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["eu","👤","Você","#00e5ff"],["esposa","👩","Esposa","#f472b6"]].map(([v,icon,label,color])=>(
            <button key={v} onClick={()=>onConfirm(v)} style={{border:`2px solid ${color}44`,background:"#080c14",borderRadius:14,padding:"20px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer"}}>
              <div style={{fontSize:32}}>{icon}</div>
              <div style={{fontWeight:700,color,fontSize:14}}>{label}</div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{marginTop:14,width:"100%",background:"none",border:"1px solid #1e2d45",color:"#5a7090",borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Cancelar</button>
      </div>
    </div>
  );
}

// ════ APP ════
export default function App() {
  const [loaded,setLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [month,setMonth]=useState(new Date().getMonth());
  const [year,setYear]=useState(new Date().getFullYear());
  const [tab,setTab]=useState("dashboard");
  const [filterPessoa,setFilterPessoa]=useState("todos");
  const [filterTag,setFilterTag]=useState("todas");
  const [filtrosAbertos,setFiltrosAbertos]=useState(false);
  const [graficoModo,setGraficoModo]=useState("6meses"); // "6meses" | "periodo"
  const [periodoInicio,setPeriodoInicio]=useState("");
  const [periodoFim,setPeriodoFim]=useState("");
  const [cardOrder,setCardOrder]=useState(["saidas","saldo","disponivel","voce_esposa","comprometido"]);
  const [dragCard,setDragCard]=useState(null);
  const [dragOverCard,setDragOverCard]=useState(null);
  const [tema,setTema]=useState(()=>{try{return localStorage.getItem("ft_tema")||"dark";}catch{return"dark";}});

  const [salarios,setSalarios]=useState(EMPTY.salarios);
  const [entradas,setEntradas]=useState([]);
  const [saidasManuais,setSaidasManuais]=useState([]);
  const [saidasCSV,setSaidasCSV]=useState([]);
  const [pixList,setPixList]=useState([]);
  const [actionLog,setActionLog]=useState([]);
  const [tags,setTags]=useState(DEFAULT_TAGS);
  const [tagMemory,setTagMemory]=useState({});
  const [showBancoDados,setShowBancoDados]=useState(false);
  const [editBancoItem,setEditBancoItem]=useState(null); // {key, desc, tag}
  const [editBancoDesc,setEditBancoDesc]=useState("");

  const [modal,setModal]=useState(null);
  const [editItem,setEditItem]=useState(null);
  const [editSalPessoa,setEditSalPessoa]=useState(null);
  const [confirmUndoId,setConfirmUndoId]=useState(null);
  const [acaoItem,setAcaoItem]=useState(null);
  const [pendingCSV,setPendingCSV]=useState(null);
  const [importMsg,setImportMsg]=useState([]);
  const [importModal,setImportModal]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const fileRef=useRef();

  // tema
  useEffect(()=>{try{localStorage.setItem("ft_tema",tema);}catch{}
    document.body.style.background=tema==="dark"?"#080c14":"#f0f4f8";
  },[tema]);

  // carregar
  useEffect(()=>{
    cloudLoad().then(data=>{
      const ok=data&&((data.saidasCSV&&data.saidasCSV.length>0)||(data.pixList&&data.pixList.length>0)||(data.entradas&&data.entradas.length>0)||(data.salarios&&(data.salarios.eu>0||data.salarios.esposa>0)));
      if(ok){setSalarios(data.salarios||EMPTY.salarios);setEntradas(data.entradas||[]);setSaidasManuais(data.saidasManuais||[]);setSaidasCSV(data.saidasCSV||[]);setPixList(data.pixList||[]);setActionLog(data.actionLog||[]);setTags(data.tags||DEFAULT_TAGS);setTagMemory(data.tagMemory||{});}
      else{setSalarios(EMPTY.salarios);setEntradas([]);setSaidasManuais([]);setSaidasCSV([]);setPixList([]);setTags(DEFAULT_TAGS);setTagMemory({});}
      setLoaded(true);
    }).catch(()=>setLoaded(true));
  },[]);

  // autosave
  useEffect(()=>{
    if(!loaded)return;
    const data={salarios,entradas,saidasManuais,saidasCSV,pixList,actionLog,tags,tagMemory};
    setSaving(true); cloudSave(data).finally(()=>setSaving(false));
  },[salarios,entradas,saidasManuais,saidasCSV,pixList,actionLog,tags,tagMemory,loaded]);

  function persist(ov={}){cloudSave({salarios:ov.salarios??salarios,entradas:ov.entradas??entradas,saidasManuais:ov.saidasManuais??saidasManuais,saidasCSV:ov.saidasCSV??saidasCSV,pixList:ov.pixList??pixList,actionLog:ov.actionLog??actionLog,tags:ov.tags??tags,tagMemory:ov.tagMemory??tagMemory});}

  function snap(){return{salarios:JSON.parse(JSON.stringify(salarios)),entradas:JSON.parse(JSON.stringify(entradas)),saidasManuais:JSON.parse(JSON.stringify(saidasManuais)),saidasCSV:JSON.parse(JSON.stringify(saidasCSV)),pixList:JSON.parse(JSON.stringify(pixList)),tags:[...tags],tagMemory:{...tagMemory}};}

  function addLog(type,label,snapshot){
    const icons={entrada_add:"➕",entrada_edit:"✏️",entrada_del:"🗑️",saida_add:"➕",saida_edit:"✏️",saida_del:"🗑️",saida_pago:"✅",csv_import:"📥",salario_edit:"💰",tag_edit:"🏷️"};
    const colors={entrada_add:"#06d6a0",entrada_edit:"#00e5ff",entrada_del:"#ff6b6b",saida_add:"#ff6b6b",saida_edit:"#ffd166",saida_del:"#ff6b6b",saida_pago:"#06d6a0",csv_import:"#a78bfa",salario_edit:"#ffd166",tag_edit:"#00e5ff"};
    const entry={id:Date.now()+Math.random(),ts:tsLabel(),type,label,icon:icons[type]||"•",color:colors[type]||"#e2e8f0",snapshot};
    const newLog=[entry,...actionLog].slice(0,100); setActionLog(newLog); return newLog;
  }

  function undoAction(id){
    const entry=actionLog.find(l=>l.id===id);if(!entry)return;
    const s=entry.snapshot;
    setSalarios(s.salarios);setEntradas(s.entradas);setSaidasManuais(s.saidasManuais);setSaidasCSV(s.saidasCSV);setPixList(s.pixList||[]);
    if(s.tags)setTags(s.tags);if(s.tagMemory)setTagMemory(s.tagMemory);
    const newLog=actionLog.filter(l=>l.id!==id);setActionLog(newLog);
    persist({...s,actionLog:newLog});setModal(null);setConfirmUndoId(null);
  }

  // cálculos
  const salEu=Number(salarios.eu)||0,salEsposa=Number(salarios.esposa)||0,salTotal=salEu+salEsposa;
  const entradasMes=entradas.filter(e=>e.mes===month&&e.ano===year);
  const saidasMes=[...saidasManuais,...saidasCSV].filter(s=>s.mes===month&&s.ano===year);
  const saidasAtivas=saidasMes.filter(s=>s.ativo!==false);
  const pixMes=pixList.filter(p=>p.mes===month&&p.ano===year&&p.ativo!==false);
  const totalEntAvulsas=entradasMes.reduce((a,e)=>a+Number(e.valor),0);
  const baseTotal=salTotal+totalEntAvulsas;
  const totalSaidasAtivas=saidasAtivas.reduce((a,s)=>a+Number(s.valor),0);
  const totalPix=pixMes.reduce((a,p)=>a+Number(p.valor),0);
  const totalSaidas=totalSaidasAtivas+totalPix;
  const totalPago=saidasAtivas.filter(s=>s.pago).reduce((a,s)=>a+Number(s.valor),0);
  const saldo=baseTotal-totalSaidas;
  const disponivel=baseTotal-totalPago-totalPix;
  const pct=baseTotal>0?Math.min(100,totalSaidas/baseTotal*100):0;
  const faturasEu=saidasAtivas.filter(s=>s.origem==="cartao"&&s.pessoa==="eu").reduce((a,s)=>a+Number(s.valor),0);
  const faturasEsposa=saidasAtivas.filter(s=>s.origem==="cartao"&&s.pessoa==="esposa").reduce((a,s)=>a+Number(s.valor),0);

  const applyFilter=arr=>{let r=arr;if(filterPessoa!=="todos")r=r.filter(t=>!t.pessoa||t.pessoa===filterPessoa||t.pessoa==="casal");if(filterTag!=="todas")r=r.filter(t=>t.cat===filterTag);return r;};
  const saidasFiltradas=applyFilter(saidasMes);
  const saidasAtivasFiltradas=applyFilter(saidasAtivas);
  const entradasFiltradas=filterPessoa==="todos"?entradasMes:entradasMes.filter(e=>e.pessoa===filterPessoa);
  const pixFiltrados=filterPessoa==="todos"?pixMes:pixMes.filter(p=>p.pessoa===filterPessoa||p.pessoa==="casal");

  const catData=useMemo(()=>{const map={};saidasAtivasFiltradas.forEach(s=>{map[s.cat]=(map[s.cat]||0)+Number(s.valor);});return Object.entries(map).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);},[saidasAtivasFiltradas]);
  const barData=useMemo(()=>{
    if(graficoModo==="periodo"&&periodoInicio&&periodoFim){
      // Agrupar por mês no período selecionado
      const di=new Date(periodoInicio),df=new Date(periodoFim);
      const meses=[];
      let cur=new Date(di.getFullYear(),di.getMonth(),1);
      while(cur<=df&&meses.length<24){
        meses.push({m:cur.getMonth(),y:cur.getFullYear()});
        cur=new Date(cur.getFullYear(),cur.getMonth()+1,1);
      }
      return meses.map(({m,y})=>{
        let arr=[...saidasManuais,...saidasCSV,...pixList].filter(s=>{
          if(s.mes!==m||s.ano!==y||s.ativo===false)return false;
          // filtrar por dia se mesmo mês
          if(s.date){const sd=new Date(s.date);if(sd<di||sd>df)return false;}
          return true;
        });
        if(filterTag!=="todas")arr=arr.filter(s=>s.cat===filterTag);
        return{name:`${MONTHS[m].slice(0,3)}/${String(y).slice(2)}`,saidas:arr.reduce((a,s)=>a+Number(s.valor),0)};
      });
    }
    return Array.from({length:6},(_,i)=>{
      const m=(month-5+i+12)%12,y=month-5+i<0?year-1:year;
      let arr=[...saidasManuais,...saidasCSV,...pixList].filter(s=>s.mes===m&&s.ano===y&&s.ativo!==false);
      if(filterTag!=="todas")arr=arr.filter(s=>s.cat===filterTag);
      return{name:MONTHS[m].slice(0,3),saidas:arr.reduce((a,s)=>a+Number(s.valor),0)};
    });
  },[month,year,saidasManuais,saidasCSV,pixList,filterTag,graficoModo,periodoInicio,periodoFim]);

  // handlers
  function handleSalario(val){const s=snap(),newSal={...salarios,[editSalPessoa]:val};setSalarios(newSal);const nl=addLog("salario_edit",`Salário (${editSalPessoa==="eu"?"Você":"Esposa"}) → ${fmt(val)}`,s);persist({salarios:newSal,actionLog:nl});setModal(null);}
  function handleEntrada(dados){const s=snap();const item={...dados,id:editItem?editItem.id:"e-"+Date.now()};const ne=editItem?entradas.map(e=>e.id===item.id?item:e):[...entradas,item];setEntradas(ne);const nl=addLog(editItem?"entrada_edit":"entrada_add",`${editItem?"Editou":"Adicionou"} entrada "${item.desc}" · ${fmt(item.valor)}`,s);persist({entradas:ne,actionLog:nl});setModal(null);setEditItem(null);}
  function handlePix(dados){const s=snap();const item={...dados,id:editItem?editItem.id:"p-"+Date.now(),origem:"pix",ativo:true};const np=editItem?pixList.map(x=>x.id===item.id?item:x):[...pixList,item];setPixList(np);const nl=addLog(editItem?"saida_edit":"saida_add",`${editItem?"Editou":"Adicionou"} pix "${item.desc}" · ${fmt(item.valor)}`,s);persist({pixList:np,actionLog:nl});setModal(null);setEditItem(null);}
  function delEntrada(id){const item=entradas.find(e=>e.id===id),s=snap();const ne=entradas.filter(e=>e.id!==id);setEntradas(ne);const nl=addLog("entrada_del",`Apagou entrada "${item?.desc}"`,s);persist({entradas:ne,actionLog:nl});}
  function excluirSaida(id,origem){const s=snap();const item=[...saidasManuais,...saidasCSV].find(x=>x.id===id);const newSM=origem==="manual"?saidasManuais.filter(x=>x.id!==id):saidasManuais;const newCSV=origem!=="manual"?saidasCSV.filter(x=>x.id!==id):saidasCSV;setSaidasManuais(newSM);setSaidasCSV(newCSV);const nl=addLog("saida_del",`Excluiu "${item?.desc}"`,s);persist({saidasManuais:newSM,saidasCSV:newCSV,actionLog:nl});setAcaoItem(null);}
  function desativarSaida(id,origem){const s=snap();const item=[...saidasManuais,...saidasCSV].find(x=>x.id===id);const tog=x=>x.id===id?{...x,ativo:false}:x;const newSM=saidasManuais.map(tog),newCSV=saidasCSV.map(tog);setSaidasManuais(newSM);setSaidasCSV(newCSV);const nl=addLog("saida_edit",`Desativou "${item?.desc}"`,s);persist({saidasManuais:newSM,saidasCSV:newCSV,actionLog:nl});setAcaoItem(null);}
  function reativarSaida(id){const tog=x=>x.id===id?{...x,ativo:true}:x;const newSM=saidasManuais.map(tog),newCSV=saidasCSV.map(tog);setSaidasManuais(newSM);setSaidasCSV(newCSV);persist({saidasManuais:newSM,saidasCSV:newCSV});}
  function delPix(id){const item=pixList.find(p=>p.id===id),s=snap();const np=pixList.filter(p=>p.id!==id);setPixList(np);const nl=addLog("saida_del",`Apagou pix "${item?.desc}"`,s);persist({pixList:np,actionLog:nl});}
  function togglePago(id){const item=[...saidasManuais,...saidasCSV].find(x=>x.id===id),s=snap();const tog=x=>x.id===id?{...x,pago:!x.pago}:x;const newSM=saidasManuais.map(tog),newCSV=saidasCSV.map(tog);setSaidasManuais(newSM);setSaidasCSV(newCSV);const nl=addLog("saida_pago",`Marcou "${item?.desc}" como ${!item?.pago?"pago":"não pago"}`,s);persist({saidasManuais:newSM,saidasCSV:newCSV,actionLog:nl});}
  function handleEditarTag(item,novaCat,salvarMem){const s=snap();const upd=x=>x.id===item.id?{...x,cat:novaCat}:x;const newSM=saidasManuais.map(upd),newCSV=saidasCSV.map(upd);setSaidasManuais(newSM);setSaidasCSV(newCSV);let newMem=tagMemory;if(salvarMem){newMem={...tagMemory,[item.desc.toLowerCase().trim()]:novaCat};setTagMemory(newMem);}const nl=addLog("tag_edit",`Reclassificou "${item.desc}" → ${novaCat}`,s);persist({saidasManuais:newSM,saidasCSV:newCSV,tagMemory:newMem,actionLog:nl});setModal(null);setEditItem(null);}
  function handleSalvarTags(novasTags){const s=snap();setTags(novasTags);const nl=addLog("tag_edit","Atualizou lista de tags",s);persist({tags:novasTags,actionLog:nl});setModal(null);}
  async function handleFiles(files){const csvFiles=Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".csv"));if(!csvFiles.length)return;const loaded=[];for(const f of csvFiles)loaded.push({file:f,text:await f.text()});setPendingCSV(loaded);setImportModal(false);setImportMsg([]);}
  function confirmCSV(pessoa){
    const s=snap();
    const existingKeys=new Set(saidasCSV.map(t=>t.id));
    let allFresh=[],msgs=[];
    // Auto-salvar no tagMemory as tags detectadas automaticamente
    let newMem={...tagMemory};
    for(const{file,text}of pendingCSV){
      const newTx=parseNubankCSV(text,pessoa,tagMemory);
      const fresh=newTx.filter(t=>!existingKeys.has(t.id));
      fresh.forEach(t=>{
        existingKeys.add(t.id);
        // Salvar automaticamente a tag no banco de memória
        const key=t.desc.toLowerCase().trim();
        if(!newMem[key]) newMem[key]=t.cat;
      });
      allFresh=[...allFresh,...fresh];
      msgs.push(`✅ ${file.name}: ${fresh.length} importadas${newTx.length-fresh.length>0?`, ${newTx.length-fresh.length} duplicatas`:""}`);
    }
    const newCSV=[...saidasCSV,...allFresh];
    setSaidasCSV(newCSV);
    setTagMemory(newMem);
    const nl=addLog("csv_import",`Importou ${allFresh.length} transações (${pessoa==="eu"?"Você":"Esposa"})`,s);
    persist({saidasCSV:newCSV,tagMemory:newMem,actionLog:nl});
    setImportMsg(msgs);setPendingCSV(null);setImportModal(true);
  }

  const saldoColor=saldo>=0?"#06d6a0":"#ff6b6b";
  const isDark=tema==="dark";
  const bgMain=isDark?"#080c14":"#f7f8fa";
  const bgCard=isDark?"#0d1626":"#ffffff";
  const bgRow=isDark?"#080c14":"#f3f4f6";
  const bgHeader=isDark?"#0a0f1e":"#ffffff";
  const borderColor=isDark?"#1e2d45":"#e2e6ea";
  const textMain=isDark?"#e2e8f0":"#1a2332";
  const textSub=isDark?"#5a7090":"#64748b";
  // Cores de acento no tema claro ficam mais neutras
  const accentColor=(c)=>isDark?c:"#374151"; // títulos neutros no claro
  const monoColor=(c)=>isDark?c:c; // manter cores nos valores

  const PBadge=({p})=>{const cfg={eu:["#00e5ff","VOCÊ"],esposa:["#f472b6","ESPOSA"],casal:["#ffd166","CASAL"]}[p]||["#5a7090","—"];return <span style={{background:cfg[0]+"22",color:cfg[0],padding:"2px 7px",borderRadius:20,fontSize:14,fontWeight:700}}>{cfg[1]}</span>;};

  if(!loaded) return (
    <div style={{minHeight:"100vh",background:"#080c14",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <div style={{width:40,height:40,background:"linear-gradient(135deg,#00e5ff,#7c3aed)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:"#fff"}}>₦</div>
      <div style={{color:"#5a7090",fontSize:14,fontFamily:"monospace"}}>Carregando...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:bgMain,color:textMain,fontFamily:"'DM Sans',sans-serif",paddingBottom:60,transition:"background .3s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:4px;}
        input,select{background:${bgCard};border:1.5px solid ${borderColor};color:${textMain};border-radius:8px;padding:10px 14px;width:100%;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;transition:border .2s;}
        input:focus,select:focus{border-color:#00e5ff;}
        select option{background:${bgCard};}
        button{cursor:pointer;font-family:'DM Sans',sans-serif;}
        .btn-p{background:linear-gradient(135deg,#00c8e0,#007a99);color:#fff;border:none;border-radius:10px;padding:11px 20px;font-weight:700;font-size:14px;}
        .btn-s{border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;}
        .btn-d{background:#ff6b6b18;color:#ff6b6b;border:1px solid #ff6b6b33;}
        .btn-e{background:#00e5ff18;color:#00e5ff;border:1px solid #00e5ff33;}
        .overlay{position:fixed;inset:0;background:#00000099;backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;}
        .modal{background:${bgCard};border:1px solid ${borderColor};border-radius:20px;padding:28px;width:min(420px,96vw);max-height:92vh;overflow-y:auto;}
        .lbl{font-size:11px;color:${textSub};margin-bottom:5px;display:block;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
        .mono{font-family:'JetBrains Mono',monospace;}
        .drop{border:2px dashed ${borderColor};border-radius:14px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;}
        .drop.over{border-color:#00e5ff;background:#00e5ff08;}
        .row{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:10px;background:${bgRow};margin-bottom:7px;border:1px solid ${borderColor};transition:border .2s;}
        .row:hover{border-color:#2a3d5a;}
        .pill{border:1px solid ${borderColor};background:none;color:${textSub};border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;}
        .pill.on{color:#080c14;border-color:transparent;}
        @media(max-width:600px){.hide-sm{display:none!important;}}
      `}</style>

      {/* HEADER */}
      <div style={{background:bgHeader,borderBottom:`1px solid ${borderColor}`,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:920,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 0",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:30,height:30,background:"linear-gradient(135deg,#00e5ff,#7c3aed)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#fff",fontSize:14}}>₦</div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:700,letterSpacing:2,color:"#00e5ff"}}>FINTRACK</span>
              {saving&&<span style={{fontSize:14,color:"#ffd166",fontFamily:"monospace"}}>💾</span>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>{setImportModal(true);setImportMsg([]);}} style={{background:bgCard,border:`1px solid ${borderColor}`,color:textSub,borderRadius:8,padding:"6px 12px",fontSize:14,fontWeight:600}}>⬆ CSV</button>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={{width:"auto",fontSize:14,padding:"5px 8px",borderRadius:7}}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <select value={year} onChange={e=>setYear(Number(e.target.value))} style={{width:"auto",fontSize:14,padding:"5px 8px",borderRadius:7}}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={()=>setModal("config")} style={{background:bgCard,border:`1px solid ${borderColor}`,color:textSub,borderRadius:8,padding:"6px 10px",fontSize:16}} title="Configurações">⚙️</button>
            </div>
          </div>
          {/* TABS */}
          <div style={{display:"flex",gap:0,marginTop:6,overflowX:"auto",scrollbarWidth:"none"}}>
            {[["dashboard","Dashboard"],["entradas","Entradas"],["faturas","Faturas"],["pix","Pix"],["gráficos","Gráficos"],["log",actionLog.length>0?`📋 Log (${actionLog.length})`:"📋 Log"]].map(([t,label])=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:`2px solid ${tab===t?"#00e5ff":"transparent"}`,padding:"10px 16px",color:tab===t?"#00e5ff":textSub,fontSize:14,fontWeight:500,whiteSpace:"nowrap",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .2s",flexShrink:0}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:"20px 16px"}}>

        {/* FILTROS EXPANSÍVEIS */}
        {!["dashboard","log"].includes(tab)&&(
          <div style={{marginBottom:12}}>
            <button onClick={()=>setFiltrosAbertos(f=>!f)}
              style={{display:"flex",alignItems:"center",gap:8,background:bgCard,border:`1px solid ${borderColor}`,borderRadius:10,padding:"9px 14px",fontSize:14,color:textSub,fontWeight:600,width:"100%",justifyContent:"space-between",cursor:"pointer"}}>
              <span>🔍 Filtros {(filterPessoa!=="todos"||filterTag!=="todas")?"· Ativos":""}</span>
              <span style={{transition:"transform .2s",display:"inline-block",transform:filtrosAbertos?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
            </button>
            {filtrosAbertos&&(
              <div style={{background:bgCard,border:`1px solid ${borderColor}`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"12px 14px"}}>
                <div style={{fontSize:12,color:textSub,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Pessoa</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {[["todos","Todos","#e2e8f0"],["eu","Você","#00e5ff"],["esposa","Esposa","#f472b6"]].map(([v,l,c])=>(
                    <button key={v} className={`pill${filterPessoa===v?" on":""}`} style={filterPessoa===v?{background:c,color:"#080c14",borderColor:c}:{}} onClick={()=>setFilterPessoa(v)}>{l}</button>
                  ))}
                </div>
                {["faturas","gráficos"].includes(tab)&&<>
                  <div style={{fontSize:12,color:textSub,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Tag</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <button className={`pill${filterTag==="todas"?" on":""}`} style={filterTag==="todas"?{background:"#e2e8f0",color:"#080c14",borderColor:"#e2e8f0"}:{}} onClick={()=>setFilterTag("todas")}>Todas</button>
                    {tags.map(t=>(
                      <button key={t} className={`pill${filterTag===t?" on":""}`} style={filterTag===t?{background:"#00e5ff",color:"#080c14",borderColor:"#00e5ff"}:{}} onClick={()=>setFilterTag(t)}>{t}</button>
                    ))}
                    <button onClick={()=>setModal("gerenciarTags")} style={{background:bgRow,color:textSub,border:`1px solid ${borderColor}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600}}>🏷️ Editar tags</button>
                  </div>
                </>}
              </div>
            )}
          </div>
        )}


        {/* DASHBOARD */}
        {tab==="dashboard"&&<>
          <style>{`@keyframes shimmer{0%{left:-35%}100%{left:110%}}`}</style>
          <div style={{background:bgCard,border:`1px solid ${pct>80?"#ff6b6b44":pct>50?"#ffd16633":borderColor}`,borderRadius:14,padding:18,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:13,color:textSub,fontWeight:600}}>Comprometido do total</span>
              <span className="mono" style={{fontSize:16,fontWeight:700,color:pct>80?"#ff6b6b":pct>50?"#ffd166":"#06d6a0"}}>{Math.round(pct)}%</span>
            </div>
            <div style={{background:isDark?"#1e2d45":"#e2e6ea",borderRadius:999,height:16,position:"relative",overflow:"hidden"}}>
              <div style={{
                width:`${pct}%`,height:"100%",borderRadius:999,
                background:pct>80
                  ?"linear-gradient(90deg,#06d6a0,#ffd166,#ff9500,#ff6b6b)"
                  :pct>50?"linear-gradient(90deg,#06d6a0,#a8e063,#ffd166)"
                  :"linear-gradient(90deg,#06d6a0,#4cc9f0)",
                transition:"width .8s cubic-bezier(.4,0,.2,1)",
                boxShadow:pct>80?"0 0 14px #ff6b6b99":pct>50?"0 0 12px #ffd16677":"0 0 12px #06d6a077",
                position:"relative",overflow:"hidden"
              }}>
                <div style={{position:"absolute",top:0,left:"-35%",width:"30%",height:"100%",background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)",animation:"shimmer 1.8s ease-in-out infinite"}}/>
              </div>
            </div>
            <div style={{marginTop:8,fontSize:12,color:textSub}}>
              <span style={{color:"#06d6a0",fontWeight:600}}>{fmt(totalPago)}</span> pagos · <span style={{color:"#ffd166",fontWeight:600}}>{fmt(totalSaidas-totalPago)}</span> a pagar · sobra <span style={{color:saldoColor,fontWeight:700}}>{fmt(saldo)}</span>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
            {[{id:"saidas",label:"Saídas",val:totalSaidas,color:"#ff6b6b"},{id:"saldo",label:"Saldo",val:saldo,color:saldoColor},{id:"disponivel",label:"Disponível",val:disponivel,color:"#a78bfa"}].map(c=>(
              <div key={c.id} style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:18}}>
                <div style={{fontSize:13,color:textSub,fontWeight:700,textTransform:"uppercase",marginBottom:5}}>{c.label}</div>
                <div className="mono" style={{fontSize:18,fontWeight:700,color:c.color}}>{fmt(c.val)}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[["👤 Você","#00e5ff",salEu,faturasEu],["👩 Esposa","#f472b6",salEsposa,faturasEsposa]].map(([label,color,sal,fat])=>(
              <div key={label} style={{background:bgCard,border:`1px solid ${color}22`,borderRadius:14,padding:18}}>
                <div style={{fontSize:13,color:textSub,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>{label}</div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:13,color:textSub}}>Salário</span>
                  <span className="mono" style={{fontSize:13,color}}>{fmt(sal)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:13,color:textSub}}>Fatura</span>
                  <span className="mono" style={{fontSize:13,color:"#ff6b6b"}}>-{fmt(fat)}</span>
                </div>
                <div style={{background:borderColor,borderRadius:999,height:4}}>
                  <div style={{width:`${sal>0?Math.min(100,fat/sal*100):0}%`,height:"100%",background:color,borderRadius:999}}/>
                </div>
              </div>
            ))}
          </div>
        </>}


        {tab==="entradas"&&<>
          <div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:18,marginBottom:16,borderColor:"#ffd16633"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#ffd166",marginBottom:12}}>💰 Salários Mensais</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
              {[["eu","👤 Você","#00e5ff",salEu],["esposa","👩 Esposa","#f472b6",salEsposa],[null,"👫 Total","#ffd166",salTotal]].map(([key,label,color,val])=>(
                <div key={label} onClick={()=>{if(key){setEditSalPessoa(key);setModal("salario");}}} style={{background:bgRow,border:`2px solid ${color}33`,borderRadius:12,padding:"14px",cursor:key?"pointer":"default",textAlign:"center"}}>
                  <div style={{fontSize:14,color:textSub,marginBottom:5}}>{label}</div>
                  <div className="mono" style={{fontSize:15,fontWeight:700,color}}>{fmt(val)}</div>
                  {key&&<div style={{fontSize:14,color:textSub,marginTop:3}}>✎ editar</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:14,color:textSub,fontWeight:700,textTransform:"uppercase"}}>Entradas Avulsas · {MONTHS[month]}</div>
              <div className="mono" style={{fontSize:16,fontWeight:700,color:"#06d6a0",marginTop:2}}>{fmt(entradasFiltradas.reduce((a,e)=>a+Number(e.valor),0))}</div>
            </div>
            <button className="btn-p" onClick={()=>{setEditItem(null);setModal("entrada");}}>+ Adicionar</button>
          </div>
          {entradasFiltradas.length===0?<div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:36,color:textSub,textAlign:"center",fontSize:14}}>Nenhuma entrada avulsa</div>
            :entradasFiltradas.map(e=>(
              <div key={e.id} className="row">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.desc}</div>
                  <div style={{display:"flex",gap:5,marginTop:3}}><PBadge p={e.pessoa}/></div>
                </div>
                <span className="mono" style={{fontWeight:700,color:"#06d6a0",marginRight:8,flexShrink:0}}>{fmt(e.valor)}</span>
                <button className="btn-s btn-e" onClick={()=>{setEditItem(e);setModal("entrada");}}>✎</button>
                <button className="btn-s btn-d" style={{marginLeft:4}} onClick={()=>delEntrada(e.id)}>✕</button>
              </div>
            ))}
        </>}

        {/* FATURAS */}
        {tab==="faturas"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:14,color:textSub,textTransform:"uppercase",letterSpacing:.5}}>Total Faturas · {MONTHS[month]}</div>
              <div className="mono" style={{fontSize:20,fontWeight:700,color:"#ff6b6b"}}>{fmt(saidasAtivasFiltradas.reduce((a,s)=>a+Number(s.valor),0))}</div>
              <div style={{fontSize:13,color:textSub,marginTop:2}}>Clique em qualquer item para editar a tag</div>
            </div>
            <button onClick={()=>setShowBancoDados(b=>!b)}
              style={{background:showBancoDados?"#00e5ff22":bgCard,border:`1px solid ${showBancoDados?"#00e5ff":borderColor}`,color:showBancoDados?"#00e5ff":textSub,borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,flexShrink:0}}>
              🗃️ Banco de Dados
            </button>
          </div>

          {/* BANCO DE DADOS */}
          {showBancoDados&&(
            <div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:18,marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>🗃️ Banco de Tags</div>
              <div style={{fontSize:13,color:textSub,marginBottom:14}}>Todos os gastos com suas tags salvas automaticamente.</div>
              {Object.keys(tagMemory).length===0
                ?<div style={{color:textSub,fontSize:13,textAlign:"center",padding:20}}>Nenhum item salvo ainda · importe um CSV para popular</div>
                :<div style={{maxHeight:320,overflowY:"auto"}}>
                  {Object.entries(tagMemory).map(([key,tag])=>(
                    <div key={key} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${borderColor}`}}>
                      {editBancoItem===key
                        ?<>
                          <input value={editBancoDesc} onChange={e=>setEditBancoDesc(e.target.value)}
                            style={{flex:1,fontSize:13,padding:"5px 10px"}}
                            onKeyDown={e=>{if(e.key==="Enter"){const newMem={...tagMemory};delete newMem[key];if(editBancoDesc.trim())newMem[editBancoDesc.toLowerCase().trim()]=tag;setTagMemory(newMem);persist({tagMemory:newMem});setEditBancoItem(null);}}}/>
                          <button onClick={()=>{const newMem={...tagMemory};delete newMem[key];if(editBancoDesc.trim())newMem[editBancoDesc.toLowerCase().trim()]=tag;setTagMemory(newMem);persist({tagMemory:newMem});setEditBancoItem(null);}}
                            style={{background:"#06d6a022",color:"#06d6a0",border:"1px solid #06d6a033",borderRadius:7,padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>✓</button>
                          <button onClick={()=>setEditBancoItem(null)}
                            style={{background:"none",border:`1px solid ${borderColor}`,color:textSub,borderRadius:7,padding:"4px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
                        </>
                        :<>
                          <span style={{flex:1,fontSize:13,textTransform:"capitalize"}}>{key}</span>
                          <span style={{background:"#00e5ff22",color:"#00e5ff",padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{tag}</span>
                          <button onClick={()=>{setEditBancoItem(key);setEditBancoDesc(key);}}
                            style={{background:"#00e5ff18",color:"#00e5ff",border:"1px solid #00e5ff33",borderRadius:7,padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>✎</button>
                          <button onClick={()=>{const newMem={...tagMemory};delete newMem[key];setTagMemory(newMem);persist({tagMemory:newMem});}}
                            style={{background:"#ff6b6b18",color:"#ff6b6b",border:"1px solid #ff6b6b33",borderRadius:7,padding:"4px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>🗑️</button>
                        </>
                      }
                    </div>
                  ))}
                </div>
              }
            </div>
          )}
          {tags.filter(cat=>saidasFiltradas.some(s=>s.cat===cat)).map(cat=>{
            const items=saidasFiltradas.filter(s=>s.cat===cat);
            const ct=items.filter(s=>s.ativo!==false).reduce((a,s)=>a+Number(s.valor),0);
            return(
              <div key={cat} style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{fontSize:14,fontWeight:700,color:textSub,textTransform:"uppercase",letterSpacing:1}}>{cat}</span>
                  <span className="mono" style={{fontSize:14,color:"#ff6b6b"}}>{fmt(ct)}</span>
                </div>
                {items.map(s=>{
                  const inativo=s.ativo===false;
                  return(
                    <div key={s.id} className="row" style={{cursor:"pointer",opacity:inativo?.5:1,borderColor:inativo?"#ff6b6b22":borderColor}}
                      onClick={()=>{setEditItem(s);setModal("editarTag");}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:inativo?"line-through":"none"}}>{s.desc}</div>
                        <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                          <PBadge p={s.pessoa}/>
                          {s.fixo&&<span style={{background:"#a78bfa22",color:"#a78bfa",padding:"2px 7px",borderRadius:20,fontSize:14,fontWeight:700}}>FIXO</span>}
                          {s.pago&&!inativo&&<span style={{background:"#06d6a018",color:"#06d6a0",padding:"2px 7px",borderRadius:20,fontSize:14,fontWeight:700}}>PAGO</span>}
                          {inativo&&<span style={{background:"#ff6b6b18",color:"#ff6b6b",padding:"2px 7px",borderRadius:20,fontSize:14,fontWeight:700}}>DESATIVADO</span>}
                          {s.date&&<span style={{fontSize:14,color:textSub}}>{s.date}</span>}
                        </div>
                      </div>
                      <span className="mono" style={{fontWeight:700,color:inativo?textSub:"#ff6b6b",marginRight:8,flexShrink:0,textDecoration:inativo?"line-through":"none"}}>{fmt(s.valor)}</span>
                      {inativo
                        ?<button className="btn-s btn-e" style={{fontSize:14}} onClick={e=>{e.stopPropagation();reativarSaida(s.id);}}>↺</button>
                        :<button className="btn-s btn-d" onClick={e=>{e.stopPropagation();setAcaoItem(s);}}>✕</button>
                      }
                    </div>
                  );
                })}
              </div>
            );
          })}
          {saidasFiltradas.length===0&&<div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:40,color:textSub,textAlign:"center",fontSize:14}}>Nenhuma fatura · importe o CSV</div>}
        </>}

        {/* PIX */}
        {tab==="pix"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:14,color:textSub,textTransform:"uppercase",letterSpacing:.5}}>Total Pix · {MONTHS[month]}</div>
              <div className="mono" style={{fontSize:20,fontWeight:700,color:"#a78bfa"}}>{fmt(pixFiltrados.reduce((a,p)=>a+Number(p.valor),0))}</div>
            </div>
            <button className="btn-p" onClick={()=>{setEditItem(null);setModal("pix");}}>+ Novo Pix</button>
          </div>
          {pixFiltrados.length===0?<div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:40,color:textSub,textAlign:"center",fontSize:14}}>Nenhum pix registrado</div>
            :pixFiltrados.map(p=>(
              <div key={p.id} className="row">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.desc}</div>
                  <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                    <PBadge p={p.pessoa}/>
                    <span style={{background:"#a78bfa22",color:"#a78bfa",padding:"2px 7px",borderRadius:20,fontSize:14,fontWeight:700}}>PIX</span>
                  </div>
                </div>
                <span className="mono" style={{fontWeight:700,color:"#a78bfa",marginRight:8,flexShrink:0}}>{fmt(p.valor)}</span>
                <button className="btn-s btn-e" onClick={()=>{setEditItem(p);setModal("pix");}}>✎</button>
                <button className="btn-s btn-d" style={{marginLeft:4}} onClick={()=>delPix(p.id)}>✕</button>
              </div>
            ))}
        </>}

        {/* GRÁFICOS */}
        {tab==="gráficos"&&<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:18}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:textSub,textTransform:"uppercase",letterSpacing:1}}>Por Categoria</div>
              {catData.length===0?<div style={{color:textSub,fontSize:14,textAlign:"center",padding:30}}>Sem dados</div>:(
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {catData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie><Tooltip formatter={v=>fmt(v)} contentStyle={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:8,fontSize:14}}/></PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:18}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:textSub,textTransform:"uppercase",letterSpacing:1}}>Breakdown</div>
              {catData.map((c,i)=>(
                <div key={c.name} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:14,color:COLORS[i%COLORS.length]}}>{c.name}</span>
                    <span className="mono" style={{fontSize:14}}>{fmt(c.value)}</span>
                  </div>
                  <div style={{background:borderColor,borderRadius:999,height:4}}>
                    <div style={{width:`${totalSaidas>0?c.value/totalSaidas*100:0}%`,height:"100%",background:COLORS[i%COLORS.length],borderRadius:999}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:14,fontWeight:700,color:textSub,textTransform:"uppercase",letterSpacing:1}}>
                Saídas {graficoModo==="periodo"&&periodoInicio&&periodoFim?`· ${periodoInicio} → ${periodoFim}`:"· 6 Meses"} {filterTag!=="todas"?`· ${filterTag}`:""}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <button onClick={()=>setGraficoModo("6meses")} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${graficoModo==="6meses"?"#00e5ff":borderColor}`,background:graficoModo==="6meses"?"#00e5ff22":bgRow,color:graficoModo==="6meses"?"#00e5ff":textSub,fontSize:12,fontWeight:600,cursor:"pointer"}}>6 Meses</button>
                <button onClick={()=>setGraficoModo("periodo")} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${graficoModo==="periodo"?"#00e5ff":borderColor}`,background:graficoModo==="periodo"?"#00e5ff22":bgRow,color:graficoModo==="periodo"?"#00e5ff":textSub,fontSize:12,fontWeight:600,cursor:"pointer"}}>📅 Período</button>
              </div>
            </div>
            {graficoModo==="periodo"&&(
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <label style={{fontSize:12,color:textSub,fontWeight:600}}>De:</label>
                  <input type="date" value={periodoInicio} onChange={e=>setPeriodoInicio(e.target.value)}
                    style={{fontSize:13,padding:"6px 10px",borderRadius:8,border:`1px solid ${borderColor}`,background:bgCard,color:textMain,width:"auto"}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <label style={{fontSize:12,color:textSub,fontWeight:600}}>Até:</label>
                  <input type="date" value={periodoFim} onChange={e=>setPeriodoFim(e.target.value)}
                    style={{fontSize:13,padding:"6px 10px",borderRadius:8,border:`1px solid ${borderColor}`,background:bgCard,color:textMain,width:"auto"}}/>
                </div>
                {periodoInicio&&periodoFim&&<button onClick={()=>{setPeriodoInicio("");setPeriodoFim("");setGraficoModo("6meses");}}
                  style={{fontSize:12,color:"#ff6b6b",background:"none",border:"none",cursor:"pointer"}}>✕ Limpar</button>}
              </div>
            )}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{fill:textSub,fontSize:14}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:textSub,fontSize:14}} axisLine={false} tickLine={false} tickFormatter={v=>"R$"+v}/>
                <Tooltip formatter={v=>fmt(v)} contentStyle={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:8,fontSize:14}}/>
                {salTotal>0&&filterTag==="todas"&&<ReferenceLine y={salTotal} stroke="#ffd166" strokeDasharray="4 4" label={{value:"Salário",fill:"#ffd166",fontSize:14,position:"insideTopRight"}}/>}
                <Bar dataKey="saidas" fill="#ff6b6b" radius={[5,5,0,0]} name="Saídas"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>}

        {/* LOG */}
        {tab==="log"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:16,fontWeight:700}}>📋 Histórico</div>
              <div style={{fontSize:14,color:textSub,marginTop:2}}>🗑️ = desfaz a ação</div>
            </div>
            {actionLog.length>0&&<button onClick={()=>{setActionLog([]);persist({actionLog:[]});}} style={{background:"#ff6b6b18",color:"#ff6b6b",border:"1px solid #ff6b6b33",borderRadius:9,padding:"7px 14px",fontSize:14,fontWeight:600}}>Limpar</button>}
          </div>
          {actionLog.length===0&&<div style={{background:bgCard,border:`1px solid ${borderColor}`,borderRadius:14,padding:40,color:textSub,textAlign:"center",fontSize:14}}>Nenhuma ação ainda</div>}
          {actionLog.map(entry=>(
            <div key={entry.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 16px",borderRadius:12,background:bgCard,marginBottom:8,border:`1px solid ${borderColor}`}}>
              <div style={{width:36,height:36,borderRadius:10,background:(entry.color||"#5a7090")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{entry.icon||"•"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:entry.color||textMain,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.label}</div>
                <div style={{fontSize:14,color:textSub,marginTop:2}}>{entry.ts}</div>
              </div>
              <button onClick={()=>{setConfirmUndoId(entry.id);setModal("confirmaUndo");}} style={{background:"none",border:"1px solid #ff6b6b33",color:"#ff6b6b",borderRadius:8,padding:"5px 8px",fontSize:14,flexShrink:0}}>🗑️</button>
            </div>
          ))}
        </>}
      </div>

      {/* MODAIS */}
      {modal==="config"&&<ModalConfig tema={tema} setTema={setTema} onClose={()=>setModal(null)}/>}
      {modal==="confirmaUndo"&&<ModalConfirm label={actionLog.find(l=>l.id===confirmUndoId)?.label||""} onCancel={()=>setModal(null)} onConfirm={()=>undoAction(confirmUndoId)}/>}
      {modal==="salario"&&<ModalSalario pessoa={editSalPessoa} valorAtual={salarios[editSalPessoa]} onCancel={()=>setModal(null)} onSave={handleSalario}/>}
      {modal==="entrada"&&<ModalEntrada mesAtual={month} anoAtual={year} itemEdit={editItem} onCancel={()=>{setModal(null);setEditItem(null);}} onSave={handleEntrada}/>}
      {modal==="pix"&&<ModalPix mesAtual={month} anoAtual={year} itemEdit={editItem} onCancel={()=>{setModal(null);setEditItem(null);}} onSave={handlePix}/>}
      {modal==="editarTag"&&editItem&&<ModalEditarTag item={editItem} tags={tags} onCancel={()=>{setModal(null);setEditItem(null);}} onSave={(cat,mem)=>handleEditarTag(editItem,cat,mem)}/>}
      {modal==="gerenciarTags"&&<ModalGerenciarTags tags={tags} onCancel={()=>setModal(null)} onSave={handleSalvarTags}/>}
      {acaoItem&&<ModalExcluirDesativar item={acaoItem} onCancel={()=>setAcaoItem(null)} onExcluir={()=>excluirSaida(acaoItem.id,acaoItem.origem)} onDesativar={()=>desativarSaida(acaoItem.id,acaoItem.origem)}/>}
      {pendingCSV&&<ModalCSVDono nomes={pendingCSV.map(f=>f.file.name).join(", ")} onCancel={()=>setPendingCSV(null)} onConfirm={confirmCSV}/>}

      {importModal&&(
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setImportModal(false)}>
          <div className="modal">
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Importar Fatura CSV</div>
            <div style={{fontSize:14,color:textSub,marginBottom:18}}>CSV Nubank · <span style={{color:"#ffd166"}}>duplicatas ignoradas</span></div>
            <input ref={fileRef} type="file" accept=".csv" multiple onChange={e=>{handleFiles(e.target.files);e.target.value='';}} style={{display:'none'}}/>
            <div className={`drop${dragOver?" over":""}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}} onClick={()=>fileRef.current?.click()}>
              <div style={{fontSize:32,marginBottom:8}}>📂</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Arraste ou clique</div>
              <div style={{fontSize:14,color:textSub}}>Nubank_YYYY-MM-DD.csv</div>
            </div>
            {importMsg.length>0&&<div style={{marginTop:14,background:bgRow,borderRadius:10,padding:"10px 14px"}}>{importMsg.map((l,i)=><div key={i} style={{fontSize:14,color:textSub,marginBottom:2,fontFamily:"monospace"}}>{l}</div>)}</div>}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:14,alignItems:"center"}}>
              <span style={{fontSize:14,color:textSub}}>{saidasCSV.length} transações</span>
              <div style={{display:"flex",gap:8}}>
                {saidasCSV.length>0&&<button onClick={()=>{setSaidasCSV([]);persist({saidasCSV:[]});setImportMsg([]);}} style={{background:"#ff6b6b18",color:"#ff6b6b",border:"1px solid #ff6b6b33",borderRadius:8,padding:"8px 12px",fontSize:14}}>Limpar</button>}
                <button className="btn-p" onClick={()=>setImportModal(false)}>Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
