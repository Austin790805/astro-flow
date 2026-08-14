import React, { useState, useEffect, useCallback, useRef } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
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

const BulkTrader: React.FC = () => {
    const { client } = useStore();
    const [selectedMarket, setSelectedMarket] = useState('1HZ100V');
    const [tradeType, setTradeType] = useState('evenodd');
    const [direction, setDirection] = useState('odd');
    const [tickCount, setTickCount] = useState(1000);
    const [stake, setStake] = useState('5');
    const [numTrades, setNumTrades] = useState('10');
    const [ticks, setTicks] = useState<TickData[]>([]);
    const [livePrice, setLivePrice] = useState<string>('--');
    const [digitPercentages, setDigitPercentages] = useState<number[]>(Array(10).fill(0));
    const [tickHistory, setTickHistory] = useState<string[]>([]);
    const [lastDigit, setLastDigit] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [totalStake, setTotalStake] = useState(0);
    const [totalPayout, setTotalPayout] = useState(0);
    const [wonTrades, setWonTrades] = useState(0);
    const [lostTrades, setLostTrades] = useState(0);
    const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
    const [batchCount, setBatchCount] = useState(0);

    const subscriptionIdRef = useRef<string | null>(null);
    const ticksArrayRef = useRef<TickData[]>([]);
    const openContractsRef = useRef<Map<string, TradeRecord>>(new Map());
    const currentBatchContractsRef = useRef<Set<string>>(new Set());
    const isRunningRef = useRef(false);
    const contractUpdateSubscriptionRef = useRef<any>(null);
    const tickSubscriptionRef = useRef<any>(null);

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
    }, [getLastDigit]);

    const subscribeToTicks = useCallback(async () => {
        if (!client.is_logged_in || !api_base.api) return;

        setIsLoading(true);
        try {
            // Unsubscribe from previous tick subscription
            if (subscriptionIdRef.current) {
                api_base.api.send({ forget: subscriptionIdRef.current }).catch(() => {});
                subscriptionIdRef.current = null;
            }

            const response = await api_base.api.send({
                ticks_history: selectedMarket,
                subscribe: 1,
                end: 'latest',
                count: tickCount,
                style: 'ticks',
            }) as any;

            if (response) {
                let tickData: TickData[] = [];

                if (response.ticks_history && Array.isArray(response.ticks_history)) {
                    tickData = response.ticks_history.map((t: any) => ({
                        quote: String(t.quote),
                        epoch: t.epoch,
                    }));
                    subscriptionIdRef.current = response.subscription?.id || null;
                } else if (response.tick) {
                    tickData = [{ quote: String(response.tick.quote), epoch: response.tick.epoch }];
                    subscriptionIdRef.current = response.subscription?.id || response.tick.id || null;
                }

                if (tickData.length > 0) {
                    ticksArrayRef.current = tickData;
                    analyzeDigits(tickData);
                    setIsConnected(true);
                }
            }
        } catch (error) {
            console.error('Error subscribing to ticks:', error);
            setIsConnected(false);
        }
        setIsLoading(false);
    }, [selectedMarket, tickCount, client.is_logged_in, analyzeDigits]);

    // Subscribe to contract updates (proposal_open_contract stream)
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;

        subscribeToTicks();

        // Subscribe to contract updates via proposal_open_contract stream
        const contractSub = api_base.api.send({
            proposal_open_contract: 1,
            subscribe: 1,
        }) as any;

        contractSub.then((resp: any) => {
            if (resp?.subscription?.id) {
                tickSubscriptionRef.current = resp.subscription.id;
            }
        }).catch(() => {});

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

            // Handle contract updates
            if (data?.msg_type === 'proposal_open_contract') {
                const poc = data.proposal_open_contract;
                if (poc && poc.contract_id && currentBatchContractsRef.current.has(poc.contract_id)) {
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

                            // Update trade history
                            setTradeHistory(prev => [...prev, { ...record }]);
                            setTotalPayout(prev => prev + sellPrice);
                            if (profit > 0) {
                                setWonTrades(prev => prev + 1);
                            } else {
                                setLostTrades(prev => prev + 1);
                            }
                        }

                        // Check if batch is complete
                        if (currentBatchContractsRef.current.size === 0 && isRunningRef.current) {
                            // Batch complete - continue if still running
                            // The bot will automatically start next batch on the next tick
                        }
                    }
                }
            }
        });

        return () => {
            messageSubscription.unsubscribe();
            contractSub?.then?.((sub: any) => {
                if (sub?.subscription?.id && api_base.api) {
                    api_base.api.send({ forget: sub.subscription.id }).catch(() => {});
                }
            });
            if (subscriptionIdRef.current && api_base.api) {
                api_base.api.send({ forget: subscriptionIdRef.current }).catch(() => {});
            }
        };
    }, [selectedMarket, tickCount, client.is_logged_in, subscribeToTicks, analyzeDigits]);

    // Re-subscribe when market or tick count changes
    useEffect(() => {
        if (client.is_logged_in && !isRunning) {
            subscribeToTicks();
        }
    }, [selectedMarket, tickCount, client.is_logged_in]);

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

    const executeBatch = useCallback(async () => {
        if (!client.is_logged_in || !api_base.api) return;

        const stakeAmount = parseFloat(stake) || 0.5;
        const numTradesInt = parseInt(numTrades) || 1;
        const contractType = getContractType(direction);
        const totalBatchStake = stakeAmount * numTradesInt;

        // Mark as running
        isRunningRef.current = true;
        setIsRunning(true);
        setBatchCount(prev => prev + 1);

        // Update total stake
        setTotalStake(prev => prev + totalBatchStake);

        try {
            // Buy all contracts simultaneously
            const buyRequests = [];
            for (let i = 0; i < numTradesInt; i++) {
                const buyRequest: any = {
                    buy: 1,
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

                // Add barrier for digit contracts
                if (['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(contractType)) {
                    buyRequest.parameters.barrier = lastDigit.toString();
                }

                buyRequests.push(buyRequest);
            }

            // Send all buy requests simultaneously (instant execution, zero delay)
            const buyPromises = buyRequests.map(req => api_base.api!.send(req));
            const responses = await Promise.all(buyPromises);

            // Track all contracts in this batch
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
                } else if (response?.error) {
                    console.error('Buy error:', response.error);
                    setLostTrades(prev => prev + 1);
                }
            });

        } catch (error) {
            console.error('Error executing batch:', error);
        }
    }, [client.is_logged_in, client.currency, stake, numTrades, direction, tradeType, lastDigit, selectedMarket]);

    const handleStart = useCallback(() => {
        if (!client.is_logged_in || !api_base.api) return;
        executeBatch();
    }, [client.is_logged_in, executeBatch]);

    const handleStop = useCallback(() => {
        isRunningRef.current = false;
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
        openContractsRef.current.clear();
        currentBatchContractsRef.current.clear();
        handleStop();
    };

    // Calculate Even/Odd percentages
    const evenPercentage = digitPercentages.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    const oddPercentage = digitPercentages.filter((_, i) => i % 2 !== 0).reduce((a, b) => a + b, 0);

    // Calculate Rise/Fall
    const riseCount = ticks.filter((_, i) => i > 0 && parseFloat(ticks[i].quote) > parseFloat(ticks[i - 1].quote)).length;
    const fallCount = ticks.filter((_, i) => i > 0 && parseFloat(ticks[i].quote) < parseFloat(ticks[i - 1].quote)).length;
    const totalMoves = riseCount + fallCount;
    const risePercentage = totalMoves > 0 ? (riseCount / totalMoves) * 100 : 0;
    const fallPercentage = totalMoves > 0 ? (fallCount / totalMoves) * 100 : 0;

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
                            handleStop();
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
                            // Reset direction to first option of new type
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

                <div className='control-group'>
                    <label className='control-label'>NUMBER OF TICKS TO SCAN</label>
                    <input
                        type='number'
                        className='ticks-input'
                        value={tickCount}
                        onChange={(e) => setTickCount(Math.max(100, Math.min(1000, parseInt(e.target.value) || 1000)))}
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

            {/* Digit Circles */}
            <div className='digit-circles-grid'>
                {[0, 1, 2, 3, 4].map((digit) => (
                    <div
                        key={digit}
                        className={classNames('digit-circle', { 'digit-circle--active': lastDigit === digit })}
                    >
                        <span className='digit-value'>{digit}</span>
                        <span className='digit-pct'>{digitPercentages[digit]?.toFixed(2) || '0.00'}%</span>
                    </div>
                ))}
                {[5, 6, 7, 8, 9].map((digit) => (
                    <div
                        key={digit}
                        className={classNames('digit-circle', { 'digit-circle--active': lastDigit === digit })}
                    >
                        <span className='digit-value'>{digit}</span>
                        <span className='digit-pct'>{digitPercentages[digit]?.toFixed(2) || '0.00'}%</span>
                    </div>
                ))}
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

            {/* Start/Stop Button */}
            <div className='bulk-trader-actions'>
                {!isRunning ? (
                    <button
                        className='start-btn'
                        onClick={handleStart}
                        disabled={!client.is_logged_in || !isConnected}
                    >
                        🚀 START BULK TRADE
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
            {tradeHistory.length > 0 && (
                <div className='trade-history'>
                    <div className='trade-history-header'>
                        <h3 className='trade-history-title'>Trade History ({tradeHistory.length})</h3>
                        <button className='reset-btn' onClick={handleReset}>
                            🔄 Reset
                        </button>
                    </div>
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

            {/* Warnings */}
            {!client.is_logged_in && (
                <div className='bulk-trader-warning'>
                    Please log in to start trading.
                </div>
            )}
            {client.is_logged_in && !isConnected && !isLoading && (
                <div className='bulk-trader-warning'>
                    Waiting for market data...
                </div>
            )}
            {isLoading && (
                <div className='bulk-trader-loading'>Loading ticks...</div>
            )}
        </div>
    );
};

export default observer(BulkTrader);
