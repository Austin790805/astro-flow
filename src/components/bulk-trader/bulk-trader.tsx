import React, { useState, useEffect, useCallback, useRef } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import { useApiBase } from '@/hooks/useApiBase';
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
};

type RunRecord = {
    runNumber: number;
    contractType: string;
    direction: string;
    barrier: string | null;
    numTrades: number;
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
    const [isLoading, setIsLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [totalStake, setTotalStake] = useState(0);
    const [totalPayout, setTotalPayout] = useState(0);
    const [wonTrades, setWonTrades] = useState(0);
    const [lostTrades, setLostTrades] = useState(0);
    const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
    const [batchCount, setBatchCount] = useState(0);
    const [isApiReady, setIsApiReady] = useState(false);
    const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const { isAuthorized, connectionStatus } = useApiBase();

    const subscriptionIdRef = useRef<string | null>(null);
    const ticksArrayRef = useRef<TickData[]>([]);
    const openContractsRef = useRef<Map<string, TradeRecord>>(new Map());
    const currentBatchContractsRef = useRef<Set<string>>(new Set());
    const contractSubIdRef = useRef<string | null>(null);

    const getLastDigit = useCallback((quote: string): number => {
        const quoteStr = quote.replace('.', '');
        return parseInt(quoteStr.charAt(quoteStr.length - 1));
    }, []);

    const analyzeDigits = useCallback((tickData: TickData[]) => {
        if (tickData.length === 0) return;

        const digitCounts = Array(10).fill(0);
        const history: string[] = [];

        tickData.forEach((tick) => {
            const digit = getLastDigit(tick.quote);
            digitCounts[digit]++;
            history.push(digit.toString());
        });

        const total = tickData.length;
        const percentages = digitCounts.map((count) => (count / total) * 100);
        const lastTick = tickData[tickData.length - 1];
        const lastD = getLastDigit(lastTick.quote);

        setDigitPercentages(percentages);
        setTickHistory(history);
        setLastDigit(lastD);
        setTicks(tickData);
        setLivePrice(lastTick.quote);
        setIsApiReady(true);
    }, [getLastDigit]);

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
                    await api_base.api.forget(subscriptionIdRef.current);
                } catch { /* ignore */ }
                subscriptionIdRef.current = null;
            }

            const response = await api_base.api?.send({
                ticks_history: selectedMarket,
                subscribe: 1,
                end: 'latest',
                count: Math.min(tickCount, 1000),
                style: 'ticks',
            });

            if (response) {
                const resp = response as any;
                let tickData: TickData[] = [];

                if (resp.ticks_history && Array.isArray(resp.ticks_history)) {
                    tickData = resp.ticks_history.map((t: any) => ({
                        quote: String(t.quote),
                        epoch: t.epoch,
                    }));
                    subscriptionIdRef.current = resp.subscription?.id || null;
                } else if (resp.tick) {
                    tickData = [{ quote: String(resp.tick.quote), epoch: resp.tick.epoch }];
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
    }, [selectedMarket, tickCount, client.is_logged_in, analyzeDigits, getLastDigit, tradeType]);

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
            if (data?.msg_type === 'tick' && data.tick?.symbol === selectedMarket) {
                const newTick: TickData = {
                    quote: String(data.tick.quote),
                    epoch: data.tick.epoch,
                };

                if (data.subscription?.id) {
                    subscriptionIdRef.current = data.subscription.id;
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
                if (poc && poc.contract_id && openContractsRef.current.has(poc.contract_id)) {
                    if (poc.is_sold) {
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
                            // Update run history result
                            setRunHistory(prev => prev.map(run => {
                                if (run.runNumber !== batchCount || !run.results.some(r => r.contractId === poc.contract_id)) {
                                    return run;
                                }
                                return {
                                    ...run,
                                    results: run.results.map(r =>
                                        r.contractId === poc.contract_id
                                            ? { ...r, profit, status: profit > 0 ? 'won' : 'lost', sellPrice }
                                            : r
                                    ),
                                };
                            }));
                            setTotalPayout(prev => prev + sellPrice);
                            if (profit > 0) {
                                setWonTrades(prev => prev + 1);
                            } else {
                                setLostTrades(prev => prev + 1);
                            }
                        }

                        // Check if batch is complete
                        if (currentBatchContractsRef.current.size === 0) {
                            setIsRunning(false);
                        }
                    }
                }
            }
        });

        return () => {
            messageSubscription.unsubscribe();
            if (contractSubIdRef.current) {
                api_base.api?.forget(contractSubIdRef.current).catch(() => {});
            }
            if (subscriptionIdRef.current) {
                api_base.api?.forget(subscriptionIdRef.current).catch(() => {});
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
        if (connectionStatus !== 'opened') {
            setErrorMessage('Not connected to server. Please wait...');
            return;
        }
        if (!isAuthorized) {
            setErrorMessage('Account not authorized. Please wait...');
            return;
        }

        const stakeAmount = parseFloat(stake) || 0.5;
        const numTradesInt = parseInt(numTrades) || 1;
        const contractType = getContractType(direction);
        const totalBatchStake = stakeAmount * numTradesInt;
        const barrier = getBarrierDigit();
        const currentRunNumber = batchCount + 1;

        // Validate barrier for digit contracts
        if (['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(contractType) && !barrier) {
            setErrorMessage('Please select a barrier digit');
            return;
        }

        setIsRunning(true);
        setBatchCount(currentRunNumber);
        setErrorMessage('');
        setTotalStake(prev => prev + totalBatchStake);

        // Create run history record
        const runRecord: RunRecord = {
            runNumber: currentRunNumber,
            contractType,
            direction,
            barrier: barrier || null,
            numTrades: numTradesInt,
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
                        duration: 1,
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

            // Send all buy requests simultaneously with retry logic (zero delay between requests)
            const buyPromises = buyRequests.map(async (req) => {
                let lastError: any = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const response = await api_base.api.send(req);
                        return response;
                    } catch (error: any) {
                        lastError = error;
                        // Retry on PriceMoved or temporary failures
                        if (error?.error?.code !== 'PriceMoved' && attempt < 2) {
                            break; // Don't retry on permanent errors
                        }
                        // Wait briefly before retrying (100ms)
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                throw lastError;
            });
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
    }, [client.is_logged_in, client.currency, stake, numTrades, direction, tradeType, barrierDigit, selectedMarket, batchCount]);

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
        setTradeHistory([]);
        setBatchCount(0);
        setRunHistory([]);
        setErrorMessage('');
        openContractsRef.current.clear();
        currentBatchContractsRef.current.clear();
        handleStop();
    };

    const handleResetHistory = () => {
        setTradeHistory([]);
        setRunHistory([]);
        setTotalStake(0);
        setTotalPayout(0);
        setWonTrades(0);
        setLostTrades(0);
        setBatchCount(0);
    };

    // Calculate Even/Odd percentages
    const evenPercentage = digitPercentages.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    const oddPercentage = digitPercentages.filter((_, i) => i % 2 !== 0).reduce((a, b) => a + b, 0);

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
    const evenPercentage = digitPercentages.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    const oddPercentage = digitPercentages.filter((_, i) => i % 2 !== 0).reduce((a, b) => a + b, 0);

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

            {/* Current Tick */}
            <div className='current-tick'>
                <span className='current-tick-label'>CURRENT TICK</span>
                <span className='current-tick-value'>{livePrice}</span>
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
                    <label className='control-label'>DURATION</label>
                    <input type='text' className='small-input' value='1 Tick' readOnly />
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

            {/* Start/Stop Button - only disabled when NOT logged in */}
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
            </div>

            {/* Trade History */}
            {(tradeHistory.length > 0 || runHistory.length > 0) && (
                <div className='trade-history'>
                    <div className='trade-history-header'>
                        <h3 className='trade-history-title'>Trade History ({tradeHistory.length})</h3>
                        <button className='reset-btn' onClick={handleResetHistory}>
                            🔄 Reset History
                        </button>
                    </div>

                    {/* Run history */}
                    {runHistory.length > 0 && (
                        <div className='run-history-list'>
                            {runHistory.map((run) => {
                                const runResultTrades = tradeHistory.filter(t => {
                                    const rec = run.results.find(r => r.contractId === t.id);
                                    return !!rec;
                                });
                                const won = runResultTrades.filter(t => t.status === 'won').length;
                                const lost = runResultTrades.filter(t => t.status === 'lost').length;
                                const payout = runResultTrades.reduce((sum, t) => sum + t.sellPrice, 0);
                                const isComplete = runResultTrades.length === run.numTrades;
                                return (
                                    <div key={run.runNumber} className={classNames('run-history-item', { 'run-history-item--complete': isComplete })}>
                                        <div className='run-history-row'>
                                            <span className='run-history-num'>Run #{run.runNumber}</span>
                                            <span className='run-history-type'>{run.contractType} • {run.direction}</span>
                                            {run.barrier !== null && (
                                                <span className='run-history-barrier'>Digit {run.barrier}</span>
                                            )}
                                            <span className='run-history-count'>{runResultTrades.length}/{run.numTrades}</span>
                                            <span className='run-history-wl'>W:{won} L:{lost}</span>
                                            <span className={classNames('run-history-pnl', {
                                                'run-history-pnl--pos': payout - run.totalStake >= 0,
                                                'run-history-pnl--neg': payout - run.totalStake < 0,
                                            })}>
                                                Net: {(payout - run.totalStake) >= 0 ? '+' : ''}{(payout - run.totalStake).toFixed(2)} {client.currency || 'USD'}
                                            </span>
                                            <span className='run-history-time'>{new Date(run.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        {runResultTrades.length > 0 && (
                                            <div className='run-history-trades'>
                                                {runResultTrades.map((t, idx) => (
                                                    <span key={t.id} className={classNames('run-trade-chip', {
                                                        'run-trade-chip--won': t.status === 'won',
                                                        'run-trade-chip--lost': t.status === 'lost',
                                                    })}>
                                                        #{idx + 1} {t.profit > 0 ? '+' : ''}{t.profit.toFixed(2)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className='trade-history-list'>
                        {tradeHistory.map((trade, idx) => (
                            <div
                                key={trade.id}
                                className={classNames('trade-history-item', {
                                    'trade-history-item--won': trade.status === 'won',
                                    'trade-history-item--lost': trade.status === 'lost',
                                })}
                            >
                                <span className='trade-history-index'>#{idx + 1}</span>
                                <span className='trade-history-type'>{trade.contractType}</span>
                                <span className='trade-history-dir'>{trade.direction}</span>
                                <span className='trade-history-stake'>{trade.stake.toFixed(2)}</span>
                                <span className={classNames('trade-history-profit', {
                                    'trade-history-profit--positive': trade.profit > 0,
                                    'trade-history-profit--negative': trade.profit <= 0,
                                })}>
                                    {trade.profit > 0 ? '+' : ''}{trade.profit.toFixed(2)}
                                </span>
                                <span className={classNames('trade-history-status', {
                                    'trade-history-status--won': trade.status === 'won',
                                    'trade-history-status--lost': trade.status === 'lost',
                                })}>
                                    {trade.status === 'won' ? '✓' : '✗'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
