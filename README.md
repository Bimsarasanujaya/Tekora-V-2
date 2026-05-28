# Tekora V10 AI Execution Terminal

Runnable Flask crypto signal platform using public MEXC candle data.

## Run
```bash
cd tekora_v10_ai_execution_terminal
pip install -r requirements.txt
python app.py
```
Open: http://127.0.0.1:5000

## Included
- Tekora branding
- Homepage/login/signup/dashboard
- Dark/light theme engine
- Mobile sidebar open/close fix
- Auto Best Setup: returns one best setup and auto-tracks it
- Manual signal generation
- Journal + CSV export
- Live trade tracking with pending-entry protection
- Premium/discount engine
- Inducement detection
- Cleaner liquidity sweeps
- Trapped trader/manipulation logic
- Anti-chop filter
- Dynamic confidence scoring
- Orderflow proxy: absorption, exhaustion, momentum acceleration, aggressive pressure, imbalance velocity
- Market pulse, volatility meter, pressure cards
- Setup invalidation + early close warnings

Disclaimer: rule-based public-market data tool, not financial advice. Always use risk limits.


V11 updates:
- Real visible MEXC orderbook/depth pressure added to the engine.
- Signal confidence now includes orderbook imbalance, big bid/ask wall strength, nearest wall, spread and trap/wall risk.
- Signal UI now displays Real Orderbook Pressure + nearest big order wall.
- Full-screen glowing analysis animation when generating/scanning signals.
- Light mode field/text color fixes.
- Forgot password local reset page.
- Confirm password validation during signup.
- Demo Google login route added for local testing; production OAuth credentials must be configured separately.
- Mobile hamburger/sidebar open-close behavior patched.

## V12/V14 Upgrade Notes
- Auto Best Setup now targets a top-100 MEXC universe and returns the best available setup instead of showing an empty result.
- Added visible orderbook heatmap payload, nearest wall, spread/trap risk, liquidity score, and execution quality.
- Added stronger execution labels: EXECUTE NOW, LIMIT ENTRY, WAIT FOR RETEST, RECOVERY SETUP, HIGH RISK.
- Added signal explanation panel and improved journal analytics: average RR, streak, best pair, best timeframe.
- Important: no system can guarantee 70-80% accuracy. Tekora ranks setups and labels weak market conditions honestly.

## V15 REAL PRICE FIX
- Uses live MEXC spot candles only for signal prices.
- Synthetic fallback is disabled by default to prevent wrong levels like LTC entry 632 when live price is near the chart price.
- Entry, SL and TP are regenerated from the verified current live price with a hard sanity guard.
- If live MEXC data is unavailable, Tekora blocks the trade with `BLOCKED_NO_LIVE_DATA` instead of showing fake trade levels.
- Optional developer-only synthetic mode: set `TEKORA_ALLOW_SYNTHETIC=1` before running, but do not use that for real trading.

Run:
```bash
pip install -r requirements.txt
python app.py
```
Then open the local URL shown in the terminal.

## Tekora V16 Retest Entry Patch

This build upgrades the V15 real-price engine with a no-chase execution filter:

- Strong but extended signals are changed from `EXECUTE NOW` to `WAIT FOR RETEST`.
- `WAIT FOR RETEST` now shows a single actionable `Retest Entry` price.
- SL, TP1, TP2, and TP3 remain visible and anchored to live MEXC price data.
- The top-100 scan ranks verified retest/limit setups above blind market chasing.
- No guaranteed win rate is claimed. Always verify the chart and use risk management.

## V17 Final Patch
- WAIT FOR RETEST now displays a true retest zone plus midpoint entry.
- TP1/TP2/TP3 are rebuilt using recent structure, liquidity/wall hints, and RR sanity.
- Confidence scoring is more realistic: no clean sweep, high trap risk, wrong premium/discount, missing absorption, or MTF conflict reduce/cap the score.
- Ranking prefers realistic retest setups over overconfident chase entries.

## V18 Upgrade — Forex Screenshot AI Engine

New page: `/forex-ai`

What changed:
- Added a separate Forex Screenshot Analysis engine for users without paid forex API keys.
- Upload a TradingView screenshot and select Style, Session, ICT/SMC/MSNR concepts, indicators, and RR preference.
- Removed account-balance/risk-budget style controls from the forex workflow.
- Added mobile-first upload UI, fade/scroll animations, advanced loading phases, and copyable setup output.
- Engine always returns the best available setup, but labels weak conditions as HIGH RISK / WAIT CONFIRMATION.

Important truth:
- No local screenshot engine can guarantee 80%+ accuracy. Tekora now provides confluence scoring and honest risk labels instead of fake guaranteed win rates.
- For best levels, type the visible current chart price into the Forex AI form.

Run:
```bash
pip install -r requirements.txt
python app.py
```
Then open: `http://127.0.0.1:5000`


## Tekora V19 real MEXC depth upgrade

V19 adds a real visible MEXC orderbook/depth layer for crypto signals. The engine now tries MEXC Spot depth first, then MEXC Contract depth as a fallback. If live depth is unavailable, Tekora clearly marks it unavailable and caps confidence instead of showing a fake heatmap.

Run:
1. `pip install -r requirements.txt`
2. `python app.py`
3. Open the localhost link shown in the terminal.

Important: V19 is a signal/tracking assistant. It does not place live orders automatically and it does not guarantee profit or 80%+ accuracy. Always verify the setup on your exchange/chart and risk small.


## V20 Crypto Challenge Hardened Engine
This version adds stronger crypto filters for small-account challenge testing:
- live MEXC price sanity stays active
- real visible MEXC depth is used when available
- depth unavailable = confidence capped, never fake sniper grade
- volatility/compression/displacement filter
- RR and TP/SL sanity filter
- trade permission labels: READY IF ENTRY TRIGGERS, WAIT FOR RETEST ONLY, HIGH RISK, NO TRADE
- $5 challenge risk reference at 1% max loss (0.05 USDT)

Important: This does not place orders automatically and does not guarantee profit or 80%+ win rate. It is built to force patience and protect small capital.
