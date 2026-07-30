import TradeEngine from '../trade';
import getBotInterface from './BotInterface';
import getTicksInterface from './TicksInterface';
import getToolsInterface from './ToolsInterface';

/**
 * Sleep function used by the bot interpreter to pause between operations.
 *
 * In 'fast' mode, the delay is reduced to 10% of the original:
 *   - sleep(1) becomes ~100ms instead of 1000ms (for the main loop)
 *   - sleep(5) becomes ~500ms instead of 5000ms (for market closed checks)
 *
 * The execution speed is read from a global store reference set by StoreProvider.
 */
const getExecutionSpeed = () => {
    try {
        const { getRootStore } = require('@/hooks/useStore');
        const store = getRootStore?.();
        return store?.run_panel?.execution_speed || 'normal';
    } catch {
        return 'normal';
    }
};

const sleep = (observer, arg = 1) => {
    // Check if fast mode is enabled
    const speed = getExecutionSpeed();
    const multiplier = speed === 'fast' ? 0.1 : 1;
    const delayMs = arg * 1000 * multiplier;

    return new Promise(
        r =>
            // eslint-disable-next-line no-promise-executor-return
            setTimeout(() => {
                r();
                setTimeout(() => observer.emit('CONTINUE'), 0);
            }, delayMs),
        () => {}
    );
};

const Interface = $scope => {
    const tradeEngine = new TradeEngine($scope);
    const { observer } = $scope;
    const getInterface = () => {
        return {
            ...getBotInterface(tradeEngine),
            ...getToolsInterface(tradeEngine),
            getTicksInterface: getTicksInterface(tradeEngine),
            watch: (...args) => tradeEngine.watch(...args),
            sleep: (...args) => sleep(observer, ...args),
            alert: (...args) => alert(...args), // eslint-disable-line no-alert
            prompt: (...args) => prompt(...args), // eslint-disable-line no-alert
            console: {
                log(...args) {
                    // eslint-disable-next-line no-console
                    console.log(new Date().toLocaleTimeString(), ...args);
                },
            },
        };
    };
    return { tradeEngine, observer, getInterface };
};

export default Interface;
