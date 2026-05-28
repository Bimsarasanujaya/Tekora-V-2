from __future__ import annotations
import json, math, os, statistics, time
from pathlib import Path
from typing import Any, Dict, List, Tuple
import requests

BASE = Path(__file__).parent
DATA = BASE / 'data'; DATA.mkdir(exist_ok=True)
MEMORY_AI_FILE = DATA / 'tekora_ai_memory.json'

MEXC_DEPTH_URL = 'https://api.mexc.com/api/v3/depth'
MEXC_TICKER_24H = 'https://api.mexc.com/api/v3/ticker/24hr'


def _f(x, default=0.0):
    try: return float(x)
    except Exception: return default

def _load(path: Path, default):
    if not path.exists():
        try: path.write_text(json.dumps(default, indent=2))
        except Exception: pass
    try: return json.loads(path.read_text())
    except Exception: return default

def _save(path: Path, data):
    try: path.write_text(json.dumps(data, indent=2))
    except Exception: pass

def _returns(candles):
    out=[]
    for a,b in zip(candles[:-1], candles[1:]):
        if getattr(a,'close',0): out.append((b.close-a.close)/a.close)
    return out

def _pearson(a,b):
    n=min(len(a),len(b))
    if n<12: return 0.0
    a=a[-n:]; b=b[-n:]
    ma=statistics.mean(a); mb=statistics.mean(b)
    da=[x-ma for x in a]; db=[x-mb for x in b]
    den=math.sqrt(sum(x*x for x in da)*sum(y*y for y in db))
    return round(sum(x*y for x,y in zip(da,db))/den,3) if den else 0.0

def _depth(symbol: str, limit: int=100) -> Dict[str,Any]:
    try:
        r=requests.get(MEXC_DEPTH_URL, params={'symbol':symbol,'limit':limit}, timeout=1.8)
        r.raise_for_status(); d=r.json()
        bids=[(_f(p),_f(q)) for p,q in d.get('bids',[])[:limit]]
        asks=[(_f(p),_f(q)) for p,q in d.get('asks',[])[:limit]]
        bid_notional=sum(p*q for p,q in bids); ask_notional=sum(p*q for p,q in asks)
        total=max(bid_notional+ask_notional, 1e-9)
        imbalance=(bid_notional-ask_notional)/total
        top_bid=bids[0][0] if bids else 0; top_ask=asks[0][0] if asks else 0
        mid=(top_bid+top_ask)/2 if top_bid and top_ask else 0
        # wall detection in first 100 levels
        all_levels=[('BID',p,q,p*q) for p,q in bids]+[('ASK',p,q,p*q) for p,q in asks]
        avg=statistics.mean([x[3] for x in all_levels]) if all_levels else 0
        wall=max(all_levels, key=lambda x:x[3], default=('—',0,0,0))
        return {'ok':True,'bid_notional':round(bid_notional,2),'ask_notional':round(ask_notional,2),'imbalance':round(imbalance,3),'bias':'BID SUPPORT' if imbalance>0.08 else 'ASK PRESSURE' if imbalance<-0.08 else 'BALANCED','mid':mid,'wall_side':wall[0],'wall_price':wall[1],'wall_strength':round(wall[3]/max(avg,1e-9),2),'spread_pct':round(((top_ask-top_bid)/mid)*100,4) if mid else 0}
    except Exception as e:
        return {'ok':False,'error':str(e),'bias':'DEPTH FALLBACK','imbalance':0,'wall_side':'—','wall_price':'—','wall_strength':'—','spread_pct':'—'}

def _cvd(candles) -> Dict[str,Any]:
    recent=candles[-80:] if len(candles)>=80 else candles
    cvd=0.0; series=[]; bull=0.0; bear=0.0
    for x in recent:
        rng=max(x.high-x.low, 1e-9)
        body=(x.close-x.open)/rng
        signed=x.volume*max(-1,min(1,body))
        cvd += signed; series.append(cvd)
        if signed>=0: bull += signed
        else: bear += abs(signed)
    slope=series[-1]-series[max(0,len(series)-12)] if len(series)>12 else cvd
    div='NO CLEAR DIVERGENCE'
    if len(recent)>20:
        price_up=recent[-1].close>recent[-20].close
        cvd_up=series[-1]>series[-20]
        if price_up and not cvd_up: div='BEARISH CVD DIVERGENCE'
        elif (not price_up) and cvd_up: div='BULLISH CVD DIVERGENCE'
    total=max(bull+bear,1e-9)
    return {'cvd_value':round(cvd,3),'cvd_slope_12':round(slope,3),'cvd_bias':'BUY PRESSURE' if slope>0 else 'SELL PRESSURE' if slope<0 else 'FLAT','cvd_divergence':div,'buy_share':round(bull/total*100,1),'sell_share':round(bear/total*100,1)}

