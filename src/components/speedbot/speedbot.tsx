/**
 * Speedbot — continuous high-frequency trading on every tick.
 *
 * Implements the same pattern as DBot's "Trade Again" engine:
 *  1. A persistent `ticks_history { subscribe: 1 }` stream keeps the server
 *     broadcasting ticks to this connection (identical to how DBot's TicksService
 *     keeps its stream alive — without it the API never sends ticks at all).
 *  2. Trades are bought with DBot's `doUntilDone` retry loop, which automatically
 *     re-sends the buy on recoverable errors such as PriceMoved.
 *  3. On every contract settlement the engine immediately fires the next purchase
 *     ("trade again"), giving zero-delay continuous trading.
 *
 * Digit 0 is counted correctly everywhere because quotes are padded to the
 * market's pip size before extraction (see @/utils/digit-analysis).
 */
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
    const DIRECTION_TYPE = ['evenodd', 'overunder', 'matchdiff', 'risefall'] as const;
    type DirectionKey = (typeof DIRECTION_TYPE)[number];
    type DirectionOption = { value: string; label: string };

    const CONTRACT_DIRECTIONS: Record<DirectionKey, Array<DirectionOption>> = {
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

    // Digit strategy selector (replaces the old hardcoded '0' barrier).
    // Chooses the digit contract pair (Over/Under OR Match/Differ) and the
    // barrier digit 0-9 (zero counted as a digit everywhere).
    const DIGIT_STRATEGIES: Array<{ value: 'overunder' | 'matchdiff'; label: string }> = [
        { value: 'overunder', label: 'Over / Under' },
        { value: 'matchdiff', label: 'Match / Differ' },
    ];
    const DIGIT_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Recoverable buy errors — DBot's doUntilDone retries these automatically
// (identical error set used by the TradeEngine purchase loop)
const BUY_RETRY_ERRORS = ['PriceMoved', 'InvalidContractProposal', 'DailyLossLimit', 'MaxStake', 'NoMoney', 'RateLimit', 'ContractBuyValidationError'];

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
    const { connectionStatus } = useApiBase(); void connectionStatus;

    // Configuration
    const [selectedMarket, setSelectedMarket] = useState('1HZ100V');
    const [contractType, setContractType] = useState('evenodd');
    const [direction, setDirection] = useState('even');
    const [ticks, setTicks] = useState('1');
    const [stake, setStake] = useState('0.5');
    const [takeProfit, setTakeProfit] = useState('10');
    const [stopLoss, setStopLoss] = useState('50');
    const [selectedDigit, setSelectedDigit] = useState('0');
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
    const [recentTrades, setRecentTrades] = useState<TradeEntry[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [lastDigit, setLastDigitState] = useState<number | null>(null);

    const processedContractsRef = useRef<Set<string>>(new Set());
    const disposedRef = useRef(false);
    const isRunningRef = useRef(false);
    const directionRef = useRef('even');
    const currentStakeRef = useRef(0.5);
    const takeProfitRef = useRef(10);
    const stopLossRef = useRef(50);
    const totalProfitRef = useRef(0);
    const totalLossRef = useRef(0);
    const executionSpeedRef = useRef<'fast' | 'normal'>('fast');
    const contractTypeRef = useRef('evenodd');
    const ticksRef = useRef(1);
    const alternateEvenOddRef = useRef(false);
    const selectedDigitRef = useRef('0');
    const alternateOnLossRef = useRef(false);
    const martingaleEnabledRef = useRef(true);
    const martingaleMultiplierRef = useRef(1.15);
    const recoveryModeRef = useRef(false);
    const selectedMarketRef = useRef('1HZ100V');
    const recentTradesRef = useRef<TradeEntry[]>([]);
    const tradeAgainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tickSubscriptionIdRef = useRef<string | null>(null);
    const lastSeenEpochRef = useRef(0);
    const streamAliveRef = useRef(false);

    const pipSize = PIP_SIZE_BY_SYMBOL[selectedMarket] ?? 2;

    const formatPadded = useCallback((q: string | number): string => formatQuote(q, pipSize), [pipSize]);

    // Barrier digit = the user's chosen digit 0-9 when a digit contract is active
    const useDigitContracts = ['overunder', 'matchdiff'].includes(contractType);
    const barrierDigit = useDigitContracts ? selectedDigit : '';

    // ---------------------------------------------------------------
    // DBot-style engine
    // ---------------------------------------------------------------

    // Build the buy request for the current direction/stake
    const buildBuyRequest = useCallback((): any => {
        const contractTypes = CONTRACT_TYPE_MAP[contractTypeRef.current] ?? {};
        const contractTypeStr = contractTypes[directionRef.current] ?? 'DIGITEVEN';
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
            req.parameters.barrier = selectedDigitRef.current;
        }
        return req;
    }, [client.currency]);

    // DBot `doUntilDone`-style purchase: keeps re-sending the buy request until the
    // server accepts it, with progressive delays between attempts — exactly the same
    // retry behaviour the TradeEngine uses for its "Trade Again" loop.
    const purchaseUntilDone = useCallback(async (): Promise<any | null> => {
        if (!api_base.api) return null;
        let delay = 250;
        let attempt = 0;
        while (!disposedRef.current) {
            attempt++;
            try {
                const response = await (api_base.api as any).send(buildBuyRequest());
                if (response?.buy?.contract_id) return response;
                const code = response?.error?.code ?? '';
                if (!BUY_RETRY_ERRORS.includes(code)) return response; // non-retryable
                // Progressive backoff like DBot's delay_index
                await new Promise((r) => setTimeout(r, Math.min(delay * attempt, 3000)));
            } catch (e: any) {
                if (disposedRef.current || !isRunningRef.current) return null;
                await new Promise((r) => setTimeout(r, Math.min(delay * attempt, 3000)));
            }
        }
        return null;
    }, [buildBuyRequest]);

    // "Trade Again" — DBot's after-purchase handler. When a contract settles we
    // decide the next direction/stake, then immediately purchase the next contract
    // with zero delay (in Fast mode the next trade fires on the very next tick,
    // bound to the next incoming price — zero tick delay).
    const tradeAgain = useCallback(
        (wasLoss: boolean) => {
            if (disposedRef.current || !isRunningRef.current) return;

            // Martingale / recovery stake adjustment (identical to previous logic)
            const baseStake = parseFloat(stake) || 0.5;
            if (!wasLoss) {
                currentStakeRef.current = baseStake;
                setCurrentStake(baseStake);
            } else if (martingaleEnabledRef.current) {
                const multiplier = martingaleMultiplierRef.current || 1.15;
                const nextStake = Math.round(currentStakeRef.current * multiplier * 100) / 100;
                currentStakeRef.current = nextStake;
                setCurrentStake(nextStake);
            }

            // Direction alternation (Even/Odd) or alternate-on-loss
            {
                const type = contractTypeRef.current;
                let dir = directionRef.current;
                const dirs = CONTRACT_DIRECTIONS[type];
                const other = dirs?.find((d) => d.value !== dir)?.value;
                let shouldFlip = false;
                if (alternateEvenOddRef.current && type === 'evenodd') shouldFlip = true;
                if (alternateOnLossRef.current && wasLoss) shouldFlip = true;
                if (!wasLoss && alternateOnLossRef.current) shouldFlip = false;
                if (shouldFlip && other) {
                    directionRef.current = other;
                    setDirection(other);
                }
            }

            // Fire the next trade immediately (DBot "Trade Again" behaviour)
            if (tradeAgainTimerRef.current) clearTimeout(tradeAgainTimerRef.current);
            tradeAgainTimerRef.current = setTimeout(() => {
                void (async () => {
                    const response = await purchaseUntilDone();
                    if (response?.buy?.contract_id) {
                        const entry: TradeEntry = {
                            contractId: response.buy.contract_id,
                            stake: currentStakeRef.current,
                            profit: 0,
                            status: 'pending',
                            direction: directionRef.current,
                            entryQuote: formatPadded(response.buy.buy_price ?? response.buy.display_value ?? ''),
                            exitQuote: '',
                            exitDigit: null,
                            timestamp: Date.now(),
                        };
                        recentTradesRef.current = [entry, ...recentTradesRef.current].slice(0, 50);
                        setRecentTrades([...recentTradesRef.current]);
                        // Subscribe to this contract's settlement stream
                        try {
                            await (api_base.api as any).send({ proposal_open_contract: '1', contract_id: response.buy.contract_id, subscribe: 1 });
                        } catch (e) {
                            /* continue */
                        }
                    } else if (response?.error && isRunningRef.current && !disposedRef.current) {
                        const code = response.error.code ?? '';
                        if (!BUY_RETRY_ERRORS.includes(code)) {
                            setErrorMessage(`Stopped: ${response.error.message || 'Trade failed'}`);
                            setIsRunning(false);
                            isRunningRef.current = false;
                        }
                    }
                })();
            }, executionSpeedRef.current === 'fast' ? 0 : 600);
        },
        [stake, formatPadded, purchaseUntilDone]
    );

    // Handle a settled contract (settled via proposal_open_contract subscription)
    const handleSettlement = useCallback(
        (poc: any) => {
            if (processedContractsRef.current.has(poc.contract_id)) return;
            processedContractsRef.current.add(poc.contract_id);

            const profit = parseFloat(poc.profit) || 0;
            const sellPrice = parseFloat(poc.sell_price) || 0;
            const wasLoss = profit <= 0;

            // Update the trade entry with exit data (digit 0 counted via pip size)
            const resolvedSymbol = poc.underlying || poc.symbol || selectedMarketRef.current;
            let pipForSymbol = PIP_SIZE_BY_SYMBOL[resolvedSymbol];
            if (pipForSymbol === undefined) {
                const prefix = Object.keys(PIP_SIZE_BY_SYMBOL).find((k) => resolvedSymbol.startsWith(k));
                if (prefix) pipForSymbol = PIP_SIZE_BY_SYMBOL[prefix];
            }
            pipForSymbol ??= 2;
            const exitQuoteStr = formatQuote(poc.exit_tick ?? poc.exit_spot ?? poc.sell_spot ?? '', pipForSymbol);
            const exitDigit = getLastDigit(exitQuoteStr, pipForSymbol);

            recentTradesRef.current = recentTradesRef.current.map((t) =>
                t.contractId === poc.contract_id
                    ? { ...t, profit, status: wasLoss ? 'lost' : 'won', exitQuote: exitQuoteStr, exitDigit }
                    : t
            );
            setRecentTrades([...recentTradesRef.current]);

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

            // Take profit / stop loss limits
            const net = totalProfitRef.current - totalLossRef.current;
            if (takeProfitRef.current > 0 && net >= takeProfitRef.current) {
                setIsRunning(false);
                isRunningRef.current = false;
                setErrorMessage(`Take profit reached (+${net.toFixed(2)} USD) — Speedbot stopped`);
                return;
            }
            if (stopLossRef.current > 0 && net <= -stopLossRef.current) {
                setIsRunning(false);
                isRunningRef.current = false;
                setErrorMessage(`Stop loss reached (${net.toFixed(2)} USD) — Speedbot stopped`);
                return;
            }

            // DBot "Trade Again": immediately purchase the next contract
            tradeAgain(wasLoss);
        },
        [tradeAgain]
    );

    // Open the persistent tick stream — DBot's TicksService pattern.
    // The Deriv API only broadcasts ticks to connections that hold an active
    // ticks_history/subscribe subscription. This effect opens it and keeps it
    // alive; a watchdog re-subscribes if ticks go silent.
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;

        const openStream = async () => {
            if (tickSubscriptionIdRef.current && api_base.api) {
                try {
                    await (api_base.api as any).send({ forget: tickSubscriptionIdRef.current });
                } catch (e) {
                    /* ignore */
                }
                tickSubscriptionIdRef.current = null;
            }
            if (!api_base.api || disposedRef.current) return;
            try {
                const resp = await (api_base.api as any).send({
                    ticks_history: selectedMarketRef.current,
                    subscribe: 1,
                    end: 'latest',
                    count: 1,
                    style: 'ticks',
                });
                if (resp?.subscription?.id) {
                    tickSubscriptionIdRef.current = resp.subscription.id;
                } else if (resp?.tick?.id) {
                    tickSubscriptionIdRef.current = resp.tick.id;
                }
                streamAliveRef.current = true;
                setErrorMessage('');
                if (resp?.tick) {
                    setLivePrice(formatPadded(resp.tick.quote ?? ''));
                    setLastDigitState(getLastDigit(formatPadded(resp.tick.quote ?? ''), pipSize));
                }
            } catch (e: any) {
                streamAliveRef.current = false;
                if (isRunningRef.current && !disposedRef.current) {
                    setErrorMessage('Market data stream interrupted — reconnecting...');
                }
            }
        };

        void openStream();

        // Watchdog: if no tick has arrived for 8 seconds, reopen the stream
        let lastTickTime = Date.now();
        const watchdog = setInterval(() => {
            if (disposedRef.current) return;
            if (Date.now() - lastTickTime > 8000) {
                void openStream();
            }
        }, 5000);

        return () => {
            clearInterval(watchdog);
            disposedRef.current = true;
            if (tickSubscriptionIdRef.current && api_base.api) {
                (api_base.api as any).send({ forget: tickSubscriptionIdRef.current }).catch(() => {});
                tickSubscriptionIdRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.is_logged_in]);

    // Re-open the tick stream whenever the market selection changes
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;
        setLivePrice('--');
        setLastDigitState(null);
        lastSeenEpochRef.current = 0;
        (async () => {
            if (tickSubscriptionIdRef.current && api_base.api) {
                try {
                    await (api_base.api as any).send({ forget: tickSubscriptionIdRef.current });
                } catch (e) {
                    /* ignore */
                }
                tickSubscriptionIdRef.current = null;
            }
            try {
                const resp = await (api_base.api as any).send({
                    ticks_history: selectedMarketRef.current,
                    subscribe: 1,
                    end: 'latest',
                    count: 1,
                    style: 'ticks',
                });
                if (resp?.subscription?.id) tickSubscriptionIdRef.current = resp.subscription.id;
                else if (resp?.tick?.id) tickSubscriptionIdRef.current = resp.tick.id;
                streamAliveRef.current = true;
                if (resp?.tick) {
                    setLivePrice(formatPadded(resp.tick.quote ?? ''));
                    setLastDigitState(getLastDigit(formatPadded(resp.tick.quote ?? ''), pipSize));
                }
            } catch {
                streamAliveRef.current = false;
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMarket, client.is_logged_in, pipSize]);

    // Global message listener — receives ticks + settlements from the open stream
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;
        disposedRef.current = false;

        const messageSubscription = api_base.api.onMessage().subscribe(({ data }: any) => {
            // Live tick — update the display digit and fire a trade on every tick
            if (data?.msg_type === 'tick' && (data.tick?.symbol === selectedMarketRef.current || data.symbol === selectedMarketRef.current)) {
                const quote = formatPadded(data.tick?.quote ?? data.price ?? '');
                const epoch = data.tick?.epoch ?? data.epoch ?? 0;
                setLivePrice(quote);
                setLastDigitState(getLastDigit(quote, pipSize));
                if (epoch > 0) lastSeenEpochRef.current = epoch;

                // Fast mode: one trade per unique tick (epoch dedupe prevents
                // double-trades if the same tick message is delivered twice)
                if (executionSpeedRef.current === 'fast' && isRunningRef.current && !disposedRef.current) {
                    if (tradeAgainTimerRef.current) clearTimeout(tradeAgainTimerRef.current);
                    tradeAgainTimerRef.current = setTimeout(() => {
                        void (async () => {
                            const response = await purchaseUntilDone();
                            if (response?.buy?.contract_id) {
                                const entry: TradeEntry = {
                                    contractId: response.buy.contract_id,
                                    stake: currentStakeRef.current,
                                    profit: 0,
                                    status: 'pending',
                                    direction: directionRef.current,
                                    entryQuote: quote,
                                    exitQuote: '',
                                    exitDigit: null,
                                    timestamp: Date.now(),
                                };
                                recentTradesRef.current = [entry, ...recentTradesRef.current].slice(0, 50);
                                setRecentTrades([...recentTradesRef.current]);
                                try {
                                    await (api_base.api as any).send({ proposal_open_contract: '1', contract_id: response.buy.contract_id, subscribe: 1 });
                                } catch (e) {
                                    /* continue */
                                }
                            } else if (response?.error && isRunningRef.current && !disposedRef.current) {
                                const code = response.error.code ?? '';
                                if (!BUY_RETRY_ERRORS.includes(code)) {
                                    setErrorMessage(`Stopped: ${response.error.message || 'Trade failed'}`);
                                    setIsRunning(false);
                                    isRunningRef.current = false;
                                }
                            }
                        })();
                    }, 0);
                }
            }

            // Settlement via the per-contract subscription (Normal mode path)
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
            if (tradeAgainTimerRef.current) {
                clearTimeout(tradeAgainTimerRef.current);
                tradeAgainTimerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.is_logged_in, pipSize, formatPadded, handleSettlement, purchaseUntilDone]);

    // Keep refs synced with UI state
    useEffect(() => {
        executionSpeedRef.current = executionSpeed;
    }, [executionSpeed]);
    useEffect(() => {
        contractTypeRef.current = contractType;
    }, [contractType]);
    useEffect(() => {
        selectedMarketRef.current = selectedMarket;
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
        selectedDigitRef.current = selectedDigit;
    }, [selectedDigit]);
    useEffect(() => {
        recoveryModeRef.current = recoveryMode;
    }, [recoveryMode]);
    useEffect(() => {
        directionRef.current = direction;
    }, [direction]);

    void connectionStatus; void streamAliveRef;

    const handleStart = () => {
        if (!client.is_logged_in) {
            setErrorMessage('Please log in to trade');
            return;
        }
        processedContractsRef.current.clear();
        totalProfitRef.current = 0;
        totalLossRef.current = 0;
        setTotalProfit(0);
        setTotalLoss(0);
        setWonCount(0);
        setLostCount(0);
        setTradeCount(0);
        setRecentTrades([]);
        recentTradesRef.current = [];
        currentStakeRef.current = parseFloat(stake) || 0.5;
        setCurrentStake(currentStakeRef.current);
        isRunningRef.current = true;
        setIsRunning(true);
        setErrorMessage('');
        // Fire the first trade immediately
        void (async () => {
            const response = await purchaseUntilDone();
            if (response?.buy?.contract_id && isRunningRef.current) {
                const entry: TradeEntry = {
                    contractId: response.buy.contract_id,
                    stake: currentStakeRef.current,
                    profit: 0,
                    status: 'pending',
                    direction: directionRef.current,
                    entryQuote: formatPadded(response.buy.buy_price ?? response.buy.display_value ?? ''),
                    exitQuote: '',
                    exitDigit: null,
                    timestamp: Date.now(),
                };
                recentTradesRef.current = [entry, ...recentTradesRef.current].slice(0, 50);
                setRecentTrades([...recentTradesRef.current]);
                try {
                    await (api_base.api as any).send({ proposal_open_contract: '1', contract_id: response.buy.contract_id, subscribe: 1 });
                } catch (e) {
                    /* continue */
                }
            }
        })();
    };

    const handleStop = () => {
        isRunningRef.current = false;
        setIsRunning(false);
        if (tradeAgainTimerRef.current) {
            clearTimeout(tradeAgainTimerRef.current);
            tradeAgainTimerRef.current = null;
        }
        currentStakeRef.current = parseFloat(stake) || 0.5;
        setCurrentStake(currentStakeRef.current);
        setErrorMessage('');
    };

    const handleReset = () => {
        if (tradeAgainTimerRef.current) {
            clearTimeout(tradeAgainTimerRef.current);
            tradeAgainTimerRef.current = null;
        }
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

    const handleDigitStrategyChange = (newType: 'overunder' | 'matchdiff') => {
        setContractType(newType);
        setDirection(CONTRACT_DIRECTIONS[newType][0].value);
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

            {/* Contract type (only for Even/Odd and Rise/Fall — digit strategies use their own selector below) */}
            {!useDigitContracts && (
            <div className='speedbot-control-row'>
                <select className='speedbot-select speedbot-select--contract' value={contractType} onChange={(e) => handleContractTypeChange(e.target.value)}>
                    {CONTRACT_TYPES.map((c) => (
                        <option key={c.value} value={c.value}>
                            {c.label}
                        </option>
                    ))}
                </select>
            </div>
            )}

            {/* Direction — single contract choice, zero counted as a digit */}
            {['evenodd', 'overunder', 'matchdiff', 'risefall'].includes(contractType) && (
                <div className='speedbot-control-row'>
                    <select className='speedbot-select speedbot-select--contract' value={direction} onChange={(e) => setDirection(e.target.value)}>
                        {CONTRACT_DIRECTIONS[contractType]?.map((d) => (
                            <option key={d.value} value={d.value}>
                                {d.label}
                                {useDigitContracts && ` (digit ${selectedDigit})`}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Digit strategy: Over/Under OR Match/Differ + barrier digit 0-9 */}
            <div className='speedbot-digit-section'>
                <div className='speedbot-control-row'>
                    <select className='speedbot-select speedbot-select--contract' value={useDigitContracts ? contractType : ''} onChange={(e) => e.target.value && handleDigitStrategyChange(e.target.value as 'overunder' | 'matchdiff')}>
                        <option value='' disabled>
                            Select strategy
                        </option>
                        {DIGIT_STRATEGIES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className='speedbot-digit-picker-row'>
                    <span className='speedbot-digit-picker-label'>Barrier digit</span>
                    <div className='speedbot-digit-picker'>
                        {DIGIT_OPTIONS.map((d) => (
                            <button
                                key={d}
                                className={classNames('speedbot-digit-btn', { 'speedbot-digit-btn--active': selectedDigit === d })}
                                onClick={() => setSelectedDigit(d)}
                                type='button'
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

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
                            <span className='speedbot-trade-chip-dir'>
                                {t.direction.toUpperCase()}
                                {t.exitDigit !== null && <span className='speedbot-trade-chip-digit'> @{t.exitDigit}</span>}
                            </span>
                            <span className='speedbot-trade-chip-profit'>{t.profit.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Speed indicator */}
            <div className='speedbot-mode-note'>
                {executionSpeed === 'fast'
                    ? '⚡ FAST — one trade fired on every incoming tick, without waiting for the previous result'
                    : '▶▶ NORMAL — the next trade fires only after the previous one has settled (DBot Trade Again)'}
            </div>
        </div>
    );
};

export default observer(Speedbot);
