import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import { useApiBase } from '@/hooks/useApiBase';
import { getLastDigit, PIP_SIZE_BY_SYMBOL, formatQuote } from '@/utils/digit-analysis';
import './bulk-trader.scss';

// Market options
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

// Trade types
const TRADE_TYPES = [
    { value: 'evenodd', label: 'Even/Odd' },
    { value: 'overunder', label: 'Over/Under' },
    { value: 'matchdiff', label: 'Match/Differ' },
    { value: 'risefall', label: 'Rise/Fall' },
];

// Direction options per trade type
const DIRECTION_OPTIONS: Record<string, { value: string; label: string }[]> = {
    evenodd: [
        { value: 'even', label: 'Even Only' },
        { value: 'odd', label: 'Odd Only' },
    ],
    overunder: [
        { value: 'over', label: 'Over Only' },
        { value: 'under', label: 'Under Only' },
    ],
    matchdiff: [
        { value: 'match', label: 'Match Only' },
        { value: 'diff', label: 'Differ Only' },
    ],
    risefall: [
        { value: 'rise', label: 'Rise Only' },
        { value: 'fall', label: 'Fall Only' },
    ],
};

type TickData = {
    quote: string;
    epoch: number;
};

type TradeRecord = {
    id: string;
    contractType: string;
    direction: string;
    stake: number;
    sellPrice: number;
    profit: number;
    status: 'won' | 'lost';
    timestamp: number;
    entryTick?: string;
    entryEpoch?: number;
    entryDigit?: number;
};

type RunRecord = {
    runNumber: number;
    contractType: string;
    direction: string;
    barrier: string | null;
    numTrades: number;
    duration?: number;
    stake: number;
    totalStake: number;
    timestamp: number;
    results: { contractId: string; profit: number; status: 'won' | 'lost'; sellPrice: number }[];
};

