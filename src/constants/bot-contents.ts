type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    D_CIRCLE: 2,
    BULK_TRADER: 3,
    SPEEDBOT: 4,
    CHART: 5,
    TUTORIAL: 6,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = ['id-dbot-dashboard', 'id-bot-builder', 'id-d-circle', 'id-bulk-trader', 'id-speedbot', 'id-charts', 'id-tutorials'];

export const DEBOUNCE_INTERVAL_TIME = 500;
// Restore: reverted to pre-Free-Bots build (2026-08-16 21:00 UTC)
