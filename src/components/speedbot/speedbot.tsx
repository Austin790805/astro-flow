import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import { useApiBase } from '@/hooks/useApiBase';
import { getLastDigit, PIP_SIZE_BY_SYMBOL, formatQuote } from '@/utils/digit-analysis';
import './speedbot.scss';

// All synthetic markets supported by the Speedbot
const MARKET_OPTIONS = [
    { value: 'R_10', label: 'Volatility 10 Index' },
    { value: 'R_25', label: 'Volatility 25 Index' },
    { value: 'R_50', label: 'Volatility 50 Index' },
    { value: 'R_75', label: 'Volatility 75 Index' },
    { value: 'R_100', label: 'Volatility 100 Index' },
    { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
];

// Contract types — every synthetic contract type
const CONTRACT_TYPES = [
    { value: 'evenodd', label: 'Even / Odd' },
    { value: 'overunder', label: 'Over / Under' },
    { value: 'matchdiff', label: 'Match / Differ' },
    { value: 'risefall', label: 'Rise / Fall' },
];

// Per-contract direction options
const CONTRACT_DIRECTIONS: Record<string, { value: string; label: string }[]> = {
    evenodd: [
        { value: 'even', label: 'Even' },
        { value: 'odd', label: 'Odd' },
    ],
    overunder: [
        { value: 'over', label: 'Over' },
        { value: 'under', label: 'Under' },
    ],
    matchdiff: [
        { value: 'match', label: 'Match' },
        { value: 'diff', label: 'Differ' },
    ],
    risefall: [
        { value: 'rise', label: 'Rise' },
        { value: 'fall', label: 'Fall' },
    ],
};

const CONTRACT_TYPE_MAP: Record<string, Record<string, string>> = {
    evenodd: { even: 'DIGITEVEN', odd: 'DIGITODD' },
    overunder: { over: 'DIGITOVER', under: 'DIGITUNDER' },
    matchdiff: { match: 'DIGITMATCH', diff: 'DIGITDIFF' },
    risefall: { rise: 'CALL', fall: 'PUT' },
};

type TradeEntry = {
    contractId: string;
    stake: number;
    profit: number;
    status: 'won' | 'lost' | 'pending';
    direction: string;
    entryQuote: string;
    exitQuote: string;
    exitDigit: number | null;
    timestamp: number;
};

const Speedbot: React.FC = () => {
    const { client } = useStore();
    const { isAuthorized, connectionStatus } = useApiBase();

    // Configuration
    const [selectedMarket, setSelectedMarket] = useState('1HZ100V');
    const [contractType, setContractType] = useState('evenodd');
    const [direction, setDirection] = useState('even');
    const [ticks, setTicks] = useState('1');
    const [stake, setStake] = useState('0.5');
    const [takeProfit, setTakeProfit] = useState('10');
    const [stopLoss, setStopLoss] = useState('50');
    const [alternateEvenOdd, setAlternateEvenOdd] = useState(false);
    const [alternateOnLoss, setAlternateOnLoss] = useState(false);
    const [martingaleEnabled, setMartingaleEnabled] = useState(true);
    const [martingaleMultiplier, setMartingaleMultiplier] = useState('1.15');
    const [recoveryMode, setRecoveryMode] = useState(false);

    // Runtime state
    const [livePrice, setLivePrice] = useState<string>('--');
    const [isRunning, setIsRunning] = useState(false);
    const [executionSpeed, setExecutionSpeed] = useState<'fast' | 'normal'>('fast');
    const [totalProfit, setTotalProfit] = useState(0);
    const [totalLoss, setTotalLoss] = useState(0);
    const [wonCount, setWonCount] = useState(0);
    const [lostCount, setLostCount] = useState(0);
    const [tradeCount, setTradeCount] = useState(0);
    const [currentStake, setCurrentStake] = useState(0.5);
    const [lastTradeWasLoss, setLastTradeWasLoss] = useState(false);
    const [recentTrades, setRecentTrades] = useState<TradeEntry[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [lastDigit, setLastDigitState] = useState<number | null>(null);

    const subscriptionIdRef = useRef<string | null>(null);
    const processedContractsRef = useRef<Set<string>>(new Set());
    const lastTickTimeRef = useRef<number>(0);
    const resubscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const disposedRef = useRef(false);
    const isRunningRef = useRef(false);
    const pendingTradeRef = useRef(false);
    const directionRef = useRef('even');
    const currentStakeRef = useRef(0.5);
    const lastTradeWasLossRef = useRef(false);
    const takeProfitRef = useRef(10);
    const stopLossRef = useRef(50);
    const totalProfitRef = useRef(0);
    const totalLossRef = useRef(0);
    const executionSpeedRef = useRef<'fast' | 'normal'>('fast');
    const contractTypeRef = useRef('evenodd');
    const ticksRef = useRef(1);
    const alternateEvenOddRef = useRef(false);
    const alternateOnLossRef = useRef(false);
    const martingaleEnabledRef = useRef(true);
    const martingaleMultiplierRef = useRef(1.15);
    const recoveryModeRef = useRef(false);
    const selectedMarketRef = useRef('1HZ100V');
    const recentTradesRef = useRef<TradeEntry[]>([]);
    const recoveredStakesRef = useRef(0);

    const pipSize = PIP_SIZE_BY_SYMBOL[selectedMarket] ?? 2;

    const formatPadded = useCallback((q: string | number): string => formatQuote(q, pipSize), [pipSize]);
    const getLastDigitPadded = useCallback((q: string | number): number => getLastDigit(q, pipSize), [pipSize]);

    const barrierDigit = ['overunder', 'matchdiff'].includes(contractType) ? '0' : '';

    // Build the buy request for the current direction/stake
    const buildBuyRequest = useCallback((): any => {
        const dir = directionRef.current;
        const contractTypes = CONTRACT_TYPE_MAP[contractTypeRef.current] ?? {};
        const contractTypeStr = contractTypes[dir] ?? 'DIGITEVEN';
        const req: any = {
            buy: '1',
            price: currentStakeRef.current,
            parameters: {
                amount: currentStakeRef.current,
                basis: 'stake',
                contract_type: contractTypeStr,
                currency: client.currency || 'USD',
                duration: ticksRef.current,
                duration_unit: 't',
                underlying_symbol: selectedMarketRef.current,
            },
        };
        if (['overunder', 'matchdiff'].includes(contractTypeRef.current)) {
            req.parameters.barrier = barrierDigit;
        }
        return req;
    }, [client.currency, barrierDigit]);

    // Place a single trade for the current tick
    const placeTrade = useCallback(() => {
        if (!client.is_logged_in || !api_base.api || pendingTradeRef.current) return;

        // Fast mode: immediately mark busy; Normal mode: same but waits for trade result
        pendingTradeRef.current = true;

        const dir = directionRef.current;
        const req = buildBuyRequest();
        const entryQuote = livePrice;

        (api_base.api as any)
            .send(req)
            .then((response: any) => {
                if (response?.buy?.contract_id) {
                    const contractId = response.buy.contract_id;
                    const entry: TradeEntry = {
                        contractId,
                        stake: currentStakeRef.current,
                        profit: 0,
                        status: 'pending',
                        direction: dir,
                        entryQuote,
                        exitQuote: '',
                        exitDigit: null,
                        timestamp: Date.now(),
                    };
                    recentTradesRef.current = [entry, ...recentTradesRef.current].slice(0, 50);
                    setRecentTrades([...recentTradesRef.current]);
                    // Subscribe to this contract's settlement
                    (api_base.api as any).send({ proposal_open_contract: '1', contract_id: contractId, subscribe: 1 }).catch(() => {});
                    // In fast mode, allow next tick's trade immediately; in normal mode the next trade
                    // fires only after this one settles (handled by the settlement handler)
                    if (executionSpeedRef.current === 'fast') {
                        pendingTradeRef.current = false;
                    }
                } else {
                    pendingTradeRef.current = false;
                    const err = response?.error?.message || 'Trade failed';
                    console.error('[Speedbot] buy failed:', err);
                }
            })
            .catch((err: any) => {
                pendingTradeRef.current = false;
                console.error('[Speedbot] buy error:', err);
            });
    }, [client.is_logged_in, buildBuyRequest, livePrice]);

    // Update direction based on alternation toggles
    const rotateDirection = useCallback(
        (wasLoss: boolean) => {
            const type = contractTypeRef.current;
            let dir = directionRef.current;
            const dirs = CONTRACT_DIRECTIONS[type];
            if (!dirs) return;
            const other = dirs.find((d) => d.value !== dir)?.value;
            if (!other) return;

            let shouldFlip = false;
            // Alternate Even and Odd: flip every trade when on Even/Odd
            if (alternateEvenOddRef.current && type === 'evenodd') {
                shouldFlip = true;
            }
            // Alternate on Loss: flip direction after a losing trade
            if (alternateOnLossRef.current && wasLoss) {
                shouldFlip = true;
            }
            // Martingale reset: after a win with martingale, return to base direction if it was flipped on loss
            if (!wasLoss && alternateOnLossRef.current) {
                shouldFlip = false;
            }

            if (shouldFlip) {
                directionRef.current = other;
                setDirection(other);
            }
        },
        []
    );

    // Apply martingale / recovery stake adjustment
    const adjustStake = useCallback(
        (wasLoss: boolean) => {
            const baseStake = parseFloat(stake) || 0.5;
            if (!wasLoss) {
                // Win: reset to base stake, clear recovered accumulation
                currentStakeRef.current = baseStake;
                recoveredStakesRef.current = 0;
                setCurrentStake(baseStake);
                setLastTradeWasLoss(false);
                lastTradeWasLossRef.current = false;
                return;
            }
            setLastTradeWasLoss(true);
            lastTradeWasLossRef.current = true;

            if (martingaleEnabledRef.current) {
                const multiplier = martingaleMultiplierRef.current || 1.15;
                const nextStake = Math.round(currentStakeRef.current * multiplier * 100) / 100;
                currentStakeRef.current = nextStake;
                setCurrentStake(nextStake);
            }
            if (recoveryModeRef.current) {
                // Recovery mode: add all lost stakes to the recovery target
                recoveredStakesRef.current += currentStakeRef.current;
            }
        },
        [stake]
    );

    // Handle a settled contract
    const handleSettlement = useCallback(
        (poc: any) => {
            if (processedContractsRef.current.has(poc.contract_id)) return;
            processedContractsRef.current.add(poc.contract_id);

            const profit = parseFloat(poc.profit) || 0;
            const sellPrice = parseFloat(poc.sell_price) || 0;
            const wasLoss = profit <= 0;

            // Update the trade entry with exit data (zero counted via pip size)
            const pipForSymbol =
                PIP_SIZE_BY_SYMBOL[poc.underlying || poc.symbol || selectedMarketRef.current] ??
                Object.keys(PIP_SIZE_BY_SYMBOL).find((k) => (poc.underlying || poc.symbol || '').startsWith(k))
                    ? PIP_SIZE_BY_SYMBOL[Object.keys(PIP_SIZE_BY_SYMBOL).find((k) => (poc.underlying || poc.symbol || '').startsWith(k))!]
                    : 2;
            const exitQuoteRaw = poc.exit_tick ?? poc.exit_spot ?? poc.sell_spot ?? '';
            const exitQuoteStr = formatQuote(exitQuoteRaw, pipForSymbol);
            const exitDigit = getLastDigit(exitQuoteStr, pipForSymbol);

            recentTradesRef.current = recentTradesRef.current.map((t) =>
                t.contractId === poc.contract_id
                    ? { ...t, profit, status: wasLoss ? 'lost' : 'won', exitQuote: exitQuoteStr, exitDigit }
                    : t
            );
            setRecentTrades([...recentTradesRef.current]);

            // Update totals
            const tp = wasLoss ? profit : sellPrice;
            if (wasLoss) {
                setTotalLoss((prev) => prev + Math.abs(profit));
                totalLossRef.current += Math.abs(profit);
            } else {
                setTotalProfit((prev) => prev + profit);
                setWonCount((prev) => prev + 1);
                totalProfitRef.current += profit;
            }
            if (wasLoss) setLostCount((prev) => prev + 1);
            setTradeCount((prev) => prev + 1);

            // Net P&L vs take profit / stop loss targets
            const net = totalProfitRef.current - totalLossRef.current;
            if (takeProfitRef.current > 0 && net >= takeProfitRef.current) {
                setIsRunning(false);
                isRunningRef.current = false;
                pendingTradeRef.current = false;
                setErrorMessage(`Take profit reached (+${net.toFixed(2)} USD) — Speedbot stopped`);
                return;
            }
            if (stopLossRef.current > 0 && net <= -stopLossRef.current) {
                setIsRunning(false);
                isRunningRef.current = false;
                pendingTradeRef.current = false;
                setErrorMessage(`Stop loss reached (${net.toFixed(2)} USD) — Speedbot stopped`);
                return;
            }

            adjustStake(wasLoss);
            rotateDirection(wasLoss);
            pendingTradeRef.current = false;
        },
        [adjustStake, rotateDirection]
    );

    // Tick handler — executes one trade per new tick
    const handleNewTick = useCallback(
        (tick: { quote: string; epoch: number }) => {
            if (!isRunningRef.current || !pendingTradeRef.current) {
                setLivePrice(tick.quote);
                setLastDigitState(getLastDigit(tick.quote, pipSize));
            }
            if (!isRunningRef.current) return;
            setLivePrice(tick.quote);
            setLastDigitState(getLastDigit(tick.quote, pipSize));
            if (pendingTradeRef.current) return; // normal mode waits for settlement
            placeTrade();
        },
        [pipSize, placeTrade]
    );

    // Subscribe to ticks and contract updates
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;
        isRunningRef.current = false;

        disposedRef.current = false;
        lastTickTimeRef.current = Date.now();

        let retryAttempt = 0;
        const MAX_RETRIES = 5;

        const fetchTicks = async (retrying: boolean = false) => {
            try {
                if (subscriptionIdRef.current) {
                    try {
                        await (api_base.api as any).forget(subscriptionIdRef.current);
                    } catch {
                        /* ignore */
                    }
                    subscriptionIdRef.current = null;
                }
                const response = await (api_base.api as any)?.send({
                    ticks_history: selectedMarketRef.current,
                    subscribe: 1,
                    end: 'latest',
                    count: 500,
                    style: 'ticks',
                });
                const resp = response as any;

                // Handle API-level errors (e.g. rate limits) as retryable
                if (resp?.error) {
                    throw new Error(resp.error.message || 'Market data error');
                }

                const histPrices: string[] = [];
                if (resp?.history && Array.isArray(resp.history.prices)) {
                    resp.history.prices.forEach((p: any) => histPrices.push(String(p)));
                }
                if (histPrices.length > 0) {
                    const lastQuote = formatPadded(histPrices[histPrices.length - 1]);
                    setLivePrice(lastQuote);
                    setLastDigitState(getLastDigitPadded(lastQuote));
                } else if (resp?.tick) {
                    const q = formatPadded(resp.tick.quote);
                    setLivePrice(q);
                    setLastDigitState(getLastDigitPadded(q));
                    subscriptionIdRef.current = resp.subscription?.id || null;
                    lastTickTimeRef.current = Date.now();
                }

                // Successful (re)subscription — clear any error and stop retrying
                retryAttempt = 0;
                if (retrying) {
                    setErrorMessage('');
                }
                startWatchdog();
            } catch (err: any) {
                // Transient failure: back off and retry; never abort the run
                const delay = Math.min(2000 * Math.pow(2, retryAttempt), 30000);
                retryAttempt++;
                console.warn('[Speedbot] tick stream error, retry', retryAttempt, err?.message);
                if (retryAttempt <= MAX_RETRIES && !disposedRef.current) {
                    setErrorMessage(`Reconnecting market data... (attempt ${retryAttempt}/${MAX_RETRIES})`);
                    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = setTimeout(() => fetchTicks(true), delay);
                } else if (retryAttempt > MAX_RETRIES) {
                    // Keep trying at a slower rate while the bot is running
                    if (isRunningRef.current && !disposedRef.current) {
                        setErrorMessage('Market data reconnecting — trades will resume automatically');
                        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                        retryTimerRef.current = setTimeout(() => {
                            retryAttempt = 0;
                            fetchTicks(true);
                        }, 10000);
                    }
                }
            }
        };

        const startWatchdog = () => {
            if (resubscribeTimerRef.current) clearTimeout(resubscribeTimerRef.current);
            resubscribeTimerRef.current = setInterval(() => {
                if (disposedRef.current) return;
                // If no ticks received for 15s while running, resubscribe silently
                if (Date.now() - lastTickTimeRef.current > 15000) {
                    console.warn('[Speedbot] tick stream stalled, resubscribing');
                    lastTickTimeRef.current = Date.now();
                    fetchTicks(true);
                }
            }, 3000);
        };

        fetchTicks();

        const contractSub = (api_base.api.send as any)({
            proposal_open_contract: 1,
            subscribe: 1,
        });
        if (contractSub?.then) {
            contractSub
                .then((resp: any) => {
                    if (resp?.subscription?.id) {
                        // global poc subscription id kept internally by api; ignore
                        void resp;
                    }
                })
                .catch(() => {});
        }

        const messageSubscription = api_base.api.onMessage().subscribe(({ data }: any) => {
            // Live tick stream
            if (data?.msg_type === 'tick' && (data.tick?.symbol === selectedMarketRef.current || data.symbol === selectedMarketRef.current)) {
                const tick = {
                    quote: formatPadded(data.tick?.quote ?? data.price ?? ''),
                    epoch: data.tick?.epoch ?? data.epoch ?? 0,
                };
                if (data.subscription?.id) subscriptionIdRef.current = data.subscription.id;
                lastTickTimeRef.current = Date.now();
                handleNewTick(tick);
            }

            // Contract settlement — fires for ALL contracts, so filter to recent trades
            if (data?.msg_type === 'proposal_open_contract') {
                const poc = data.proposal_open_contract;
                if (poc && poc.contract_id && poc.is_sold && recentTradesRef.current.some((t) => t.contractId === poc.contract_id)) {
                    handleSettlement(poc);
                }
            }
        });

        return () => {
            disposedRef.current = true;
            messageSubscription.unsubscribe();
            if (resubscribeTimerRef.current) {
                clearInterval(resubscribeTimerRef.current);
                resubscribeTimerRef.current = null;
            }
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            if (subscriptionIdRef.current) {
                (api_base.api as any)?.forget(subscriptionIdRef.current).catch(() => {});
            }
        };
    }, [client.is_logged_in, formatPadded, getLastDigitPadded, handleNewTick, handleSettlement]);

    // Keep refs synced with UI state
    useEffect(() => {
        executionSpeedRef.current = executionSpeed;
    }, [executionSpeed]);
    useEffect(() => {
        contractTypeRef.current = contractType;
    }, [contractType]);
    useEffect(() => {
        selectedMarketRef.current = selectedMarket;
        setLivePrice('--');
        setLastDigitState(null);
    }, [selectedMarket]);
    useEffect(() => {
        ticksRef.current = Math.max(1, Math.min(10, parseInt(ticks) || 1));
    }, [ticks]);
    useEffect(() => {
        takeProfitRef.current = parseFloat(takeProfit) || 0;
    }, [takeProfit]);
    useEffect(() => {
        stopLossRef.current = parseFloat(stopLoss) || 0;
    }, [stopLoss]);
    useEffect(() => {
        alternateEvenOddRef.current = alternateEvenOdd;
    }, [alternateEvenOdd]);
    useEffect(() => {
        alternateOnLossRef.current = alternateOnLoss;
    }, [alternateOnLoss]);
    useEffect(() => {
        martingaleEnabledRef.current = martingaleEnabled;
        if (!martingaleEnabled) {
            currentStakeRef.current = parseFloat(stake) || 0.5;
            setCurrentStake(currentStakeRef.current);
        }
    }, [martingaleEnabled, stake]);
    useEffect(() => {
        martingaleMultiplierRef.current = parseFloat(martingaleMultiplier) || 1.15;
    }, [martingaleMultiplier]);
    useEffect(() => {
        recoveryModeRef.current = recoveryMode;
    }, [recoveryMode]);
    useEffect(() => {
        directionRef.current = direction;
    }, [direction]);


    const handleStart = () => {
        if (!client.is_logged_in) {
            setErrorMessage('Please log in to trade');
            return;
        }
        processedContractsRef.current.clear();
        totalProfitRef.current = totalProfit;
        totalLossRef.current = totalLoss;
        takeProfitRef.current = parseFloat(takeProfit) || 0;
        stopLossRef.current = parseFloat(stopLoss) || 0;
        currentStakeRef.current = parseFloat(stake) || 0.5;
        setCurrentStake(currentStakeRef.current);
        recoveredStakesRef.current = 0;
        isRunningRef.current = true;
        setIsRunning(true);
        setErrorMessage('');
        // In fast mode, place the first trade immediately on the next incoming tick
        pendingTradeRef.current = false;
    };

    const handleStop = () => {
        isRunningRef.current = false;
        setIsRunning(false);
        pendingTradeRef.current = false;
        // Reset martingale stake back to base
        currentStakeRef.current = parseFloat(stake) || 0.5;
        setCurrentStake(currentStakeRef.current);
        setErrorMessage('');
    };

    const handleReset = () => {
        handleStop();
        setTotalProfit(0);
        setTotalLoss(0);
        setWonCount(0);
        setLostCount(0);
        setTradeCount(0);
        setRecentTrades([]);
        recentTradesRef.current = [];
        processedContractsRef.current.clear();
        setErrorMessage('');
    };

    const handleContractTypeChange = (newType: string) => {
        setContractType(newType);
        const opts = CONTRACT_DIRECTIONS[newType];
        if (opts && opts.length > 0) setDirection(opts[0].value);
    };

    const netProfit = totalProfit - totalLoss;

    return (
        <div className='speedbot'>
            {/* Header */}
            <div className='speedbot-header'>
                <h2 className='speedbot-title'>Execute Trade On Every Tick</h2>
            </div>

            {/* Start + Execution Speed */}
            <div className='speedbot-start-row'>
                <button
                    className={classNames('speedbot-start-btn', { 'speedbot-start-btn--running': isRunning })}
                    onClick={isRunning ? handleStop : handleStart}
                    disabled={!client.is_logged_in}
                >
                    {isRunning ? '⏹ STOP' : '▶ START'}
                </button>
                <div className='speedbot-speed'>
                    <span className='speedbot-speed-label'>Execution Speed</span>
                    <div className='speedbot-speed-options'>
                        <button
                            className={classNames('speedbot-speed-opt', { 'speedbot-speed-opt--fast': true, 'speedbot-speed-opt--active': executionSpeed === 'fast' })}
                            onClick={() => setExecutionSpeed('fast')}
                        >
                            ⚡ FAST
                        </button>
                        <button
                            className={classNames('speedbot-speed-opt', { 'speedbot-speed-opt--normal': true, 'speedbot-speed-opt--active': executionSpeed === 'normal' })}
                            onClick={() => setExecutionSpeed('normal')}
                        >
                            ▶▶ NORMAL
                        </button>
                    </div>
                </div>
            </div>

            {/* Market + live price */}
            <div className='speedbot-market-row'>
                <select className='speedbot-select' value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)}>
                    {MARKET_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                            {m.label}
                        </option>
                    ))}
                </select>
                <span className='speedbot-price'>{livePrice}</span>
            </div>

            {/* Contract type */}
            <div className='speedbot-control-row'>
                <select className='speedbot-select speedbot-select--contract' value={contractType} onChange={(e) => handleContractTypeChange(e.target.value)}>
                    {CONTRACT_TYPES.map((c) => (
                        <option key={c.value} value={c.value}>
                            {c.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Direction — single contract choice, zero counted as a digit */}
            {['evenodd', 'overunder', 'matchdiff', 'risefall'].includes(contractType) && (
                <div className='speedbot-control-row'>
                    <select className='speedbot-select speedbot-select--contract' value={direction} onChange={(e) => setDirection(e.target.value)}>
                        {CONTRACT_DIRECTIONS[contractType]?.map((d) => (
                            <option key={d.value} value={d.value}>
                                {d.label}
                                {['overunder', 'matchdiff'].includes(contractType) && ` (digit ${barrierDigit})`}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Ticks / Stake / Take Profit / Stop Loss */}
            <div className='speedbot-inputs-row'>
                <div className='speedbot-input-group'>
                    <label className='speedbot-input-label'>Ticks</label>
                    <input className='speedbot-input' type='number' min='1' max='10' value={ticks} onChange={(e) => setTicks(e.target.value)} />
                </div>
                <div className='speedbot-input-group'>
                    <label className='speedbot-input-label'>Stake</label>
                    <input className='speedbot-input' type='number' min='0.35' step='0.1' value={stake} onChange={(e) => setStake(e.target.value)} />
                </div>
                <div className='speedbot-input-group'>
                    <label className='speedbot-input-label'>Take Profit</label>
                    <input className='speedbot-input' type='number' min='0' step='1' value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
                </div>
                <div className='speedbot-input-group'>
                    <label className='speedbot-input-label'>Stop Loss</label>
                    <input className='speedbot-input' type='number' min='0' step='1' value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
                </div>
            </div>

            {/* Alternation toggles */}
            <div className='speedbot-toggles-row'>
                <div className='speedbot-toggle-card'>
                    <span className='speedbot-toggle-label'>Alternate Even and Odd</span>
                    <label className='speedbot-toggle'>
                        <input type='checkbox' checked={alternateEvenOdd} onChange={(e) => setAlternateEvenOdd(e.target.checked)} />
                        <span className='speedbot-toggle-slider' />
                    </label>
                </div>
                <div className='speedbot-toggle-card'>
                    <span className='speedbot-toggle-label'>Alternate on Loss</span>
                    <label className='speedbot-toggle'>
                        <input type='checkbox' checked={alternateOnLoss} onChange={(e) => setAlternateOnLoss(e.target.checked)} />
                        <span className='speedbot-toggle-slider' />
                    </label>
                </div>
            </div>

            {/* Martingale */}
            <div className='speedbot-martingale-row'>
                <span className='speedbot-martingale-label'>Enable Martingale</span>
                <label className='speedbot-toggle'>
                    <input type='checkbox' checked={martingaleEnabled} onChange={(e) => setMartingaleEnabled(e.target.checked)} />
                    <span className='speedbot-toggle-slider' />
                </label>
            </div>

            <div className='speedbot-control-row'>
                <span className='speedbot-multiplier-label'>Martingale Multiplier</span>
                <input
                    className='speedbot-input speedbot-input--multiplier'
                    type='number'
                    min='1.01'
                    step='0.05'
                    value={martingaleMultiplier}
                    onChange={(e) => setMartingaleMultiplier(e.target.value)}
                />
            </div>

            {/* Recovery Mode */}
            <div className='speedbot-martingale-row'>
                <span className='speedbot-martingale-label'>Recovery Mode</span>
                <label className='speedbot-toggle'>
                    <input type='checkbox' checked={recoveryMode} onChange={(e) => setRecoveryMode(e.target.checked)} />
                    <span className='speedbot-toggle-slider' />
                </label>
            </div>

            {/* Live status */}
            <div className='speedbot-status-row'>
                <div className='speedbot-stat'>
                    <span className='speedbot-stat-label'>Trades</span>
                    <span className='speedbot-stat-value'>{tradeCount}</span>
                </div>
                <div className='speedbot-stat'>
                    <span className='speedbot-stat-label'>Won</span>
                    <span className='speedbot-stat-value speedbot-stat-value--won'>{wonCount}</span>
                </div>
                <div className='speedbot-stat'>
                    <span className='speedbot-stat-label'>Lost</span>
                    <span className='speedbot-stat-value speedbot-stat-value--lost'>{lostCount}</span>
                </div>
                <div className='speedbot-stat'>
                    <span className='speedbot-stat-label'>Net</span>
                    <span className={classNames('speedbot-stat-value', netProfit >= 0 ? 'speedbot-stat-value--won' : 'speedbot-stat-value--lost')}>
                        {netProfit.toFixed(2)}
                    </span>
                </div>
                <div className='speedbot-stat'>
                    <span className='speedbot-stat-label'>Next Stake</span>
                    <span className='speedbot-stat-value'>{currentStake.toFixed(2)}</span>
                </div>
            </div>

            {errorMessage && <div className='speedbot-error'>{errorMessage}</div>}

            {/* Current tick digit (zero counted as a digit) */}
            <div className='speedbot-digit-row'>
                <span className='speedbot-digit-label'>Last digit</span>
                <span className={classNames('speedbot-digit-value', lastDigit !== null && lastDigit === 0 ? 'speedbot-digit-value--zero' : '')}>
                    {lastDigit !== null ? lastDigit : '–'}
                </span>
            </div>

            {/* Recent trades */}
            <div className='speedbot-trades'>
                <div className='speedbot-trades-header'>
                    <span>Recent Trades</span>
                    <button className='speedbot-reset-btn' onClick={handleReset} disabled={isRunning}>
                        Reset
                    </button>
                </div>
                <div className='speedbot-trades-list'>
                    {recentTrades.length === 0 && <span className='speedbot-trades-empty'>No trades yet — press START to begin</span>}
                    {recentTrades.map((t) => (
                        <div key={t.contractId} className={classNames('speedbot-trade-chip', `speedbot-trade-chip--${t.status}`)}>
                            <span className='speedbot-trade-chip-dir'>{t.direction.toUpperCase()}</span>
                            <span className='speedbot-trade-chip-profit'>{t.profit.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Speed indicator */}
            <div className='speedbot-mode-note'>
                {executionSpeed === 'fast'
                    ? '⚡ FAST — one trade fired on every incoming tick, without waiting for the previous result'
                    : '▶▶ NORMAL — the next trade fires only after the previous one has settled'}
            </div>
        </div>
    );
};

export default observer(Speedbot);