const BulkTrader: React.FC = () => {
    const { client } = useStore();
    const [selectedMarket, setSelectedMarket] = useState('1HZ100V');
    const [tradeType, setTradeType] = useState('evenodd');
    const [direction, setDirection] = useState('odd');
    const [tickCount, setTickCount] = useState(1000);
    const [stake, setStake] = useState('5');
    const [numTrades, setNumTrades] = useState('10');
    const [barrierDigit, setBarrierDigit] = useState('5');
    const [ticks, setTicks] = useState<TickData[]>([]);
    const [livePrice, setLivePrice] = useState<string>('--');
    const [digitPercentages, setDigitPercentages] = useState<number[]>(Array(10).fill(0));
    const [tickHistory, setTickHistory] = useState<string[]>([]);
    const [lastDigit, setLastDigit] = useState<number>(0);
    const [entryTickQuote, setEntryTickQuote] = useState<string>('');
    const [entryTickEpoch, setEntryTickEpoch] = useState<number>(0);
    const [entryTickDigit, setEntryTickDigit] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [totalStake, setTotalStake] = useState(0);
    const [totalPayout, setTotalPayout] = useState(0);
    const [wonTrades, setWonTrades] = useState(0);
    const [lostTrades, setLostTrades] = useState(0);
    const [totalProfit, setTotalProfit] = useState(0);
    const [totalLoss, setTotalLoss] = useState(0);
    const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
    const [batchCount, setBatchCount] = useState(0);
    const [duration, setDuration] = useState<string>('1');
    const [isApiReady, setIsApiReady] = useState(false);
    const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const { isAuthorized, connectionStatus } = useApiBase();

    const subscriptionIdRef = useRef<string | null>(null);
    const ticksArrayRef = useRef<TickData[]>([]);
    const openContractsRef = useRef<Map<string, TradeRecord>>(new Map());
    const currentBatchContractsRef = useRef<Set<string>>(new Set());
    const contractSubIdRef = useRef<string | null>(null);
    const processedContractsRef = useRef<Set<string>>(new Set());
    const batchCountRef = useRef<number>(0);

    const pipSize = PIP_SIZE_BY_SYMBOL[selectedMarket] ?? 2;

    const getLastDigitPadded = useCallback((quote: string | number): number => getLastDigit(quote, pipSize), [pipSize]);

    const analyzeDigits = useCallback((tickData: TickData[]) => {
        if (tickData.length === 0) return;

        const digitCounts = Array(10).fill(0);
        const history: string[] = [];

        tickData.forEach((tick) => {
            const digit = getLastDigitPadded(tick.quote);
            digitCounts[digit]++;
            history.push(digit.toString());
        });

        const total = tickData.length;
        const percentages = digitCounts.map((count) => (count / total) * 100);
        const lastTick = tickData[tickData.length - 1];
        const lastD = getLastDigitPadded(lastTick.quote);

        setDigitPercentages(percentages);
        setTickHistory(history);
        setLastDigit(lastD);
        setTicks(tickData);
        setLivePrice(lastTick.quote);
        setIsApiReady(true);
    }, [getLastDigitPadded]);

    const fetchTicks = useCallback(async () => {
        if (!client.is_logged_in || !api_base.api) {
            setIsApiReady(false);
            return;
        }

        setIsLoading(true);
        setErrorMessage('');
        try {
            // Forget previous subscription if exists
            if (subscriptionIdRef.current) {
                try {
                    await (api_base.api as any).forget(subscriptionIdRef.current);
                } catch { /* ignore */ }
                subscriptionIdRef.current = null;
            }

            const response = await (api_base.api as any)?.send({
                ticks_history: selectedMarket,
                subscribe: 1,
                end: 'latest',
                count: Math.min(tickCount, 1000),
                style: 'ticks',
            });

            if (response) {
                const resp = response as any;
                let tickData: TickData[] = [];

                // New Deriv API response formats:
                // - historical: resp.history = { prices: number[], times: number[] }
                // - legacy: resp.ticks_history = [{ quote, epoch }...]
                // - single live tick: resp.tick = { quote, epoch, id }
                const histPrices: string[] = [];
                const histEpochs: number[] = [];
                if (resp.history && Array.isArray(resp.history.prices)) {
                    resp.history.prices.forEach((p: any) => histPrices.push(String(p)));
                    if (Array.isArray(resp.history.times)) {
                        resp.history.times.forEach((t: any) => histEpochs.push(Number(t)));
                    }
                } else if (resp.ticks_history && Array.isArray(resp.ticks_history)) {
                    resp.ticks_history.forEach((t: any) => {
                        histPrices.push(String(t.quote));
                        histEpochs.push(Number(t.epoch));
                    });
                }

                if (histPrices.length > 0) {
                    tickData = histPrices.map((quote, idx) => ({ quote: formatQuote(quote, pipSize), epoch: histEpochs[idx] ?? 0 }));
                } else if (resp.tick) {
                    tickData = [{ quote: formatQuote(resp.tick.quote, pipSize), epoch: resp.tick.epoch }];
                    subscriptionIdRef.current = resp.subscription?.id || null;
                }

                if (tickData.length > 0) {
                    ticksArrayRef.current = tickData;
                    analyzeDigits(tickData);
                    setIsApiReady(true);
                }

                // Auto-set a sensible default barrier when over/under or match/differ selected
                if (tickData.length > 0 && ['overunder', 'matchdiff'].includes(tradeType)) {
                    const d = getLastDigit(tickData[tickData.length - 1].quote);
                    setBarrierDigit(String(d));
                }
            }
        } catch (error: any) {
            console.error('Error fetching ticks:', error);
            setErrorMessage(error?.message || 'Failed to connect to market data');
            setIsApiReady(false);
        }
        setIsLoading(false);
    }, [selectedMarket, tickCount, client.is_logged_in, analyzeDigits, getLastDigitPadded, tradeType]);

    // Subscribe to ticks and contract updates
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;

        fetchTicks();

        // Subscribe to contract updates via proposal_open_contract
        const contractSub = api_base.api.send({
            proposal_open_contract: 1,
            subscribe: 1,
        }) as any;

        if (contractSub?.then) {
            contractSub.then((resp: any) => {
                if (resp?.subscription?.id) {
                    contractSubIdRef.current = resp.subscription.id;
                }
            }).catch(() => {});
        }

        // Listen for messages
        const messageSubscription = api_base.api.onMessage().subscribe(({ data }: any) => {
            // Handle tick updates
            if (data?.msg_type === 'tick' && (data.tick?.symbol === selectedMarket || data.symbol === selectedMarket)) {
                const newTick: TickData = {
                    quote: formatQuote(data.tick?.quote ?? data.price ?? data.quote ?? '', pipSize),
                    epoch: data.tick?.epoch ?? data.epoch ?? 0,
                };

                if (data.subscription?.id) {
                    subscriptionIdRef.current = data.subscription.id;
                } else if (data.tick?.id) {
                    subscriptionIdRef.current = data.tick.id;
                }

                const updatedTicks = [...ticksArrayRef.current, newTick];
                if (updatedTicks.length > tickCount) {
                    updatedTicks.splice(0, updatedTicks.length - tickCount);
                }
                ticksArrayRef.current = updatedTicks;
                analyzeDigits(updatedTicks);
            }

            // Handle contract updates (proposal_open_contract)
            if (data?.msg_type === 'proposal_open_contract') {
                const poc = data.proposal_open_contract;
                if (poc && poc.contract_id && poc.is_sold) {
                    // Guard against duplicate processing: each contract is settled only once
                    if (processedContractsRef.current.has(poc.contract_id)) return;
                    processedContractsRef.current.add(poc.contract_id);

                    const sellPrice = parseFloat(poc.sell_price) || 0;
                    const profit = parseFloat(poc.profit) || 0;
                    const record = openContractsRef.current.get(poc.contract_id);

                    if (record) {
                        record.sellPrice = sellPrice;
                        record.profit = profit;
                        record.status = profit > 0 ? 'won' : 'lost';
                        openContractsRef.current.delete(poc.contract_id);
                        currentBatchContractsRef.current.delete(poc.contract_id);

                        setTradeHistory(prev => [...prev, { ...record }]);
                        // Update run history result using the ref batch count so the closure is always fresh
                        const currentRun = batchCountRef.current;
                        setRunHistory(prev =>
                            prev.map(run => {
                                if (run.runNumber !== currentRun) return run;
                                return {
                                    ...run,
                                    results: run.results.map(r =>
                                        r.contractId === poc.contract_id
                                            ? { ...r, profit, status: profit > 0 ? 'won' : 'lost', sellPrice }
                                            : r
                                    ),
                                };
                            })
                        );
                        setTotalPayout(prev => prev + sellPrice);
                        if (profit > 0) {
                            setWonTrades(prev => prev + 1);
                            setTotalProfit(prev => prev + profit);
                        } else {
                            setLostTrades(prev => prev + 1);
                            setTotalLoss(prev => prev + Math.abs(profit));
                        }
                    }

                    // Check if batch is complete
                    if (currentBatchContractsRef.current.size === 0) {
                        setIsRunning(false);
                    }
                }
            }
        });

        return () => {
            messageSubscription.unsubscribe();
            if (contractSubIdRef.current) {
                (api_base.api as any)?.forget(contractSubIdRef.current).catch(() => {});
            }
            if (subscriptionIdRef.current) {
                (api_base.api as any)?.forget(subscriptionIdRef.current).catch(() => {});
            }
        };
    }, [selectedMarket, tickCount, client.is_logged_in, fetchTicks, analyzeDigits]);

    const getContractType = (directionVal: string): string => {
        switch (tradeType) {
            case 'evenodd':
                return directionVal === 'even' ? 'DIGITEVEN' : 'DIGITODD';
            case 'overunder':
                return directionVal === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
            case 'matchdiff':
                return directionVal === 'match' ? 'DIGITMATCH' : 'DIGITDIFF';
            case 'risefall':
                return directionVal === 'rise' ? 'CALL' : 'PUT';
            default:
                return 'DIGITODD';
        }
    };

    const getBarrierDigit = (): string => {
        if (['overunder', 'matchdiff'].includes(tradeType)) {
            const d = parseInt(barrierDigit) || 5;
            if (tradeType === 'overunder') {
                // For Over/Under, valid barrier is 0-9
                return String(Math.max(0, Math.min(9, d)));
            }
            // Match/Differ: barrier can be 0-9
            return String(Math.max(0, Math.min(9, d)));
        }
        return '';
    };

    const executeBatch = useCallback(async () => {
        if (!client.is_logged_in || !api_base.api) {
            setErrorMessage('Please log in to trade');
            return;
        }

        const stakeAmount = parseFloat(stake) || 0.5;
        const numTradesInt = parseInt(numTrades) || 1;
        const durationTicks = Math.max(1, Math.min(10, parseInt(duration) || 1));
        const contractType = getContractType(direction);
        const totalBatchStake = stakeAmount * numTradesInt;
        const barrier = getBarrierDigit();
        const currentRunNumber = batchCount + 1;

        // Capture the exact entry tick snapshot so each contract is bound to the
        // tick it was entered with — settlement always resolves on the NEXT tick
        // after this entry tick, even if the live price has moved on.
        const entryTick: TickData = ticksArrayRef.current.length > 0
            ? ticksArrayRef.current[ticksArrayRef.current.length - 1]
            : { quote: formatQuote(livePrice, pipSize), epoch: Date.now() / 1000 };
        const entryDigit = getLastDigitPadded(entryTick.quote);

        setEntryTickQuote(entryTick.quote);
        setEntryTickEpoch(entryTick.epoch);
        setEntryTickDigit(entryDigit);

        // Validate barrier for digit contracts
        if (['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(contractType) && !barrier) {
            setErrorMessage('Please select a barrier digit');
            return;
        }

        setIsRunning(true);
        setBatchCount(currentRunNumber);
        batchCountRef.current = currentRunNumber;
        setErrorMessage('');
        setTotalStake(prev => prev + totalBatchStake);

        // Create run history record
        const runRecord: RunRecord = {
            runNumber: currentRunNumber,
            contractType,
            direction,
            barrier: barrier || null,
            numTrades: numTradesInt,
            duration: durationTicks,
            stake: stakeAmount,
            totalStake: totalBatchStake,
            timestamp: Date.now(),
            results: [],
        };
        setRunHistory(prev => [runRecord, ...prev]);

        try {
            // Build all buy requests
            const buyRequests: any[] = [];
            for (let i = 0; i < numTradesInt; i++) {
                const buyRequest: any = {
                    buy: '1',
                    price: stakeAmount,
                    parameters: {
                        amount: stakeAmount,
                        basis: 'stake',
                        contract_type: contractType,
                        currency: client.currency || 'USD',
                        duration: durationTicks,
                        duration_unit: 't',
                        underlying_symbol: selectedMarket,
                    },
                };

                // Add barrier for digit contracts (over/under, match/differ) using SELECTED digit
                if (['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(contractType)) {
                    buyRequest.parameters.barrier = barrier;
                }

                buyRequests.push(buyRequest);
            }

            // Send all buy requests simultaneously with zero delay between requests
            const buyPromises = buyRequests.map((req) =>
                (api_base.api as any)
                    .send(req)
                    .then((response: any) => response)
                    .catch((error: any) => {
                        console.error('Buy request failed:', error?.error || error);
                        return { error: error?.error || { message: error?.message || 'Failed' } };
                    })
            );
            const responses = await Promise.all(buyPromises);

            // Process responses
            let successCount = 0;
            let failCount = 0;

            responses.forEach((response: any) => {
                if (response?.buy?.contract_id) {
                    const contractId = response.buy.contract_id;
                    currentBatchContractsRef.current.add(contractId);

                    const record: TradeRecord = {
                        id: contractId,
                        contractType,
                        direction,
                        stake: stakeAmount,
                        sellPrice: 0,
                        profit: 0,
                        status: 'won',
                        timestamp: Date.now(),
                        entryTick: entryTick.quote,
                        entryEpoch: entryTick.epoch,
                        entryDigit,
                    };
                    openContractsRef.current.set(contractId, record);
                    // Track in run history
                    setRunHistory(prev => prev.map(run =>
                        run.runNumber === currentRunNumber
                            ? {
                                  ...run,
                                  results: [
                                      ...run.results,
                                      { contractId, profit: 0, status: 'won', sellPrice: 0 },
                                  ],
                              }
                            : run
                    ));
                    successCount++;
                } else if (response?.error) {
                    console.error('Buy error:', response.error);
                    setErrorMessage(response.error?.message || 'Trade failed');
                    failCount++;
                    setLostTrades(prev => prev + 1);
                }
            });

            // If no contracts were bought and no errors, something went wrong
            if (successCount === 0 && failCount === 0) {
                setErrorMessage('No trades executed - check your connection');
                setIsRunning(false);
            }

        } catch (error: any) {
            console.error('Error executing batch:', error);
            setErrorMessage(error?.message || 'Failed to execute trades');
            setIsRunning(false);
        }
    }, [client.is_logged_in, client.currency, stake, numTrades, duration, direction, tradeType, barrierDigit, selectedMarket, batchCount]);

    const handleStart = useCallback(() => {
        if (!client.is_logged_in || !api_base.api) {
            setErrorMessage('Please log in to trade');
            return;
        }
        executeBatch();
    }, [client.is_logged_in, executeBatch]);

    const handleStop = useCallback(() => {
        setIsRunning(false);
        currentBatchContractsRef.current.clear();
    }, []);

    const handleReset = () => {
        setTotalStake(0);
        setTotalPayout(0);
        setWonTrades(0);
        setLostTrades(0);
        setTotalProfit(0);
        setTotalLoss(0);
        setTradeHistory([]);
        setBatchCount(0);
        batchCountRef.current = 0;
        setRunHistory([]);
        setErrorMessage('');
        openContractsRef.current.clear();
        currentBatchContractsRef.current.clear();
        processedContractsRef.current.clear();
        handleStop();
    };

    const handleResetHistory = () => {
        setTradeHistory([]);
        setRunHistory([]);
        setTotalStake(0);
        setTotalPayout(0);
        setWonTrades(0);
        setLostTrades(0);
        setTotalProfit(0);
        setTotalLoss(0);
        setBatchCount(0);
        batchCountRef.current = 0;
        processedContractsRef.current.clear();
        openContractsRef.current.clear();
        currentBatchContractsRef.current.clear();
    };

    // Digit circle colors matching D Circle style
    const DIGIT_COLORS: Record<number, string> = {
        0: '#4A6BFF',
        1: '#4A6BFF',
        2: '#4A6BFF',
        3: '#4A6BFF',
        4: '#4CAF50',
        5: '#FF9800',
        6: '#FF9800',
        7: '#4CAF50',
        8: '#FF1744',
        9: '#4A6BFF',
    };

    // Get set of winning digits for current trade type/direction (for circle highlighting)
    const getWinningDigits = (): number[] => {
        switch (tradeType) {
            case 'evenodd':
                return direction === 'even' ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];
            case 'overunder': {
                const b = parseInt(barrierDigit) || 5;
                return direction === 'over'
                    ? Array.from({ length: 9 - b }, (_, i) => b + 1 + i)
                    : Array.from({ length: b }, (_, i) => i);
            } // 0 → over: [1..9], under: []; 9 → over: [], under: [0..8]
            case 'matchdiff': {
                const b = parseInt(barrierDigit) || 5;
                return direction === 'match' ? [b] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => d !== b);
            }
            case 'risefall':
                return []; // Rise/Fall not digit-based
            default:
                return [];
        }
    };
    const winningDigits = getWinningDigits();

    // Entry vs current tick display helpers
    const ticksBehind = useMemo(() => {
        if (!entryTickEpoch || ticksArrayRef.current.length === 0) return 0;
        const last = ticksArrayRef.current[ticksArrayRef.current.length - 1];
        return Math.max(0, Math.round(last.epoch - entryTickEpoch));
    }, [entryTickEpoch, lastDigit, tickHistory.length]);

    const ticksBehindDisplay = ticksBehind > 0
        ? `Trade entered ${ticksBehind} tick${ticksBehind > 1 ? 's' : ''} ago — settles on the next tick after entry`
        : 'Ready — trade enters on the next tick after you press Start';

    return (
        <div className='bulk-trader'>
            {/* Header */}
            <div className='bulk-trader-header'>
                <h2 className='bulk-trader-title'>Bulk Trader</h2>
            </div>

            {/* Market & Trade Type Selectors */}
            <div className='bulk-trader-controls'>
                <div className='control-group'>
                    <label className='control-label'>MARKET</label>
                    <select
                        className='market-select'
                        value={selectedMarket}
                        onChange={(e) => {
                            setSelectedMarket(e.target.value);
                            setIsApiReady(false);
                        }}
                    >
                        {MARKET_OPTIONS.map((market) => (
                            <option key={market.value} value={market.value}>
                                {market.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className='control-group'>
                    <label className='control-label'>TRADE TYPE</label>
                    <select
                        className='trade-type-select'
                        value={tradeType}
                        onChange={(e) => {
                            const newType = e.target.value;
                            setTradeType(newType);
                            const options = DIRECTION_OPTIONS[newType];
                            if (options && options.length > 0) {
                                setDirection(options[0].value);
                            }
                        }}
                    >
                        {TRADE_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className='control-group'>
                    <label className='control-label'>DIRECTION</label>
                    <select
                        className='direction-select'
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                    >
                        {DIRECTION_OPTIONS[tradeType]?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Digit selector for Over/Under and Match/Differ */}
                {['overunder', 'matchdiff'].includes(tradeType) && (
                    <div className='control-group'>
                        <label className='control-label'>DIGIT</label>
                        <select
                            className='digit-select'
                            value={barrierDigit}
                            onChange={(e) => setBarrierDigit(e.target.value)}
                        >
                            {(tradeType === 'overunder'
                                ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
                                : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
                            ).map((d) => (
                                <option key={d} value={String(d)}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className='control-group'>
                    <label className='control-label'>NUMBER OF TICKS TO SCAN</label>
                    <input
                        type='number'
                        className='ticks-input'
                        value={tickCount}
                        onChange={(e) => {
                            const val = Math.max(100, Math.min(1000, parseInt(e.target.value) || 1000));
                            setTickCount(val);
                            setIsApiReady(false);
                        }}
                        min={100}
                        max={1000}
                    />
                </div>
            </div>

            {/* Entry Tick (stored tick the trade is bound to) and Current Tick */}
            <div className='tick-pair'>
                <div className='current-tick entry-tick'>
                    <span className='current-tick-label'>ENTRY TICK</span>
                    <span className='current-tick-value entry-tick-value'>{entryTickQuote || '--'}</span>
                    <span className='entry-tick-detail'>Entry digit {entryTickQuote ? entryTickDigit : '–'} • {entryTickEpoch ? `Epoch ${entryTickEpoch}` : '–'}</span>
                </div>
                <div className='current-tick'>
                    <span className='current-tick-label'>CURRENT TICK</span>
                    <span className='current-tick-value'>{livePrice}</span>
                    <span className='entry-tick-detail'>{ticksBehindDisplay}</span>
                </div>
            </div>

            {/* Digit Circles - D Circle style highlighting */}
            <div className='digit-circles-grid'>
                {[0, 1, 2, 3, 4].map((digit) => {
                    const isCurrent = lastDigit === digit;
                    const isWinning = winningDigits.includes(digit);
                    const isBarrier = barrierDigit === String(digit);
                    return (
                        <div
                            key={digit}
                            className={classNames('digit-circle', {
                                'digit-circle--active': isCurrent,
                                'digit-circle--winning': isWinning && !isCurrent,
                                'digit-circle--barrier': isBarrier && !isCurrent,
                            })}
                            style={{
                                borderColor: isCurrent
                                    ? '#FF1744'
                                    : isBarrier
                                    ? '#FF9800'
                                    : isWinning
                                    ? '#4CAF50'
                                    : DIGIT_COLORS[digit],
                                borderWidth: isCurrent ? '3px' : '2px',
                                boxShadow: isCurrent
                                    ? '0 0 12px rgba(255, 23, 68, 0.5)'
                                    : isWinning || isBarrier
                                    ? '0 0 10px rgba(74, 107, 255, 0.4)'
                                    : '0 0 8px rgba(74, 107, 255, 0.2)',
                            }}
                        >
                            <span className='digit-value'>{digit}</span>
                            <span className='digit-pct'>{digitPercentages[digit]?.toFixed(2) || '0.00'}%</span>
                        </div>
                    );
                })}
                {[5, 6, 7, 8, 9].map((digit) => {
                    const isCurrent = lastDigit === digit;
                    const isWinning = winningDigits.includes(digit);
                    const isBarrier = barrierDigit === String(digit);
                    return (
                        <div
                            key={digit}
                            className={classNames('digit-circle', {
                                'digit-circle--active': isCurrent,
                                'digit-circle--winning': isWinning && !isCurrent,
                                'digit-circle--barrier': isBarrier && !isCurrent,
                            })}
                            style={{
                                borderColor: isCurrent
                                    ? '#FF1744'
                                    : isBarrier
                                    ? '#FF9800'
                                    : isWinning
                                    ? '#4CAF50'
                                    : DIGIT_COLORS[digit],
                                borderWidth: isCurrent ? '3px' : '2px',
                                boxShadow: isCurrent
                                    ? '0 0 12px rgba(255, 23, 68, 0.5)'
                                    : isWinning || isBarrier
                                    ? '0 0 10px rgba(74, 107, 255, 0.4)'
                                    : '0 0 8px rgba(74, 107, 255, 0.2)',
                            }}
                        >
                            <span className='digit-value'>{digit}</span>
                            <span className='digit-pct'>{digitPercentages[digit]?.toFixed(2) || '0.00'}%</span>
                        </div>
                    );
                })}
            </div>
            <div className='digit-legend'>
                {tradeType === 'evenodd' && (
                    <span className='legend-item'>● Winning digits highlighted in green</span>
                )}
                {['overunder', 'matchdiff'].includes(tradeType) && (
                    <>
                        <span className='legend-item'>🟠 Selected digit: {barrierDigit}</span>
                        <span className='legend-item'>● Winning digits highlighted in green</span>
                    </>
                )}
                <span className='legend-item legend-current'>◆ Current digit: {lastDigit}</span>
            </div>

            {/* Tick History */}
            <div className='tick-history-row'>
                {tickHistory.slice(-10).map((digit, idx) => (
                    <span
                        key={idx}
                        className={classNames('tick-badge', {
                            'tick-badge--even': parseInt(digit) % 2 === 0,
                            'tick-badge--odd': parseInt(digit) % 2 !== 0,
                        })}
                    >
                        {digit}
                    </span>
                ))}
            </div>

            {/* Stake & Trades Controls */}
            <div className='trade-controls'>
                <div className='control-group'>
                    <label className='control-label'>DURATION (TICKS)</label>
                    <input
                        type='number'
                        className='small-input'
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        min='1'
                        max='10'
                    />
                </div>
                <div className='control-group'>
                    <label className='control-label'>STAKE</label>
                    <input
                        type='number'
                        className='small-input'
                        value={stake}
                        onChange={(e) => setStake(e.target.value)}
                        min='0.1'
                        step='0.1'
                    />
                </div>
                <div className='control-group'>
                    <label className='control-label'>NO OF TRADES</label>
                    <input
                        type='number'
                        className='small-input'
                        value={numTrades}
                        onChange={(e) => setNumTrades(e.target.value)}
                        min='1'
                        max='100'
                    />
                </div>
            </div>

            {/* Start/Stop Button */}
            <div className='bulk-trader-actions'>
                {!isRunning ? (
                    <button
                        className='start-btn'
                        onClick={handleStart}
                        disabled={!client.is_logged_in}
                    >
                        {isLoading ? '⏳ Connecting...' : '🚀 START BULK TRADE'}
                    </button>
                ) : (
                    <button className='stop-btn' onClick={handleStop}>
                        ⬛ STOP
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className='trade-stats'>
                <div className='stat-item'>
                    <span className='stat-label'>Total Stake</span>
                    <span className='stat-value'>{totalStake.toFixed(2)} {client.currency || 'USD'}</span>
                </div>
                <div className='stat-item'>
                    <span className='stat-label'>Total Payout</span>
                    <span className='stat-value'>{totalPayout.toFixed(2)} {client.currency || 'USD'}</span>
                </div>
                <div className='stat-item'>
                    <span className='stat-label'>Won</span>
                    <span className='stat-value stat-value--win'>{wonTrades}</span>
                </div>
                <div className='stat-item'>
                    <span className='stat-label'>Lost</span>
                    <span className='stat-value stat-value--loss'>{lostTrades}</span>
                </div>
                <div className='stat-item'>
                    <span className='stat-label'>Profit</span>
                    <span className='stat-value stat-value--profit'>+{totalProfit.toFixed(2)} {client.currency || 'USD'}</span>
                </div>
                <div className='stat-item'>
                    <span className='stat-label'>Loss</span>
                    <span className='stat-value stat-value--loss-stat'>-{totalLoss.toFixed(2)} {client.currency || 'USD'}</span>
                </div>
            </div>

            {/* Messages */}
            {errorMessage && (
                <div className='bulk-trader-error'>
                    ⚠️ {errorMessage}
                </div>
            )}
            {!client.is_logged_in && (
                <div className='bulk-trader-warning'>
                    Please log in to start trading.
                </div>
            )}
            {client.is_logged_in && !isApiReady && !isLoading && !errorMessage && (
                <div className='bulk-trader-warning'>
                    Connecting to market data... Please wait.
                </div>
            )}
            {isLoading && (
                <div className='bulk-trader-loading'>Loading ticks...</div>
            )}
        </div>
    );
};

export default observer(BulkTrader);
