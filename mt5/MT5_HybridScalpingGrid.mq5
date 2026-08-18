#property strict
#property version   "1.00"
#property description "Directional EMA/RSI hybrid scalping grid EA"
#property description "Use on a hedging account; test on demo before live deployment."

#include <Trade/Trade.mqh>

CTrade trade;

enum ENUM_GRID_MODE
  {
   GRID_SIGNAL_ONLY = 0,
   GRID_ADVERSE_ONLY = 1,
   GRID_BOTH_DIRECTIONS = 2
  };

enum ENUM_LOT_MODE
  {
   LOT_FIXED = 0,
   LOT_RISK_PERCENT = 1
  };

input group "Signal Settings"
input ENUM_TIMEFRAMES InpSignalTimeframe = PERIOD_M5;
input int             InpFastEMALength = 20;
input int             InpSlowEMALength = 50;
input int             InpRSILength = 14;
input double          InpRSIOverbought = 70.0;
input double          InpRSIOversold = 30.0;
input bool            InpUseHigherTimeframeFilter = false;
input ENUM_TIMEFRAMES InpHigherTimeframe = PERIOD_D1;

input group "Grid Settings"
input ENUM_GRID_MODE  InpGridMode = GRID_ADVERSE_ONLY;
input double          InpGridDistancePips = 10.0;
input int             InpMaxGridLevels = 5;
input double          InpLotMultiplier = 1.0;
input double          InpMaxLot = 1.0;
input ENUM_LOT_MODE   InpLotMode = LOT_FIXED;
input double          InpBaseLot = 0.01;
input double          InpRiskPercentPerBasket = 0.25;
input bool            InpRequireHedgingAccount = true;

input group "Basket and Risk Controls"
input double          InpBasketProfitMoney = 5.0;
input double          InpBasketLossMoney = 25.0;
input bool            InpUseIndividualStops = true;
input double          InpStopLossPips = 25.0;
input double          InpTakeProfitPips = 0.0;
input double          InpMaxSpreadPips = 2.0;
input double          InpDailyLossLimitMoney = 50.0;
input int             InpCooldownSeconds = 60;
input bool            InpCloseOnOppositeSignal = true;

input group "Trading Window"
input bool            InpUseTradingWindow = false;
input int             InpStartHour = 7;
input int             InpEndHour = 20;

input group "Execution"
input ulong           InpMagicNumber = 12345;
input int             InpDeviationPoints = 20;
input string          InpTradeComment = "HybridScalpGrid";

int      g_fast_handle = INVALID_HANDLE;
int      g_slow_handle = INVALID_HANDLE;
int      g_rsi_handle = INVALID_HANDLE;
int      g_htf_fast_handle = INVALID_HANDLE;
int      g_htf_slow_handle = INVALID_HANDLE;
datetime g_last_signal_bar = 0;
datetime g_last_trade_time = 0;
datetime g_day_start = 0;
double   g_day_start_equity = 0.0;

// The grid distance input follows the indicator's "pips/points" convention.
double PipSize()
  {
   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   return ((digits==3 || digits==5) ? _Point*10.0 : _Point);
  }

double GridDistancePrice()
  {
   return MathMax(InpGridDistancePips,0.0)*PipSize();
  }

bool IsTradingWindow()
  {
   if(!InpUseTradingWindow) return true;
   MqlDateTime now; TimeToStruct(TimeCurrent(),now);
   if(InpStartHour==InpEndHour) return true;
   if(InpStartHour<InpEndHour) return (now.hour>=InpStartHour && now.hour<InpEndHour);
   return (now.hour>=InpStartHour || now.hour<InpEndHour);
  }

bool IsHedgingAccount()
  {
   ENUM_ACCOUNT_MARGIN_MODE mode=(ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mode==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING;
  }

bool IsSpreadAcceptable()
  {
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   double spread_pips=(tick.ask-tick.bid)/PipSize();
   return spread_pips<=InpMaxSpreadPips;
  }

void ResetDailyReferenceIfNeeded()
  {
   MqlDateTime now; TimeToStruct(TimeCurrent(),now);
   now.hour=0; now.min=0; now.sec=0;
   datetime today=StructToTime(now);
   if(today!=g_day_start)
     {
      g_day_start=today;
      g_day_start_equity=AccountInfoDouble(ACCOUNT_EQUITY);
     }
  }

bool DailyLossBreached()
  {
   if(InpDailyLossLimitMoney<=0.0) return false;
   ResetDailyReferenceIfNeeded();
   return AccountInfoDouble(ACCOUNT_EQUITY)<=g_day_start_equity-InpDailyLossLimitMoney;
  }

int CountPositions(const int direction=-1)
  {
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
      long type=PositionGetInteger(POSITION_TYPE);
      if(direction<0 || type==direction) count++;
     }
   return count;
  }

double BasketProfit()
  {
   double value=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
      value+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
     }
   return value;
  }

