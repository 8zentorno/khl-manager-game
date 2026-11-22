/* KHL Manager Mobile Edition 7.26 — scoring calibration, clearer press quote and delayed regular-season objective result. */
(function(){
  const proto=KHLManagerApp.prototype;
  const baseRenderObjectiveModal725=proto.renderObjectiveModal;
  const baseFinishRegularSeasonTransition725=proto.finishRegularSeasonTransition;
  const baseRenderAll725=proto.renderAll;
  const baseRepairSave725=proto.repairSave;
  const basePlayNextMatch725=proto.playNextMatch;

  proto.renderObjectiveModal=function(){
    if(this._delayRegularObjectiveModal725 && this.state?.objectiveModal?.kind==='regular') return;
    return baseRenderObjectiveModal725.apply(this,arguments);
  };

  proto.ensurePendingRegularObjectiveModal725=function(){
    const pending=this.state?.pendingRegularObjectiveModal725;
    if(!pending||this._khl725RegularModalTimer)return;
    const wait=Math.max(0,Number(pending.dueAt||0)-Date.now());
    this._khl725RegularModalTimer=setTimeout(()=>{
      this._khl725RegularModalTimer=null;
      if(!this.state||this.state.pendingRegularObjectiveModal725!==pending)return;
      if(this.state.objectiveModal){
        pending.dueAt=Date.now()+1000;
        this.ensurePendingRegularObjectiveModal725();
        return;
      }
      delete this.state.pendingRegularObjectiveModal725;
      this.state.objectiveModal=pending.modal;
      this.persistQuietly();
      this.renderAll();
      this.renderObjectiveModal();
    },wait);
  };

  proto.finishRegularSeasonTransition=function(){
    if(!this.state)return baseFinishRegularSeasonTransition725.apply(this,arguments);
    if(this._khl725RunningRegularTransition)return false;
    if(this.state.teamObjective?.regularObjectiveModalHandled){
      this.ensurePendingRegularObjectiveModal725();
      return false;
    }
    const userRegularLeft=(this.state.matches||[]).some(m=>!m.playoff&&!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId));
    if(userRegularLeft)return baseFinishRegularSeasonTransition725.apply(this,arguments);

    this._khl725RunningRegularTransition=true;
    this._delayRegularObjectiveModal725=true;
    let result=false;
    try{ result=baseFinishRegularSeasonTransition725.apply(this,arguments); }
    finally{ this._delayRegularObjectiveModal725=false; this._khl725RunningRegularTransition=false; }

    if(result && this.state?.objectiveModal?.kind==='regular'){
      const modal={...this.state.objectiveModal};
      this.state.objectiveModal=null;
      this.state.pendingRegularObjectiveModal725={modal,dueAt:Date.now()+10000};
      this.persistQuietly();
      this.ensurePendingRegularObjectiveModal725();
      this.renderAll();
    }else if(this.state?.pendingRegularObjectiveModal725){
      this.ensurePendingRegularObjectiveModal725();
    }
    return result;
  };

  proto.renderAll=function(){
    const result=baseRenderAll725.apply(this,arguments);
    if(this.state)this.ensurePendingRegularObjectiveModal725();
    return result;
  };

  if(typeof baseRepairSave725==='function')proto.repairSave=function(){
    const result=baseRepairSave725.apply(this,arguments);
    if(this.state)this.ensurePendingRegularObjectiveModal725();
    return result;
  };

  proto.playNextMatch=function(){
    if(this.state?.pendingRegularObjectiveModal725){
      this.ensurePendingRegularObjectiveModal725();
      this.setNotice('Регулярный чемпионат завершён. Итог цели клуба появится через несколько секунд.');
      return;
    }
    return basePlayNextMatch725.apply(this,arguments);
  };
})();
