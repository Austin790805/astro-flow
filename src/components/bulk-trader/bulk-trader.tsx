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

type TickData = {
    quote: string;
    epoch: number;
};

const BulkTrader: React.FC = () => {
    const { client } = useStore();
    const [selectedMarket, setSelectedMarket] = useState('1HZ100V');
    const [tradeType, setTradeType] = useState('evenodd');
    const [tickCount, setTickCount] = useState(1000);
    const [stake, setStake] = useState('0.5');
    const [numTrades, setNumTrades] = useState('1');
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
    const [tradesExecuted, setTradesExecuted] = useState(0);

    const subscriptionIdRef = useRef<string | null>(null);
    const ticksArrayRef = useRef<TickData[]>([]);
    const openContractsRef = useRef<Map<string, any>>(new Map());
    const runIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const fetchTicks = useCallback(async () => {
        if (!client.is_logged_in) {
            setIsConnected(false);
            return;
        }

        setIsLoading(true);
        try {
            if (subscriptionIdRef.current && api_base.api) {
                try {
                    await api_base.api.forget(subscriptionIdRef.current);
                } catch (e) {}
                subscriptionIdRef.current = null;
            }

            const response = await api_base.api?.send({
                ticks_history: selectedMarket,
                subscribe: 1,
                end: 'latest',
                count: tickCount,
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
                } else if (resp.tick) {
                    tickData = [{ quote: String(resp.tick.quote), epoch: resp.tick.epoch }];
                    subscriptionIdRef.current = resp.tick.id || null;
                }

                if (tickData.length > 0) {
                    ticksArrayRef.current = tickData;
                    analyzeDigits(tickData);
                    setIsConnected(true);
                }
            }
        } catch (error) {
            console.error('Error fetching ticks:', error);
            setIsConnected(false);
        }
        setIsLoading(false);
    }, [selectedMarket, tickCount, client.is_logged_in, analyzeDigits]);

    // Subscribe to real-time tick updates
    useEffect(() => {
        if (!client.is_logged_in || !api_base.api) return;

        fetchTicks();

        const messageSubscription = api_base.api.onMessage().subscribe(({ data }: any) => {
            if (data?.msg_type === 'tick' && data.tick?.symbol === selectedMarket) {
                const newTick: TickData = {
                    quote: String(data.tick.quote),
                    epoch: data.tick.epoch,
                };

                if (data.tick.id) {
                    subscriptionIdRef.current = data.tick.id;
                }

                const prevTicks = ticksArrayRef.current;
                const updatedTicks = [...prevTicks, newTick];
                if (updatedTicks.length > tickCount) {
                    updatedTicks.splice(0, updatedTicks.length - tickCount);
                }
                ticksArrayRef.current = updatedTicks;
                analyzeDigits(updatedTicks);
            }

            // Handle contract updates
            if (data?.msg_type === 'proposal_open_contract') {
                const poc = data.proposal_open_contract;
                if (poc && poc.contract_id) {
                    const existing = openContractsRef.current.get(poc.contract_id);
                    if (poc.is_sold) {
                        if (existing) {
                            const profit = parseFloat(poc.profit) || 0;
                            setTotalPayout(prev => prev + parseFloat(poc.sell_price) || 0);
                            if (profit > 0) {
                                setWonTrades(prev => prev + 1);
                            } else {
                                setLostTrades(prev => prev + 1);
                            }
                        }
                        openContractsRef.current.delete(poc.contract_id);
                    } else {
                        openContractsRef.current.set(poc.contract_id, poc);
                    }
                    setTradesExecuted(openContractsRef.current.size);
                }
            }
        });

        return () => {
            messageSubscription.unsubscribe();
            if (subscriptionIdRef.current && api_base.api) {
                api_base.api.forget(subscriptionIdRef.current).catch(() => {});
            }
        };
    }, [selectedMarket, tickCount, client.is_logged_in, fetchTicks, analyzeDigits]);

    // Re-fetch when market or tick count changes
    useEffect(() => {
        if (client.is_logged_in) {
            fetchTicks();
        }
    }, [selectedMarket, tickCount, client.is_logged_in, fetchTicks]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (runIntervalRef.current) {
                clearInterval(runIntervalRef.current);
            }
        };
    }, []);

    const getContractType = (tradeType: string, direction: string): string => {
        switch (tradeType) {
            case 'evenodd':
                return direction === 'even' ? 'DIGITEVEN' : 'DIGITODD';
            case 'overunder':
                return direction === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
            case 'matchdiff':
                return direction === 'match' ? 'DIGITMATCH' : 'DIGITDIFF';
            case 'risefall':
                return direction === 'rise' ? 'CALL' : 'PUT';
            default:
                return 'DIGITEVEN';
        }
    };

    const executeTrade = useCallback(async (contractType: string, direction: string) => {
        if (!client.is_logged_in || !api_base.api) return;

        const stakeAmount = parseFloat(stake);
        const numTradesInt = parseInt(numTrades) || 1;

        try {
            // Buy multiple contracts
            for (let i = 0; i < numTradesInt; i++) {
                const buyRequest: any = {
                    buy: 1,
                    price: stakeAmount,
                    parameters: {
                        amount: stakeAmount,
                        basis: 'stake',
                        contract_type: contractType,
                        currency: client.currency,
                        duration: 1,
                        duration_unit: 't',
                        symbol: selectedMarket,
                    },
                };

                if (tradeType === 'overunder') {
                    buyRequest.parameters.barrier = lastDigit.toString();
                } else if (tradeType === 'matchdiff') {
                    buyRequest.parameters.barrier = lastDigit.toString();
                }

                const response = await api_base.api.send(buyRequest);
                if (response) {
                    const resp = response as any;
                    if (resp.buy) {
                        // Subscribe to contract updates
                        if (resp.buy.contract_id) {
                            await api_base.api.send({
                                proposal_open_contract: 1,
                                subscribe: 1,
                                contract_id: resp.buy.contract_id,
                            });
                        }
                    }
                }

                // Small delay between trades
                if (i < numTradesInt - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            setTotalStake(prev => prev + stakeAmount * numTradesInt);
        } catch (error) {
            console.error('Error executing trade:', error);
        }
    }, [client.is_logged_in, client.currency, stake, numTrades, selectedMarket, tradeType, lastDigit]);

    const handleTradeClick = useCallback((direction: string) => {
        if (isRunning) return;
        setIsRunning(true);

        const contractType = getContractType(tradeType, direction);
        executeTrade(contractType, direction);

        // Stop running after a short delay
        setTimeout(() => {
            setIsRunning(false);
        }, 500);
    }, [isRunning, tradeType, executeTrade]);

    const handleStopTrading = () => {
        setIsRunning(false);
        if (runIntervalRef.current) {
            clearInterval(runIntervalRef.current);
            runIntervalRef.current = null;
        }
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
                        onChange={(e) => setSelectedMarket(e.target.value)}
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
                        onChange={(e) => setTradeType(e.target.value)}
                    >
                        {TRADE_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className='control-group'>
                    <label className='control-label'>NUMBER OF TICKS</label>
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
                    <label className='control-label'>TICKS</label>
                    <input type='number' className='small-input' value={1} readOnly />
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

            {/* Trade Buttons */}
            <div className='trade-buttons'>
                {tradeType === 'evenodd' && (
                    <>
                        <button
                            className={classNames('trade-btn', 'trade-btn--even', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('even')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Even</span>
                            <span className='trade-btn-pct'>{evenPercentage.toFixed(2)}%</span>
                        </button>
                        <button
                            className={classNames('trade-btn', 'trade-btn--odd', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('odd')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Odd</span>
                            <span className='trade-btn-pct'>{oddPercentage.toFixed(2)}%</span>
                        </button>
                    </>
                )}
                {tradeType === 'overunder' && (
                    <>
                        <button
                            className={classNames('trade-btn', 'trade-btn--over', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('over')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Over {lastDigit}</span>
                            <span className='trade-btn-pct'>{digitPercentages.slice(lastDigit + 1).reduce((a, b) => a + b, 0).toFixed(2)}%</span>
                        </button>
                        <button
                            className={classNames('trade-btn', 'trade-btn--under', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('under')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Under {lastDigit}</span>
                            <span className='trade-btn-pct'>{digitPercentages.slice(0, lastDigit).reduce((a, b) => a + b, 0).toFixed(2)}%</span>
                        </button>
                    </>
                )}
                {tradeType === 'matchdiff' && (
                    <>
                        <button
                            className={classNames('trade-btn', 'trade-btn--match', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('match')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Match {lastDigit}</span>
                            <span className='trade-btn-pct'>{digitPercentages[lastDigit]?.toFixed(2) || '0.00'}%</span>
                        </button>
                        <button
                            className={classNames('trade-btn', 'trade-btn--diff', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('diff')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Differ {lastDigit}</span>
                            <span className='trade-btn-pct'>{(100 - (digitPercentages[lastDigit] || 0)).toFixed(2)}%</span>
                        </button>
                    </>
                )}
                {tradeType === 'risefall' && (
                    <>
                        <button
                            className={classNames('trade-btn', 'trade-btn--rise', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('rise')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Rise</span>
                            <span className='trade-btn-pct'>{risePercentage.toFixed(2)}%</span>
                        </button>
                        <button
                            className={classNames('trade-btn', 'trade-btn--fall', { 'trade-btn--running': isRunning })}
                            onClick={() => handleTradeClick('fall')}
                            disabled={isRunning || !client.is_logged_in}
                        >
                            <span className='trade-btn-label'>Fall</span>
                            <span className='trade-btn-pct'>{fallPercentage.toFixed(2)}%</span>
                        </button>
                    </>
                )}
            </div>

            {/* Stop Button */}
            {isRunning && (
                <button className='stop-btn' onClick={handleStopTrading}>
                    ⬛ STOP
                </button>
            )}

            {/* Stats */}
            <div className='trade-stats'>
                <div className='stat-item'>
                    <span className='stat-label'>Total Stake</span>
                    <span className='stat-value'>{totalStake.toFixed(2)} {client.currency}</span>
                </div>
                <div className='stat-item'>
                    <span className='stat-label'>Total Payout</span>
                    <span className='stat-value'>{totalPayout.toFixed(2)} {client.currency}</span>
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
