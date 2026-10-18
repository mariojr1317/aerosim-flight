/* AeroSim Audio: Web Audio synthesis + online radio + local MP3 playback. */
window.AeroAudio = (() => {
  const fallbackStations = [
    {name:"Radio El Mundo · 93.7 FM",url:"https://streaming.mundoclasicaupa.com:8001/radioelmundo",site:"https://www.radioelmundo.com.sv/"},
    {name:"ABC · 100.1 FM",url:"https://streaming.rcs.com.sv/proxy/abc/stream",site:"https://www.abc.com.sv/"},
    {name:"La Urbana · 94.9 FM",url:"https://streaming.rcs.com.sv/proxy/urbana/stream",site:"https://www.laurbana.com.sv/"},
    {name:"Radio YSKL · 104.1 FM",url:"https://media.dominiocreativo.com:8000/stream/1/",site:"https://www.yskl.com/"},
    {name:"Radio Astral · 102.9 FM",url:"https://streaming.rcs.com.sv/proxy/astral/stream",site:"https://www.radioastral.com.sv/"},
    {name:"Radio YSUCA · 91.7 FM",url:"https://fast.citrus3.com:8314/stream",site:"https://ysuca.org.sv/"},
    {name:"Radio La Chévere · 100.9 FM",url:"https://streaming.rcs.com.sv/proxy/chevere/stream",site:"https://www.lachevere.com.sv/"},
    {name:"Radio Bautista",url:"https://s2.radio.co/s3a7dc3d82/listen",site:"https://radiobautista.com/"},
    {name:"Radio Verdad · 95.7 FM",url:"https://cloudstream2036.conectarhosting.com/8168/stream",site:"https://radioverdad.org/"},
    {name:"Radio Rumba Latina",url:"https://c11.radioboss.fm:8303/stream",site:"https://www.radioselsalvador.org/"},
    {name:"La Tribu FM",url:"https://streamer.radio.co/s3a3c12873/listen",site:"https://www.radioselsalvador.org/"},
    {name:"100.7 Stereo",url:"https://stream20.usastreams.com/8138/stream",site:"https://www.radioselsalvador.org/"},
    {name:"SUR FM · 105.3 FM",url:"https://surfmradio.com/",site:"https://surfmradio.com/",page:true}
  ];
  let stations=fallbackStations.slice(), lastPosition=null, lastLookupAt=0, lookupPending=false, ctx=null, master=null, engineGain=null, windGain=null, noiseSource=null, engineOsc1=null, engineOsc2=null, engineFilter=null;
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
    if($("radioStation").options.length===0){for(const s of stations){const o=document.createElement("option");o.value=s.url;o.textContent=s.name;$("radioStation").appendChild(o);}}
    const nearbyBtn=$("radioNearby");
    if(nearbyBtn)nearbyBtn.addEventListener("click",()=>{if(lastPosition)loadNearbyStations(lastPosition.lat,lastPosition.lon,true);else setStatus("Esperando las coordenadas del avión…");});
    radio.addEventListener("error",()=>{setStatus("La emisora seleccionada no respondió. Elige otra y pulsa Radio.");$("radioPlay").textContent="▶ Radio";});
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
    setStatus("Buscando emisoras cercanas a la ubicación del avión…");
  }
  function renderTracks(){const list=$("mp3List");if(!list)return;list.textContent=tracks.length?tracks.map((t,i)=>(i+1)+". "+t.name).join(" · "):"Ningún archivo seleccionado.";}
  async function playTrack(i){if(!tracks.length)return;ensureAudio();trackIndex=(i+tracks.length)%tracks.length;const a=$("mp3Player");a.src=tracks[trackIndex].url;a.volume=Number($("mp3Volume").value)/100;try{await a.play();setStatus("MP3 local: "+tracks[trackIndex].name);}catch(e){setStatus("No se pudo reproducir el archivo seleccionado.");}}
  function distanceKm(a,b,c,d){
    const rad=x=>x*Math.PI/180,dl=rad(c-a),dn=rad(d-b);
    const h=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  async function loadNearbyStations(lat,lon,manual=false){
    if(lookupPending||!Number.isFinite(lat)||!Number.isFinite(lon))return;
    lookupPending=true;
    const btn=$("radioNearby");if(btn){btn.disabled=true;btn.textContent="Buscando…";}
    if(manual)setStatus("Buscando emisoras cercanas a la posición del avión…");
    try{
      const url="https://de1.api.radio-browser.info/json/stations/search?latitude="+encodeURIComponent(lat)+"&longitude="+encodeURIComponent(lon)+"&order=distance&reverse=false&limit=40&hidebroken=true&is_https=true";
      const response=await fetch(url,{headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("HTTP "+response.status);
      const data=await response.json();
      const found=(Array.isArray(data)?data:[]).filter(x=>x&&x.name&&x.url_resolved&&/^https:\/\//i.test(x.url_resolved))
        .map(x=>({name:(x.name||"Emisora").trim()+(x.country?" · "+x.country:""),url:x.url_resolved,site:x.homepage||"",country:x.country||"",lat:Number(x.geo_lat),lon:Number(x.geo_long),distance:Number(x.distance)||null}))
        .filter((x,i,arr)=>arr.findIndex(y=>y.url===x.url)===i).slice(0,25);
      if(!found.length)throw new Error("No se encontraron streams HTTPS");
      stations=found;
      const select=$("radioStation"),old=select.value;
      select.replaceChildren();
      for(const st of stations){const option=document.createElement("option");option.value=st.url;option.textContent=st.name;select.appendChild(option);}
      if(stations.some(st=>st.url===old))select.value=old;
      else{radio.pause();radio.removeAttribute("src");radio.load();$("radioPlay").textContent="▶ Radio";}
      const nearest=stations[0];
      setStatus("Encontré "+stations.length+" radios cercanas"+(nearest?" · más cercana: "+nearest.name:"")+". Selecciona una y pulsa Radio.");
      lastLookupAt=Date.now();
    }catch(err){
      stations=fallbackStations.slice();
      setStatus("No pude consultar radios cercanas por internet. Se mantienen las emisoras de El Salvador.");
      if(manual)console.warn("Radios cercanas:",err);
    }finally{
      lookupPending=false;if(btn){btn.disabled=false;btn.textContent="📡 Radios cercanas";}
    }
  }
  function update(s){
    setupUI();if(!s)return;
    if(Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon))){
      const pos={lat:Number(s.lat),lon:Number(s.lon)};
      const moved=!lastPosition||distanceKm(lastPosition.lat,lastPosition.lon,pos.lat,pos.lon)>80;
      lastPosition=pos;
      if(!lookupPending&&(!lastLookupAt||((Date.now()-lastLookupAt)>180000&&moved)))loadNearbyStations(pos.lat,pos.lon,false);
    }
    ensureAudio();if(!ctx)return;
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