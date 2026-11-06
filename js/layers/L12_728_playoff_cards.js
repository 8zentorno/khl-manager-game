/* KHL Manager Mobile Edition 7.28 — playoff series cards and scoring balance. */
(function(){
  const proto=KHLManagerApp.prototype;

  proto.playoffShortDate726=function(offset){
    try{return String(this.formatDate(Number(offset)||0)).replace(/\s+\d{4}(?:\s*г\.?)?$/i,'').trim();}
    catch(_){return '';}
  };

})();