void CloseBasket()
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
      if(!trade.PositionClose(ticket)) PrintFormat("Close failed %I64u: %s",ticket,trade.ResultRetcodeDescription());
     }
   g_last_trade_time=TimeCurrent();
  }

bool ReadSignal(bool &buy_signal,bool &sell_signal,datetime &closed_bar)
  {
   buy_signal=false; sell_signal=false; closed_bar=0;
   double fast[3],slow[3],rsi[3]; ArraySetAsSeries(fast,true); ArraySetAsSeries(slow,true); ArraySetAsSeries(rsi,true);
   if(CopyBuffer(g_fast_handle,0,0,3,fast)!=3 || CopyBuffer(g_slow_handle,0,0,3,slow)!=3 || CopyBuffer(g_rsi_handle,0,0,3,rsi)!=3) return false;
   datetime bars[3]; ArraySetAsSeries(bars,true);
   if(CopyTime(_Symbol,InpSignalTimeframe,0,3,bars)!=3) return false;
   closed_bar=bars[1];
   bool trend_up=fast[1]>slow[1];
   bool trend_dn=fast[1]<slow[1];
   bool htf_up=true;
   if(InpUseHigherTimeframeFilter)
     {
      double hf[2],hs[2]; ArraySetAsSeries(hf,true); ArraySetAsSeries(hs,true);
      if(CopyBuffer(g_htf_fast_handle,0,0,2,hf)!=2 || CopyBuffer(g_htf_slow_handle,0,0,2,hs)!=2) return false;
      htf_up=hf[1]>hs[1];
     }
   // Equivalent to ta.crossover/ta.crossunder on closed candles.
   buy_signal=trend_up && htf_up && rsi[2]<=InpRSIOversold && rsi[1]>InpRSIOversold;
   sell_signal=trend_dn && !htf_up && rsi[2]>=InpRSIOverbought && rsi[1]<InpRSIOverbought;
   return true;
  }

double NormalizeVolume(double volume)
  {
   double minv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN), maxv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX), step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   volume=MathMin(volume,MathMin(maxv,InpMaxLot));
   volume=MathMax(volume,minv);
   if(step>0.0) volume=MathFloor(volume/step)*step;
   int digits=(int)MathMax(0,MathRound(-MathLog10(step)));
   return NormalizeDouble(volume,digits);
  }

double InitialLot()
  {
   if(InpLotMode==LOT_FIXED) return NormalizeVolume(InpBaseLot);
   if(InpStopLossPips<=0.0) return NormalizeVolume(InpBaseLot);
   double tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE), tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   double loss_per_lot=(InpStopLossPips*PipSize()/tick_size)*tick_value;
   if(loss_per_lot<=0.0) return NormalizeVolume(InpBaseLot);
   return NormalizeVolume((AccountInfoDouble(ACCOUNT_BALANCE)*InpRiskPercentPerBasket/100.0)/loss_per_lot);
  }

bool OpenPosition(const ENUM_ORDER_TYPE order_type,const int level)
  {
   double lot=InitialLot()*MathPow(MathMax(1.0,InpLotMultiplier),level);
   lot=NormalizeVolume(lot);
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   double price=(order_type==ORDER_TYPE_BUY ? tick.ask : tick.bid);
   double sl=0.0,tp=0.0;
   if(InpUseIndividualStops && InpStopLossPips>0.0) sl=(order_type==ORDER_TYPE_BUY ? price-InpStopLossPips*PipSize() : price+InpStopLossPips*PipSize());
   if(InpTakeProfitPips>0.0) tp=(order_type==ORDER_TYPE_BUY ? price+InpTakeProfitPips*PipSize() : price-InpTakeProfitPips*PipSize());
   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS); sl=NormalizeDouble(sl,digits); tp=NormalizeDouble(tp,digits);
   trade.SetExpertMagicNumber(InpMagicNumber); trade.SetDeviationInPoints(InpDeviationPoints);
   bool ok=(order_type==ORDER_TYPE_BUY ? trade.Buy(lot,_Symbol,0.0,sl,tp,InpTradeComment) : trade.Sell(lot,_Symbol,0.0,sl,tp,InpTradeComment));
   if(!ok) PrintFormat("Open level %d failed: %s",level,trade.ResultRetcodeDescription());
   else g_last_trade_time=TimeCurrent();
   return ok;
  }

bool GridLevelReached(const int direction,const int level)
  {
   if(level<=0 || level>=InpMaxGridLevels) return false;
   double extreme=(direction==POSITION_TYPE_BUY ? DBL_MAX : -DBL_MAX); int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket=PositionGetTicket(i); if(ticket==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || (ulong)PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
      if(PositionGetInteger(POSITION_TYPE)!=direction) continue;
      double open=PositionGetDouble(POSITION_PRICE_OPEN); count++;
      if(direction==POSITION_TYPE_BUY) extreme=MathMin(extreme,open); else extreme=MathMax(extreme,open);
     }
   if(count!=level) return false;
   MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return false;
   double distance=GridDistancePrice()*level;
   return direction==POSITION_TYPE_BUY ? tick.bid<=extreme-distance : tick.ask>=extreme+distance;
  }