def _footprint(candles, buckets:int=10) -> Dict[str,Any]:
    recent=candles[-36:] if len(candles)>=36 else candles
    if not recent: return {'rows':[],'summary':'No footprint data'}
    lo=min(x.low for x in recent); hi=max(x.high for x in recent); step=(hi-lo)/buckets if hi>lo else 1
    rows=[]
    for i in range(buckets):
        a=lo+i*step; b=a+step
        buy=sell=0.0
        for x in recent:
            typical=(x.high+x.low+x.close)/3
            if a<=typical<=b or (i==buckets-1 and typical<=b):
                rng=max(x.high-x.low,1e-9); signed=x.volume*((x.close-x.open)/rng)
                if signed>=0: buy+=signed
                else: sell+=abs(signed)
        delta=buy-sell
        rows.append({'zone':f'{a:.6g}-{b:.6g}','buy':round(buy,2),'sell':round(sell,2),'delta':round(delta,2),'side':'BUY' if delta>0 else 'SELL' if delta<0 else 'NEUTRAL'})
    strongest=max(rows,key=lambda r:abs(r['delta']), default={})
    return {'rows':rows[::-1], 'summary':f"Strongest footprint delta: {strongest.get('side','—')} at {strongest.get('zone','—')}"}

def _sentiment(get_klines) -> Dict[str,Any]:
    pairs=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']
    changes=[]
    for p in pairs:
        try:
            c=get_klines(p,'15m',60)
            if len(c)>20:
                changes.append((c[-1].close-c[-20].close)/c[-20].close*100)
        except Exception: pass
    avg=statistics.mean(changes) if changes else 0
    label='RISK ON' if avg>0.35 else 'RISK OFF' if avg<-0.35 else 'MIXED / NEUTRAL'
    return {'label':label,'market_avg_change_20x15m':round(avg,3),'confidence':min(100,round(abs(avg)*18+45,1)) if changes else 35}

def _correlation(symbol: str, timeframe: str, candles, get_klines) -> Dict[str,Any]:
    out={'btc_corr':0,'eth_corr':0,'note':'Correlation unavailable'}
    try:
        base_ret=_returns(candles[-90:])
        if symbol!='BTCUSDT': out['btc_corr']=_pearson(base_ret,_returns(get_klines('BTCUSDT',timeframe,90)))
        if symbol!='ETHUSDT': out['eth_corr']=_pearson(base_ret,_returns(get_klines('ETHUSDT',timeframe,90)))
        high=max(abs(out.get('btc_corr',0)),abs(out.get('eth_corr',0)))
        out['note']='HIGH MARKET BETA - respect BTC/ETH direction' if high>0.68 else 'LOW/MODERATE CORRELATION - pair can move independently'
        return out
    except Exception as e:
        out['note']='Correlation fallback: '+str(e)[:60]
        return out

def _memory_score(signal: Dict[str,Any]) -> Dict[str,Any]:
    mem=_load(MEMORY_AI_FILE, {'setups':{},'events':[]})
    key=f"{signal.get('symbol')}|{signal.get('timeframe')}|{signal.get('action')}|{signal.get('direction')}"
    rec=mem['setups'].get(key, {'seen':0,'virtual_wins':0,'virtual_losses':0,'score_bias':0})
    rec['seen']=int(rec.get('seen',0))+1
    # Early-stage online learning: store observations now; win/loss reinforcement can be updated from journal later.
    rec['last_seen']=int(time.time())
    mem['setups'][key]=rec
    mem['events'].insert(0, {'t':int(time.time()),'key':key,'score':signal.get('score'),'symbol':signal.get('symbol')})
    mem['events']=mem['events'][:300]
    _save(MEMORY_AI_FILE, mem)
    seen=rec['seen']; bias=float(rec.get('score_bias',0))
    conf=min(100, 40+seen*4+abs(bias)*8)
    return {'memory_key':key,'seen_count':seen,'adaptive_bias':round(bias,2),'memory_confidence':round(conf,1),'memory_note':'Learning memory active: Tekora is storing setup fingerprints for future weighting.'}

