/* AeroSim Audio: Web Audio synthesis + online radio + local MP3 playback. */
window.AeroAudio = (() => {
  const stations = [
    {name:"Radio El Mundo · 93.7 FM",url:"https://streaming.mundoclasicaupa.com:8001/radioelmundo",site:"https://www.radioelmundo.com.sv/"},
    {name:"ABC · 100.1 FM",url:"https://streaming.rcs.com.sv/proxy/abc/stream",site:"https://www.abc.com.sv/"},
    {name:"La Urbana · 94.9 FM",url:"https://streaming.rcs.com.sv/proxy/urbana/stream",site:"https://www.laurbana.com.sv/"},
    {name:"Radio YSKL · 104.1 FM",url:"https://media.dominiocreativo.com:8000/stream/1/",site:"https://www.yskl.com/"},
    {name:"Radio Astral · 102.9 FM",url:"https://streaming.rcs.com.sv/proxy/astral/stream",site:"https://www.radioastral.com.sv/"},
    {name:"Radio YSUCA · 91.7 FM",url:"https://fast.citrus3.com:8314/stream",site:"https://ysuca.org.sv/"},
    {name:"Radio La Chévere · 100.9 FM",url:"https://streaming.rcs.com.sv/proxy/chevere/stream",site:"https://www.lachevere.com.sv/"},
    {name:"Radio Bautista",url:"https://s2.radio.co/s3a7dc3d82/listen",site:"https://radiobautista.com/"},
    {name:"SUR FM · 105.3 FM",url:"https://surfmradio.com/",site:"https://surfmradio.com/",page:true}
  ];
  let ctx=null, master=null, engineGain=null, windGain=null, noiseSource=null, engineOsc1=null, engineOsc2=null, engineFilter=null;
  let radio=null, tracks=[], trackIndex=0, uiReady=false, lastCrash=0;
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function ensureAudio(){
    if(ctx){if(ctx.state==="suspended")ctx.resume().catch(()=>{});return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    ctx=new AC();master=ctx.createGain();master.gain.value=.8;master.connect(ctx.destination);
    engineGain=ctx.createGain();engineGain.gain.value=0;engineFilter=ctx.createBiquadFilter();engineFilter.type="lowpass";engineFilter.frequency.value=420;engineFilter.Q.value=.7;
    engineOsc1=ctx.createOscillator();engineOsc1.type="sawtooth";engineOsc1.frequency.value=55;
    engineOsc2=ctx.createOscillator();engineOsc2.type="triangle";engineOsc2.frequency.value=110;
    const osc2Gain=ctx.createGain();osc2Gain.gain.value=.28;
    engineOsc1.connect(engineFilter);engineOsc2.connect(osc2Gain);osc2Gain.connect(engineFilter);engineFilter.connect(engineGain);engineGain.connect(master);
    engineOsc1.start();engineOsc2.start();
    const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const data=buffer.getChannelData(0);
    let last=0;for(let i=0;i<data.length;i++){const white=Math.random()*2-1;last=.985*last+.015*white;data[i]=last*.7+(Math.random()*2-1)*.3;}
    noiseSource=ctx.createBufferSource();noiseSource.buffer=buffer;noiseSource.loop=true;
    const windFilter=ctx.createBiquadFilter();windFilter.type="lowpass";windFilter.frequency.value=600;
    windGain=ctx.createGain();windGain.gain.value=0;noiseSource.connect(windFilter);windFilter.connect(windGain);windGain.connect(master);noiseSource.start();
  }
  function setStatus(text){const el=$("audioStatus");if(el)el.textContent=text;}
  function setupUI(){
    if(uiReady||!$("radioStation"))return;uiReady=true;
    radio=$("radioStream");radio.preload="none";
    for(const s of stations){const o=document.createElement("option");o.value=s.url;o.textContent=s.name;radio.appendChild(o);}
    radio.addEventListener("error",()=>setStatus("No se pudo reproducir esta señal. Prueba otra emisora o abre su web."));
    radio.addEventListener("playing",()=>setStatus("Reproduciendo radio por internet."));
    $("soundEnable").addEventListener("click",()=>{ensureAudio();if(ctx&&ctx.state==="suspended")ctx.resume();setStatus("Sonido de motor y viento activado.");});
    $("radioPlay").addEventListener("click",async()=>{
      ensureAudio();const s=stations.find(x=>x.url===$("radioStation").value);
      if(s&&s.page){window.open(s.site,"_blank","noopener");setStatus("SUR FM se abre en su página oficial; pulsa play allí.");return;}
      if(!radio.paused){radio.pause();$("radioPlay").textContent="▶ Radio";return;}
      $("mp3Player").pause();radio.src=$("radioStation").value;radio.volume=Number($("radioVolume").value)/100;
      try{await radio.play();$("radioPlay").textContent="Ⅱ Pausar radio";}catch(e){setStatus("El navegador o la emisora bloqueó la reproducción. Prueba otra emisora.");}
    });
    $("radioStation").addEventListener("change",()=>{radio.pause();radio.removeAttribute("src");radio.load();$("radioPlay").textContent="▶ Radio";setStatus("Emisora seleccionada. Pulsa Radio para escuchar.");});
    $("radioVolume").addEventListener("input",()=>{if(radio)radio.volume=Number($("radioVolume").value)/100;$("radioVolLabel").textContent=$("radioVolume").value+"%";});
    $("engineVolume").addEventListener("input",()=>{$("engineVolLabel").textContent=$("engineVolume").value+"%";if(engineGain)engineGain.gain.setTargetAtTime(Number($("engineVolume").value)/100*.42,ctx.currentTime,.08);if(windGain)windGain.gain.setTargetAtTime(Number($("engineVolume").value)/100*.25,ctx.currentTime,.08);});
    $("mp3Files").addEventListener("change",e=>{
      for(const f of Array.from(e.target.files||[])){if(!f.type.startsWith("audio/")&&!/\.mp3$/i.test(f.name))continue;tracks.push({name:f.name,url:URL.createObjectURL(f)});}
      renderTracks();if(tracks.length){trackIndex=tracks.length-(e.target.files?.length||1);playTrack(trackIndex);}
      e.target.value="";
    });
    $("mp3Play").addEventListener("click",()=>{if(!tracks.length){setStatus("Primero elige archivos MP3 de tu Chromebook.");return;}if(!radio.paused)radio.pause();if(radio.src)radio.pause();const a=$("mp3Player");if(a.paused)playTrack(trackIndex);else a.pause();});
    $("mp3Prev").addEventListener("click",()=>{if(tracks.length)playTrack((trackIndex-1+tracks.length)%tracks.length);});
    $("mp3Next").addEventListener("click",()=>{if(tracks.length)playTrack((trackIndex+1)%tracks.length);});
    $("mp3Player").addEventListener("ended",()=>{if(tracks.length)playTrack((trackIndex+1)%tracks.length);});
    $("mp3Player").addEventListener("play",()=>{$("mp3Play").textContent="Ⅱ Pausar MP3";});
    $("mp3Player").addEventListener("pause",()=>{$("mp3Play").textContent="▶ Reproducir MP3";});
    $("mp3Volume").addEventListener("input",()=>{$("mp3Player").volume=Number($("mp3Volume").value)/100;$("mp3VolLabel").textContent=$("mp3Volume").value+"%";});
    $("radioVolume").dispatchEvent(new Event("input"));$("mp3Volume").dispatchEvent(new Event("input"));$("engineVolume").dispatchEvent(new Event("input"));
    setStatus("El audio empieza cuando pulses un botón; no requiere instalar nada.");
  }
  function renderTracks(){const list=$("mp3List");if(!list)return;list.textContent=tracks.length?tracks.map((t,i)=>(i+1)+". "+t.name).join(" · "):"Ningún archivo seleccionado.";}
  async function playTrack(i){if(!tracks.length)return;ensureAudio();trackIndex=(i+tracks.length)%tracks.length;const a=$("mp3Player");a.src=tracks[trackIndex].url;a.volume=Number($("mp3Volume").value)/100;try{await a.play();setStatus("MP3 local: "+tracks[trackIndex].name);}catch(e){setStatus("No se pudo reproducir el archivo seleccionado.");}}
  function update(s){
    setupUI();if(!s)return;ensureAudio();if(!ctx)return;
    const now=ctx.currentTime,th=clamp(Number(s.throttle)||0,0,1),v=clamp((Number(s.speed)||0)/220,0,1),f=45+th*90+v*35;
    engineOsc1.frequency.setTargetAtTime(f,now,.12);engineOsc2.frequency.setTargetAtTime(f*2.03,now,.12);
    engineFilter.frequency.setTargetAtTime(180+th*1050+v*500,now,.15);
    const vol=Number($("engineVolume")?.value??55)/100;
    const active=s.crashed?0:(s.landed?.16:.24+v*.2);
    engineGain.gain.setTargetAtTime(active*vol*(.12+th*.88),now,.18);
    windGain.gain.setTargetAtTime(s.crashed?0:vol*(.008+v*v*.18),now,.3);
  }
  function burst({duration=.7,frequency=90,volume=.8,filter=1200}={}){
    ensureAudio();if(!ctx||!master)return;const now=ctx.currentTime;
    const length=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,length,ctx.sampleRate),d=buffer.getChannelData(0);
    for(let i=0;i<length;i++){const t=i/length;d[i]=(Math.random()*2-1)*Math.pow(1-t,2.2);}
    const src=ctx.createBufferSource();src.buffer=buffer;
    const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=filter;
    const gain=ctx.createGain();gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    const osc=ctx.createOscillator();const og=ctx.createGain();osc.type="sine";osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(Math.max(24,frequency*.35),now+duration);og.gain.setValueAtTime(volume*.8,now);og.gain.exponentialRampToValueAtTime(.001,now+duration);
    src.connect(lp);lp.connect(gain);gain.connect(master);osc.connect(og);og.connect(master);src.start();osc.start();src.stop(now+duration);osc.stop(now+duration);
  }
  function crash(){const now=performance.now();if(now-lastCrash<1800)return;lastCrash=now;ensureAudio();if(engineGain&&ctx)engineGain.gain.setTargetAtTime(0,ctx.currentTime,.04);burst({duration:1.8,frequency:68,volume:1,filter:850});setTimeout(()=>burst({duration:.55,frequency:42,volume:.45,filter:350}),100);setTimeout(()=>burst({duration:.8,frequency:125,volume:.28,filter:1800}),180);}
  function impact(){burst({duration:.22,frequency:95,volume:.45,filter:500});}
  function reset(){if(engineGain&&ctx)engineGain.gain.setTargetAtTime(0,ctx.currentTime,.1);}
  function init(){setupUI();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
  return Object.freeze({update,crash,impact,reset,stations});
})();