void ManageGrid()
  {
   if(InpGridMode==GRID_SIGNAL_ONLY || GridDistancePrice()<=0.0) return;
   if(!IsSpreadAcceptable() || DailyLossBreached() || !IsTradingWindow()) return;
   if((TimeCurrent()-g_last_trade_time)<InpCooldownSeconds) return;
   if(CountPositions(POSITION_TYPE_BUY)>0 && GridLevelReached(POSITION_TYPE_BUY,CountPositions(POSITION_TYPE_BUY))) OpenPosition(ORDER_TYPE_BUY,CountPositions(POSITION_TYPE_BUY));
   if(CountPositions(POSITION_TYPE_SELL)>0 && GridLevelReached(POSITION_TYPE_SELL,CountPositions(POSITION_TYPE_SELL))) OpenPosition(ORDER_TYPE_SELL,CountPositions(POSITION_TYPE_SELL));
  }

void ManageBasket()
  {
   double profit=BasketProfit();
   if((InpBasketProfitMoney>0.0 && profit>=InpBasketProfitMoney) || (InpBasketLossMoney>0.0 && profit<=-InpBasketLossMoney)) CloseBasket();
  }

int OnInit()
  {
   if(InpFastEMALength<1 || InpSlowEMALength<1 || InpFastEMALength>=InpSlowEMALength || InpGridDistancePips<0.0 || InpMaxGridLevels<1 || InpLotMultiplier<1.0) return INIT_PARAMETERS_INCORRECT;
   if(InpRequireHedgingAccount && !IsHedgingAccount()) { Print("This EA requires a hedging account for independent grid positions."); return INIT_FAILED; }
   g_fast_handle=iMA(_Symbol,InpSignalTimeframe,InpFastEMALength,0,MODE_EMA,PRICE_CLOSE);
   g_slow_handle=iMA(_Symbol,InpSignalTimeframe,InpSlowEMALength,0,MODE_EMA,PRICE_CLOSE);
   g_rsi_handle=iRSI(_Symbol,InpSignalTimeframe,InpRSILength,PRICE_CLOSE);
   if(InpUseHigherTimeframeFilter) { g_htf_fast_handle=iMA(_Symbol,InpHigherTimeframe,InpFastEMALength,0,MODE_EMA,PRICE_CLOSE); g_htf_slow_handle=iMA(_Symbol,InpHigherTimeframe,InpSlowEMALength,0,MODE_EMA,PRICE_CLOSE); }
   if(g_fast_handle==INVALID_HANDLE || g_slow_handle==INVALID_HANDLE || g_rsi_handle==INVALID_HANDLE || (InpUseHigherTimeframeFilter && (g_htf_fast_handle==INVALID_HANDLE || g_htf_slow_handle==INVALID_HANDLE))) return INIT_FAILED;
   ResetDailyReferenceIfNeeded();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   if(g_fast_handle!=INVALID_HANDLE) IndicatorRelease(g_fast_handle);
   if(g_slow_handle!=INVALID_HANDLE) IndicatorRelease(g_slow_handle);
   if(g_rsi_handle!=INVALID_HANDLE) IndicatorRelease(g_rsi_handle);
   if(g_htf_fast_handle!=INVALID_HANDLE) IndicatorRelease(g_htf_fast_handle);
   if(g_htf_slow_handle!=INVALID_HANDLE) IndicatorRelease(g_htf_slow_handle);
  }

void OnTick()
  {
   ResetDailyReferenceIfNeeded();
   ManageBasket();
   if(DailyLossBreached()) { if(CountPositions()>0) CloseBasket(); return; }
   bool buy=false,sell=false; datetime signal_bar=0;
   if(!ReadSignal(buy,sell,signal_bar)) { ManageGrid(); return; }
   if(signal_bar==g_last_signal_bar) { ManageGrid(); return; }
   g_last_signal_bar=signal_bar;
   if(!IsTradingWindow() || !IsSpreadAcceptable() || (TimeCurrent()-g_last_trade_time)<InpCooldownSeconds) { ManageGrid(); return; }
   if(buy)
     {
      if(InpCloseOnOppositeSignal && CountPositions(POSITION_TYPE_SELL)>0) CloseBasket();
      if(CountPositions()==0) OpenPosition(ORDER_TYPE_BUY,0);
     }
   else if(sell)
     {
      if(InpCloseOnOppositeSignal && CountPositions(POSITION_TYPE_BUY)>0) CloseBasket();
      if(CountPositions()==0) OpenPosition(ORDER_TYPE_SELL,0);
     }
   ManageGrid();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result)
  {
   if(trans.type==TRADE_TRANSACTION_DEAL_ADD) ResetDailyReferenceIfNeeded();
  }