def _ml_score(signal, cvd, depth, corr, sent, memory) -> Dict[str,Any]:
    base=_f(signal.get('score'),50)
    features={
        'base_score':base,
        'trend':_f(signal.get('trend_continuation') or signal.get('trend_continuation_score'),50),
        'cvd_pressure': 8 if cvd.get('cvd_bias')=='BUY PRESSURE' else -8 if cvd.get('cvd_bias')=='SELL PRESSURE' else 0,
        'depth_imbalance': _f(depth.get('imbalance'))*30,
        'sentiment': 6 if sent.get('label')=='RISK ON' else -6 if sent.get('label')=='RISK OFF' else 0,
        'memory': _f(memory.get('adaptive_bias'))*5,
        'correlation_risk': -5 if max(abs(_f(corr.get('btc_corr'))),abs(_f(corr.get('eth_corr'))))>0.78 else 0
    }
    raw=base + features['cvd_pressure'] + features['depth_imbalance'] + features['sentiment'] + features['memory'] + features['correlation_risk']
    neural=max(1,min(99,round(raw,1)))
    label='A.I. HIGH QUALITY' if neural>=80 else 'A.I. ACCEPTABLE' if neural>=65 else 'A.I. DEFENSIVE' if neural>=50 else 'A.I. AVOID / WAIT'
    return {'neural_score':neural,'neural_label':label,'feature_weights':features,'model_type':'lightweight adaptive scoring model (no guaranteed prediction)'}



# =========================
# TEKORA V31 MONSTER ICT / ORDERFLOW CORE
# Honest note: these are exchange-candle/depth analytics and learning heuristics, not guaranteed prediction.
# =========================

def _atr(candles, n:int=14) -> float:
    if len(candles)<2: return 0.0
    trs=[]
    for i in range(1,len(candles)):
        c=candles[i]; prev=candles[i-1]
        trs.append(max(c.high-c.low, abs(c.high-prev.close), abs(c.low-prev.close)))
    return statistics.mean(trs[-n:]) if trs else 0.0

def _swing_points(candles, left:int=2, right:int=2):
    highs=[]; lows=[]
    for i in range(left, len(candles)-right):
        h=candles[i].high; l=candles[i].low
        if all(h>=candles[j].high for j in range(i-left,i+right+1) if j!=i): highs.append((i,h))
        if all(l<=candles[j].low for j in range(i-left,i+right+1) if j!=i): lows.append((i,l))
    return highs, lows

