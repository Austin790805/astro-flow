# MT5 Hybrid Scalping Grid EA

`MT5_HybridScalpingGrid.mq5` is a native MQL5 Expert Advisor that reproduces the signal rules from the supplied TradingView indicator and executes them as a controlled hybrid basket strategy.

> **Important:** A grid strategy can create rapidly increasing exposure during a persistent trend. This implementation includes basket profit/loss limits, a daily equity-loss lockout, spread and session filters, a maximum level count, and an optional per-position stop. It must be back-tested and forward-tested on a demo account before any live use.

## Signal mapping

The EA evaluates closed candles on `InpSignalTimeframe`:

| Component | Rule |
|---|---|
| Trend | Fast EMA above slow EMA for buys; below for sells |
| Momentum | RSI crosses upward through oversold for buys; crosses downward through overbought for sells |
| Higher-timeframe filter | Optional fast/slow EMA direction on `InpHigherTimeframe` |
| New basket | A buy or sell signal opens one initial position when no managed basket exists |
| Grid | Optional additions are placed only after adverse movement by `InpGridDistancePips` times the current level |
| Basket exit | All managed positions close at `InpBasketProfitMoney` or `InpBasketLossMoney` |

The crossing test is deliberately performed on bars 2 and 1, so the EA does not trade from an unfinished candle. The first position uses `InpBaseLot` or the configured risk-percent sizing. Subsequent levels use `InpLotMultiplier`, capped by `InpMaxLot` and the broker's volume limits.

## Main inputs

| Input | Purpose |
|---|---|
| `InpGridMode` | `GRID_SIGNAL_ONLY` disables additions; `GRID_ADVERSE_ONLY` is the default controlled mode; `GRID_BOTH_DIRECTIONS` is reserved for future expansion and currently follows the same adverse-only behavior |
| `InpGridDistancePips` | Distance between grid levels, using the usual 5-digit/3-digit pip conversion |
| `InpMaxGridLevels` | Maximum number of positions in one direction, including the initial position |
| `InpBasketProfitMoney` / `InpBasketLossMoney` | Basket-level account-currency exits |
| `InpDailyLossLimitMoney` | Equity loss from the start-of-day reference at which the EA closes its basket and stops opening trades for that day |
| `InpMaxSpreadPips` | Spread gate applied before new entries and grid additions |
| `InpCooldownSeconds` | Minimum time between EA trade operations |
| `InpRequireHedgingAccount` | Prevents initialization on netting accounts by default, because independent grid legs require hedging mode |

## Installation

Copy the `.mq5` file into the terminal's `MQL5/Experts` directory, open it in MetaEditor, compile it, and attach the resulting EA to the symbol chart. The chart timeframe does not control the signal timeframe; use `InpSignalTimeframe` instead. Keep the symbol in the EA aligned with the broker symbol to which it is attached, including suffixes such as `.m` or `-pro`.

Before running, verify the broker's minimum volume, volume step, stop-distance requirements, contract size, and spread behavior. Start with `InpGridMode=GRID_SIGNAL_ONLY` to validate the signal and basket mechanics, then enable a small grid only after reviewing Strategy Tester results.

## Testing checklist

Use real-tick data where available and test multiple spread conditions. Confirm that the strategy behaves as expected around session boundaries, symbol rollovers, trading halts, insufficient margin, and disconnections. Test both long and short baskets, opposite signals, basket exits, daily lockout, and restart behavior. A grid is not a substitute for a stop-loss policy; the default values are examples, not recommendations.

## Known design boundary

The supplied indicator's `GRID_BOTH_DIRECTIONS` concept is not independently represented in its alert logic: alerts carry only a direction, and the indicator does not define hedged counter-trend entries. Therefore, this EA treats both grid modes as directional additions and never opens an opposite-direction grid without an opposite signal. This avoids hidden hedging behavior that is not specified by the source indicator.
