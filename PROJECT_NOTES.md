# Project Structure Notes

## Tab System
- Tabs are defined in `src/constants/bot-contents.ts`:
  - `DBOT_TABS`: DASHBOARD=0, BOT_BUILDER=1, D_CIRCLE=2, CHART=3, TUTORIAL=4
  - `TAB_IDS`: ['id-dbot-dashboard', 'id-bot-builder', 'id-d-circle', 'id-charts', 'id-tutorials']

## Main Layout (src/pages/main/main.tsx)
- Dashboard tab (index 0) has `<Dashboard handleTabChange={handleTabChange} />` as children
- Bot Builder tab (index 1) has NO children (renders elsewhere)
- D Circle tab (index 2) has NO children - the DCircle component is rendered as a sibling positioned absolutely
- Charts tab (index 3) has ChartWrapper children
- Tutorials tab (index 4) has Tutorial children

## D Circle Pattern (src/pages/d-circle/)
- `d-circle.tsx` - Renders DCircleAnalysis as a sibling, positioned absolutely:
  - `position: absolute; top: 6.6rem; z-index: -1;` when inactive
  - `z-index: 1` when `active_tab === 2`
  - `display: none` when inactive
- `d-circle.scss` - Simple positioning styles
- `index.ts` - Re-exports

## DCircleAnalysis Component (src/components/d-circle-analysis/)
- Uses `api_base.api.send({ ticks_history, subscribe: 1, end: 'latest', count, style: 'ticks' })`
- Subscribes to real-time ticks via `api_base.api.onMessage().subscribe()`
- Market options: R_10, R_25, R_50, R_75, R_100, 1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V
- Dark navy theme (#0d1b2a, #1a2d42)

## Contract Types (src/external/bot-skeleton/constants/config.ts)
- EVENODD: DIGITEVEN='Even', DIGITODD='Odd'
- OVERUNDER: DIGITOVER='Over', DIGITUNDER='Under'
- MATCHESDIFFERS: DIGITMATCH='Matches', DIGITDIFF='Differs'
- CALLPUT: CALL='Rise', PUT='Fall'

## How to add a new tab (Bulk Trader)
1. Add to DBOT_TABS in bot-contents.ts (BULK_TRADER=3, shift CHART to 4, TUTORIAL to 5)
2. Add to TAB_IDS array
3. Add tab in main.tsx with id='id-bulk-trader' (no children, like D Circle)
4. Create src/pages/bulk-trader/bulk-trader.tsx with absolute positioning
5. Create src/components/bulk-trader-analysis/ with the tool logic