def _ict_core(candles, signal: Dict[str,Any], timeframe: str) -> Dict[str,Any]:
    recent=candles[-120:] if len(candles)>120 else candles
    if len(recent)<30:
        return {'mss':'INSUFFICIENT DATA','cisd':'WAIT','fvg_rank':'—','ob_quality':0,'sweep_validation':'—','pd_array':'—','po3':'—','judas':'—','ote':'—','killzone':'—','draw_on_liquidity':'—','ict_score':35}
    atr=max(_atr(recent), 1e-9)
    highs,lows=_swing_points(recent,2,2)
    close=recent[-1].close; prev=recent[-2].close
    direction=str(signal.get('direction') or '').upper()
    action=str(signal.get('action') or '').upper()
    last_high=highs[-1][1] if highs else max(x.high for x in recent[-20:])
    last_low=lows[-1][1] if lows else min(x.low for x in recent[-20:])
    # MSS / CISD
    mss='BULLISH MSS' if close>last_high and prev<=last_high else 'BEARISH MSS' if close<last_low and prev>=last_low else 'STRUCTURE HOLDING'
    bodies=[abs(x.close-x.open) for x in recent[-12:]]
    avg_body=statistics.mean(bodies[:-1]) if len(bodies)>3 else atr*0.25
    impulse=abs(recent[-1].close-recent[-1].open)
    cisd='BULLISH CISD' if recent[-1].close>recent[-1].open and impulse>avg_body*1.35 else 'BEARISH CISD' if recent[-1].close<recent[-1].open and impulse>avg_body*1.35 else 'NO CISD YET'
    # FVG detection: candle i-2 high < i low bullish, i-2 low > i high bearish
    fvg=[]
    for i in range(2,len(recent)):
        a=recent[i-2]; c=recent[i]
        if a.high<c.low:
            size=c.low-a.high; fvg.append({'type':'BULLISH FVG','lo':a.high,'hi':c.low,'size_atr':size/atr})
        if a.low>c.high:
            size=a.low-c.high; fvg.append({'type':'BEARISH FVG','lo':c.high,'hi':a.low,'size_atr':size/atr})
    best_fvg=max(fvg[-20:], key=lambda x:x['size_atr'], default=None)
    fvg_rank='NONE'
    if best_fvg:
        fvg_rank=f"{best_fvg['type']} • {best_fvg['size_atr']:.2f} ATR gap"
    # Order block proxy quality: last opposite candle before displacement
    disp=abs(close-recent[-10].close)/atr if len(recent)>10 else 0
    ob_quality=max(0,min(100, round(45 + disp*12 + (10 if 'CISD' in cisd else 0),1)))
    # Sweep validation
    prev_high=max(x.high for x in recent[-25:-1]); prev_low=min(x.low for x in recent[-25:-1])
    sweep='BUY-SIDE SWEEP VALIDATED' if recent[-1].high>prev_high and close<prev_high else 'SELL-SIDE SWEEP VALIDATED' if recent[-1].low<prev_low and close>prev_low else 'NO FRESH SWEEP'
    # Premium/discount arrays
    range_hi=max(x.high for x in recent[-60:]); range_lo=min(x.low for x in recent[-60:]); eq=(range_hi+range_lo)/2
    pd='PREMIUM' if close>eq else 'DISCOUNT' if close<eq else 'EQUILIBRIUM'
    # PO3 / Judas proxies
    first_third=recent[-48:-32] if len(recent)>=48 else recent[:max(1,len(recent)//3)]
    mid_third=recent[-32:-16] if len(recent)>=48 else recent[max(1,len(recent)//3):max(2,2*len(recent)//3)]
    last_third=recent[-16:]
    po3='ACCUMULATION → MANIPULATION → DISTRIBUTION' if first_third and mid_third and last_third and (max(x.high for x in mid_third)>max(x.high for x in first_third) or min(x.low for x in mid_third)<min(x.low for x in first_third)) and abs(last_third[-1].close-mid_third[-1].close)>atr else 'PO3 NOT CLEAN'
    judas='JUDAS SWING POSSIBLE' if sweep!='NO FRESH SWEEP' and abs(recent[-1].close-recent[-1].open)>avg_body else 'NO JUDAS CONFIRMATION'
    # OTE: current price retracement from latest swing impulse
    ote='WAITING OTE'
    if highs and lows:
        hi=last_high; lo=last_low
        if hi>lo:
            retr=(close-lo)/(hi-lo)
            ote='OTE ZONE' if 0.62<=retr<=0.79 else f'Outside OTE ({retr:.2f})'
    # Killzone from UTC hour, approximate sessions
    hr=time.gmtime().tm_hour
    killzone='LONDON/NY ACTIVE' if hr in list(range(7,17)) else 'ASIA / LOW VOL WATCH' if hr in list(range(0,6)) else 'POST-NY / CAUTION'
    dol='BUY-SIDE LIQUIDITY' if direction=='LONG' else 'SELL-SIDE LIQUIDITY' if direction=='SHORT' else ('UPPER LIQUIDITY' if close<eq else 'LOWER LIQUIDITY')
    score=50
    score += 12 if ('BEARISH' in mss and direction=='SHORT') or ('BULLISH' in mss and direction=='LONG') else 0
    score += 8 if 'CISD' in cisd else 0
    score += 10 if best_fvg else -4
    score += 8 if 'VALIDATED' in sweep else 0
    score += 7 if ('PREMIUM'==pd and direction=='SHORT') or ('DISCOUNT'==pd and direction=='LONG') else 0
    score += 6 if 'ACTIVE' in killzone else 0
    return {'mss':mss,'cisd':cisd,'fvg_rank':fvg_rank,'order_block_quality':ob_quality,'liquidity_sweep_validation':sweep,'premium_discount_array':pd,'po3_model':po3,'judas_swing':judas,'ote_retracement':ote,'session_killzone':killzone,'draw_on_liquidity':dol,'ict_score':max(1,min(99,round(score,1)))}

def _orderflow_advanced(candles, depth: Dict[str,Any], cvd: Dict[str,Any], signal: Dict[str,Any]) -> Dict[str,Any]:
    recent=candles[-50:] if len(candles)>50 else candles
    atr=max(_atr(recent),1e-9)
    vol_avg=statistics.mean([x.volume for x in recent[-25:]]) if len(recent)>5 else 0
    last=recent[-1] if recent else None
    if not last: return {}
    rng=max(last.high-last.low,1e-9); body=abs(last.close-last.open)
    aggressive_delta=round((last.volume*((last.close-last.open)/rng)),3)
    absorption='SELL ABSORPTION' if last.low<min(x.low for x in recent[-12:-1]) and last.close>last.open and last.volume>vol_avg*1.15 else 'BUY ABSORPTION' if last.high>max(x.high for x in recent[-12:-1]) and last.close<last.open and last.volume>vol_avg*1.15 else 'NO CLEAR ABSORPTION'
    exhaustion='EXHAUSTION CANDLE' if rng>atr*1.4 and body/rng<0.35 and last.volume>vol_avg*1.2 else 'NO EXHAUSTION'
    imb=_f(depth.get('imbalance'))
    stacked='STACKED BID IMBALANCE' if imb>0.18 else 'STACKED ASK IMBALANCE' if imb<-0.18 else 'NO STACKED IMBALANCE'
    liquidity_stack='BID WALL STACKING' if str(depth.get('wall_side'))=='BID' and _f(depth.get('wall_strength'))>3 else 'ASK WALL STACKING' if str(depth.get('wall_side'))=='ASK' and _f(depth.get('wall_strength'))>3 else 'NO MAJOR WALL STACK'
    delta_div=cvd.get('cvd_divergence','NO CLEAR DIVERGENCE')
    iceberg='HIGH ICEBERG PROBABILITY' if 'ABSORPTION' in absorption and _f(depth.get('spread_pct'),99)<0.05 and _f(depth.get('wall_strength'))>2.5 else 'LOW/MEDIUM ICEBERG PROBABILITY'
    quality=50 + abs(imb)*65 + (10 if 'ABSORPTION' in absorption else 0) + (8 if 'STACKED' in stacked else 0) - (10 if exhaustion=='EXHAUSTION CANDLE' else 0)
    return {'bid_ask_imbalance':round(imb,3),'aggressive_delta':aggressive_delta,'absorption_detection':absorption,'exhaustion_candles':exhaustion,'stacked_imbalance_zones':stacked,'liquidity_pull_stack':liquidity_stack,'delta_divergence':delta_div,'iceberg_probability':iceberg,'orderflow_score':max(1,min(99,round(quality,1)))}

def _cvd_advanced(candles, cvd: Dict[str,Any]) -> Dict[str,Any]:
    recent=candles[-120:] if len(candles)>120 else candles
    session=recent[-32:] if len(recent)>32 else recent
    sess_cvd=0.0; bull=bear=0.0
    for x in session:
        rng=max(x.high-x.low,1e-9); signed=x.volume*((x.close-x.open)/rng)
        sess_cvd += signed
        if signed>=0: bull+=signed
        else: bear+=abs(signed)
    total=max(bull+bear,1e-9)
    trend='DELTA RISING' if cvd.get('cvd_slope_12',0)>0 else 'DELTA FALLING' if cvd.get('cvd_slope_12',0)<0 else 'DELTA FLAT'
    return {'cumulative_volume_delta':cvd.get('cvd_value'), 'session_delta':round(sess_cvd,3), 'divergence_detector':cvd.get('cvd_divergence'), 'buyer_seller_aggression':f"B {round(bull/total*100,1)}% / S {round(bear/total*100,1)}%", 'delta_trend_memory':trend}

def _footprint_advanced(fp: Dict[str,Any]) -> Dict[str,Any]:
    rows=fp.get('rows') or []
    clusters=[r for r in rows if abs(_f(r.get('delta')))>0]
    top=sorted(clusters, key=lambda r:abs(_f(r.get('delta'))), reverse=True)[:3]
    trapped='SELLERS TRAPPED' if top and top[0].get('side')=='BUY' else 'BUYERS TRAPPED' if top and top[0].get('side')=='SELL' else 'NO CLEAR TRAPPED CLUSTER'
    unfinished='UNFINISHED AUCTION POSSIBLE' if rows and abs(_f(rows[0].get('delta')))>abs(_f(rows[-1].get('delta')))*1.8 else 'AUCTION BALANCED'
    return {'candle_delta_maps':rows[:12], 'imbalance_clusters':top, 'trapped_trader_zones':trapped, 'absorption_footprints':'See absorption layer + footprint cluster overlap', 'unfinished_auction_detection':unfinished}

def _htf_bias(symbol: str, get_klines) -> Dict[str,Any]:
    frames=['4h','1h','15m','5m']; out={}; bull=bear=0
    for tf in frames:
        try:
            c=get_klines(symbol,tf,80)
            if len(c)>30:
                fast=statistics.mean([x.close for x in c[-9:]]); slow=statistics.mean([x.close for x in c[-26:]])
                slope=c[-1].close-c[-12].close
                bias='BULLISH' if fast>slow and slope>0 else 'BEARISH' if fast<slow and slope<0 else 'MIXED'
                if bias=='BULLISH': bull+=1
                if bias=='BEARISH': bear+=1
                out[tf]=bias
        except Exception: out[tf]='UNAVAILABLE'
    overall='BULLISH ALIGNMENT' if bull>=3 else 'BEARISH ALIGNMENT' if bear>=3 else 'MIXED HTF BIAS'
    continuation=max(bull,bear)/max(1,len(frames))*100
    return {'frames':out,'overall_bias':overall,'continuation_probability':round(continuation,1),'reversal_probability':round(100-continuation,1),'trend_exhaustion':'HIGH' if continuation<50 else 'LOW/MEDIUM'}

def _market_condition(candles, sent: Dict[str,Any], depth: Dict[str,Any]) -> Dict[str,Any]:
    recent=candles[-80:] if len(candles)>80 else candles
    atr=_atr(recent); close=recent[-1].close if recent else 0
    atr_pct=(atr/close*100) if close else 0
    if len(recent)>30:
        net=abs(recent[-1].close-recent[-30].close); chop_ratio=net/max(atr*30,1e-9)
    else: chop_ratio=0
    condition='EXPANSION' if atr_pct>1.2 and chop_ratio>0.13 else 'CHOP' if chop_ratio<0.045 else 'TREND' if chop_ratio>0.08 else 'ACCUMULATION'
    manipulation='POSSIBLE MANIPULATION' if abs(_f(depth.get('imbalance')))>0.22 and sent.get('label')=='MIXED / NEUTRAL' else 'NORMAL'
    lowliq='LOW LIQUIDITY WARNING' if _f(depth.get('spread_pct'),0)>0.08 else 'LIQUIDITY OK'
    news='NEWS VOLATILITY WATCH' if atr_pct>2.2 else 'NORMAL NEWS RISK'
    radar_score=50 + (15 if condition in ['TREND','EXPANSION'] else -12) + (8 if lowliq=='LIQUIDITY OK' else -10) + (6 if manipulation=='NORMAL' else -10)
    return {'condition':condition,'trend':condition=='TREND','chop':condition=='CHOP','expansion':condition=='EXPANSION','accumulation':condition=='ACCUMULATION','manipulation':manipulation,'low_liquidity':lowliq,'news_volatility':news,'radar_score':max(1,min(99,round(radar_score,1)))}

def _sniper_entry_ai(signal: Dict[str,Any], ict: Dict[str,Any], orderflow: Dict[str,Any], cvda: Dict[str,Any], htf: Dict[str,Any], market: Dict[str,Any]) -> Dict[str,Any]:
    direction=str(signal.get('direction') or '').upper(); action=str(signal.get('action') or '').upper()
    checks=[]; score=45
    ltf_mss = ('BEARISH' in ict.get('mss','') and direction=='SHORT') or ('BULLISH' in ict.get('mss','') and direction=='LONG')
    checks.append({'name':'LTF MSS','pass':ltf_mss}); score+=12 if ltf_mss else -4
    disp='CISD' in ict.get('cisd','')
    checks.append({'name':'Displacement/CISD','pass':disp}); score+=10 if disp else -3
    imb=abs(_f(orderflow.get('bid_ask_imbalance')))>0.08
    checks.append({'name':'Imbalance confirmation','pass':imb}); score+=8 if imb else 0
    delta_aligned=(direction=='LONG' and 'BUY' in cvda.get('delta_trend_memory','')) or (direction=='SHORT' and 'FALLING' in cvda.get('delta_trend_memory',''))
    checks.append({'name':'Delta alignment','pass':delta_aligned}); score+=8 if delta_aligned else -2
    sess='ACTIVE' in ict.get('session_killzone','')
    checks.append({'name':'Session timing','pass':sess}); score+=6 if sess else -1
    vol=market.get('condition') in ['TREND','EXPANSION']
    checks.append({'name':'Volume/condition','pass':vol}); score+=8 if vol else -5
    sniper='READY' if score>=75 and 'WAIT' not in action else 'WAIT FOR TRIGGER' if score>=55 else 'NO SNIPER ENTRY'
    return {'sniper_state':sniper,'sniper_score':max(1,min(99,round(score,1))),'checklist':checks,'entry_timing_note':'Wait for LTF MSS + displacement + delta/orderflow alignment before execution.'}

def _whale_detector(depth: Dict[str,Any], orderflow: Dict[str,Any], candles) -> Dict[str,Any]:
    last_vol=candles[-1].volume if candles else 0
    avg=statistics.mean([x.volume for x in candles[-30:]]) if len(candles)>30 else max(last_vol,1)
    sudden=last_vol/max(avg,1e-9)
    spoof='SPOOFING WATCH' if _f(depth.get('wall_strength'))>5 and abs(_f(depth.get('imbalance')))>0.18 else 'LOW SPOOFING SIGNATURE'
    vacuum='LIQUIDITY VACUUM' if _f(depth.get('spread_pct'),0)>0.06 or sudden>2.6 else 'NO LIQUIDITY VACUUM'
    aggressive='AGGRESSIVE SELLING' if _f(orderflow.get('aggressive_delta'))<0 else 'AGGRESSIVE BUYING' if _f(orderflow.get('aggressive_delta'))>0 else 'NEUTRAL'
    score=max(1,min(99,round(35+min(40,sudden*10)+min(24,_f(depth.get('wall_strength'),0)*4),1)))
    return {'sudden_depth_shifts':f"{sudden:.2f}x volume surge",'spoofing_probability':spoof,'aggressive_market_flow':aggressive,'liquidity_vacuum_moves':vacuum,'whale_score':score}

def _confidence_grade(signal, ict, orderflow, cvda, htf, sniper, whale, market, memory) -> Dict[str,Any]:
    parts={
        'liquidity': 80 if 'VALIDATED' in ict.get('liquidity_sweep_validation','') else 55,
        'displacement': 80 if 'CISD' in ict.get('cisd','') else 48,
        'htf_alignment': _f(htf.get('continuation_probability'),50),
        'delta': 72 if 'DIVERGENCE' in cvda.get('divergence_detector','') else 55,
        'volatility': _f(market.get('radar_score'),50),
        'orderflow': _f(orderflow.get('orderflow_score'),50),
        'session': 75 if 'ACTIVE' in ict.get('session_killzone','') else 48,
        'momentum': _f(signal.get('trend_continuation') or signal.get('trend_continuation_score'),50),
        'historical_success': _f(memory.get('memory_confidence'),45),
        'sniper': _f(sniper.get('sniper_score'),50),
        'whale': _f(whale.get('whale_score'),45)
    }
    weights={'liquidity':.11,'displacement':.12,'htf_alignment':.12,'delta':.09,'volatility':.09,'orderflow':.12,'session':.08,'momentum':.10,'historical_success':.07,'sniper':.08,'whale':.02}
    score=sum(parts[k]*weights[k] for k in parts)
    if market.get('condition')=='CHOP': score-=9
    grade='S+' if score>=88 else 'A+' if score>=78 else 'A' if score>=68 else 'B' if score>=56 else 'AVOID'
    return {'smart_confidence_score':round(max(1,min(99,score)),1),'signal_grade':grade,'weighted_components':parts,'confidence_note':'Real weighted confidence from ICT, orderflow, CVD, HTF, session, memory and sniper timing layers.'}

def _ai_thinking_steps(signal, ict, orderflow, cvda, sniper, confidence) -> List[Dict[str,Any]]:
    return [
        {'icon':'🧠','text':'Scanning liquidity and draw-on-liquidity','result':ict.get('draw_on_liquidity')},
        {'icon':'📊','text':'Checking orderflow imbalance','result':orderflow.get('stacked_imbalance_zones')},
        {'icon':'🌊','text':'Measuring CVD pressure','result':cvda.get('delta_trend_memory')},
        {'icon':'⚡','text':'Detecting displacement and CISD','result':ict.get('cisd')},
        {'icon':'🎯','text':'Ranking sniper execution quality','result':sniper.get('sniper_state')},
        {'icon':'✅','text':'Final confidence grade','result':f"{confidence.get('signal_grade')} • {confidence.get('smart_confidence_score')}/100"},
    ]

def enhance_signal(signal: Dict[str,Any], get_klines, mode: str='scalp') -> Dict[str,Any]:
    """Add Tekora Monster intelligence layers. Honest: CVD/footprint/orderflow are exchange-data proxies unless connected to institutional feeds."""
    try:
        symbol=str(signal.get('symbol') or 'BTCUSDT').upper()
        timeframe=str(signal.get('timeframe') or '15m')
        candles=get_klines(symbol,timeframe,180)
        cvd=_cvd(candles)
        fp=_footprint(candles)
        depth=_depth(symbol)
        corr=_correlation(symbol,timeframe,candles,get_klines)
        sent=_sentiment(get_klines)
        memory=_memory_score(signal)
        ml=_ml_score(signal,cvd,depth,corr,sent,memory)
        ict=_ict_core(candles, signal, timeframe)
        orderflow=_orderflow_advanced(candles, depth, cvd, signal)
        cvda=_cvd_advanced(candles, cvd)
        fpa=_footprint_advanced(fp)
        htf=_htf_bias(symbol, get_klines)
        market=_market_condition(candles, sent, depth)
        sniper=_sniper_entry_ai(signal, ict, orderflow, cvda, htf, market)
        whale=_whale_detector(depth, orderflow, candles)
        confidence=_confidence_grade(signal, ict, orderflow, cvda, htf, sniper, whale, market, memory)
        thinking=_ai_thinking_steps(signal, ict, orderflow, cvda, sniper, confidence)
        signal['ai_layers']={
            'real_ai_learning': memory,
            'machine_learning_model': ml,
            'institutional_orderflow_proxy': depth,
            'real_cvd_proxy': cvd,
            'footprint_profile': fp,
            'market_memory': memory,
            'adaptive_neural_weighting': ml.get('feature_weights'),
            'correlation_engine': corr,
            'sentiment_ai': sent,
            'ict_core': ict,
            'orderflow_layer': orderflow,
            'cvd_engine': cvda,
            'footprint_engine': fpa,
            'live_ai_thinking': thinking,
            'sniper_entry_ai': sniper,
            'whale_activity_detector': whale,
            'htf_bias_engine': htf,
            'smart_confidence_engine': confidence,
            'market_condition_radar': market,
            'truth_note':'Uses real live exchange candles/depth where available. Institutional orderflow, CVD and footprint are proxy analytics unless connected to paid institutional feeds.'
        }
        signal['smart_grade']=confidence.get('signal_grade')
        signal['smart_confidence']=confidence.get('smart_confidence_score')
        signal['market_condition']=market.get('condition')
        signal['sniper_state']=sniper.get('sniper_state')
        # Softly adjust score but keep original visible behaviour stable.
        old=_f(signal.get('score'),50); new=round(old*0.72 + _f(ml.get('neural_score'),old)*0.28,1)
        signal['score_original']=old; signal['ai_score']=ml.get('neural_score'); signal['score']=int(round(max(1,min(99,new))))
        signal['ai_verdict']=ml.get('neural_label')
        signal['orderflow_ai']=f"{depth.get('bias')} | CVD {cvd.get('cvd_bias')} | {corr.get('note')}"
        signal['sentiment_ai']=sent.get('label')
        signal['memory_note']=memory.get('memory_note')
        extra=[
            f"AI model verdict: {ml.get('neural_label')} ({ml.get('neural_score')}/100).",
            f"ICT core: {ict.get('mss')} | {ict.get('cisd')} | FVG {ict.get('fvg_rank')} | OB quality {ict.get('order_block_quality')}/100.",
            f"Liquidity model: {ict.get('liquidity_sweep_validation')} | {ict.get('premium_discount_array')} | DOL {ict.get('draw_on_liquidity')}.",
            f"Orderflow: {orderflow.get('stacked_imbalance_zones')} | {orderflow.get('absorption_detection')} | iceberg {orderflow.get('iceberg_probability')}.",
            f"CVD engine: {cvda.get('delta_trend_memory')} | session delta {cvda.get('session_delta')} | {cvda.get('buyer_seller_aggression')}.",
            f"HTF bias: {htf.get('overall_bias')} | continuation {htf.get('continuation_probability')}% | exhaustion {htf.get('trend_exhaustion')}.",
            f"Sniper AI: {sniper.get('sniper_state')} ({sniper.get('sniper_score')}/100).",
            f"Smart confidence: {confidence.get('signal_grade')} • {confidence.get('smart_confidence_score')}/100.",
            f"Market radar: {market.get('condition')} | {market.get('manipulation')} | {market.get('low_liquidity')} | {market.get('news_volatility')}.",
            f"CVD proxy: {cvd.get('cvd_bias')} | divergence: {cvd.get('cvd_divergence')} | buy/sell {cvd.get('buy_share')}%/{cvd.get('sell_share')}%.",
            f"Orderflow depth: {depth.get('bias')} | wall {depth.get('wall_side')} @ {depth.get('wall_price')} | imbalance {depth.get('imbalance')}.",
            f"Correlation: BTC {corr.get('btc_corr')} / ETH {corr.get('eth_corr')} — {corr.get('note')}.",
            f"Sentiment AI: {sent.get('label')} ({sent.get('confidence')}/100 confidence).",
            "Truth note: institutional/CVD/footprint are live exchange-data proxies until paid institutional feeds are connected."
        ]
        signal['reasons']=(signal.get('reasons') or signal.get('explanation_panel') or []) + extra
        signal['explanation_panel']=signal['reasons']
    except Exception as e:
        signal['ai_layers_error']=str(e)
        signal.setdefault('ai_verdict','AI FALLBACK')
    return signal


def ai_lab_snapshot(symbol: str, timeframe: str, get_klines) -> Dict[str,Any]:
    c=get_klines(symbol,timeframe,180)
    return {'symbol':symbol,'timeframe':timeframe,'cvd':_cvd(c),'footprint':_footprint(c),'depth':_depth(symbol),'correlation':_correlation(symbol,timeframe,c,get_klines),'sentiment':_sentiment(get_klines)}
