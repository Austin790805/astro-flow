import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import classNames from 'classnames';
import { getLastDigit, PIP_SIZE_BY_SYMBOL, formatQuote } from '@/utils/digit-analysis';
import './d-circle-analysis.scss';

// Available synthetic index markets
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

type TickData = {
    quote: string;
    epoch: number;
};

const DigitsCircles: React.FC<{ digitPercentages: number[]; lastDigit: number }> = ({
    digitPercentages,
    lastDigit,
}) => {
    // Uniform size for all digit circles
    const CIRCLE_SIZE = 64;

    // Ring colors matching the screenshot
    const colorMap: Record<number, string> = {
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

    return (
        <div className='digits-circles-container'>
            {/* Cursor indicator showing current highlighted digit */}
            <div className='digit-cursor-indicator'>
                <span className='cursor-label'>CURRENT DIGIT:</span>
                <span className='cursor-value'>{lastDigit}</span>
            </div>
            <div className='digits-row'>
                {[0, 1, 2, 3, 4].map((digit) => (
                    <div key={digit} className='digit-circle-wrapper' style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}>
                        <div
                            className={classNames('digit-ring', {
                                'digit-ring--active': digit === lastDigit,
                            })}
                            style={{
                                borderColor: digit === lastDigit ? '#FF1744' : colorMap[digit],
                                borderWidth: digit === lastDigit ? '3px' : '2px',
                            }}
                        >
                            <span className='digit-value'>{digit}</span>
                            <span className='digit-percentage'>{(digitPercentages[digit] ?? 0).toFixed(1)}%</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className='digits-row'>
                {[5, 6, 7, 8, 9].map((digit) => (
                    <div key={digit} className='digit-circle-wrapper' style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}>
                        <div
                            className={classNames('digit-ring', {
                                'digit-ring--active': digit === lastDigit,
                            })}
                            style={{
                                borderColor: digit === lastDigit ? '#FF1744' : colorMap[digit],
                                borderWidth: digit === lastDigit ? '3px' : '2px',
                            }}
                        >
                            <span className='digit-value'>{digit}</span>
                            <span className='digit-percentage'>{(digitPercentages[digit] ?? 0).toFixed(1)}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const OverUnderSection: React.FC<{
    digitPercentages: number[];
    tickHistory: string[];
}> = ({ digitPercentages, tickHistory }) => {
    const [threshold, setThreshold] = useState(4);
    const overPercent = digitPercentages.slice(threshold + 1).reduce((sum, p) => sum + (p || 0), 0);
    const underPercent = digitPercentages.slice(0, threshold).reduce((sum, p) => sum + (p || 0), 0);

    const recentTicks = tickHistory.slice(0, 12);

    return (
        <div className='analysis-section'>
            <div className='analysis-header'>
                <h3 className='analysis-title'>OVER / UNDER</h3>
                <span className='analysis-suggestion under-suggestion'>
                    {underPercent > overPercent ? `${Math.max(1, Math.round(underPercent / Math.max(1, overPercent)))}x Under` : `${Math.max(1, Math.round(overPercent / Math.max(1, underPercent)))}x Over`}
                </span>
            </div>
            <div className='digit-selector-row'>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <div
                        key={d}
                        className={classNames('digit-selector', { 'digit-selector--active': d === threshold })}
                        onClick={() => setThreshold(d)}
                    >
                        {d}
                    </div>
                ))}
            </div>
            <div className='progress-bars'>
                <div className='progress-row'>
                    <span className='progress-label over-label'>OVER</span>
                    <div className='progress-track'>
                        <div className='progress-fill over-fill' style={{ width: `${overPercent}%` }} />
                    </div>
                    <span className='progress-value'>{overPercent.toFixed(1)}%</span>
                </div>
                <div className='progress-row'>
                    <span className='progress-label under-label'>UNDER</span>
                    <div className='progress-track'>
                        <div className='progress-fill under-fill' style={{ width: `${underPercent}%` }} />
                    </div>
                    <span className='progress-value'>{underPercent.toFixed(1)}%</span>
                </div>
            </div>
            <div className='tick-history'>
                {recentTicks.map((tick, idx) => (
                    <div
                        key={idx}
                        className={classNames('tick-marker', {
                            'tick-marker--over': parseInt(tick) > threshold,
                            'tick-marker--under': parseInt(tick) <= threshold,
                        })}
                    >
                        {parseInt(tick) > threshold ? 'O' : 'U'}
                    </div>
                ))}
                {tickHistory.length > 12 && <div className='tick-more'>+ More</div>}
            </div>
        </div>
    );
};

const MatchDifferSection: React.FC<{
    digitPercentages: number[];
    tickHistory: string[];
}> = ({ digitPercentages, tickHistory }) => {
    const [referenceDigit, setReferenceDigit] = useState(5);
    const matchPercent = digitPercentages[referenceDigit] || 0;
    const differPercent = 100 - matchPercent;

    const recentTicks = tickHistory.slice(0, 12);

    return (
        <div className='analysis-section'>
            <div className='analysis-header'>
                <h3 className='analysis-title'>MATCH / DIFFER</h3>
                <span className='analysis-suggestion differ-suggestion'>
                    {differPercent > matchPercent ? `${Math.max(1, Math.round(differPercent / Math.max(1, matchPercent)))}x Differ` : `${Math.max(1, Math.round(matchPercent / Math.max(1, differPercent)))}x Match`}
                </span>
            </div>
            <div className='digit-selector-row'>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <div
                        key={d}
                        className={classNames('digit-selector', { 'digit-selector--active': d === referenceDigit })}
                        onClick={() => setReferenceDigit(d)}
                    >
                        {d}
                    </div>
                ))}
            </div>
            <div className='progress-bars'>
                <div className='progress-row'>
                    <span className='progress-label match-label'>MATCH</span>
                    <div className='progress-track'>
                        <div className='progress-fill match-fill' style={{ width: `${matchPercent}%` }} />
                    </div>
                    <span className='progress-value'>{matchPercent.toFixed(1)}%</span>
                </div>
                <div className='progress-row'>
                    <span className='progress-label differ-label'>DIFFER</span>
                    <div className='progress-track'>
                        <div className='progress-fill differ-fill' style={{ width: `${differPercent}%` }} />
                    </div>
                    <span className='progress-value'>{differPercent.toFixed(1)}%</span>
                </div>
            </div>
            <div className='tick-history'>
                {recentTicks.map((tick, idx) => (
                    <div
                        key={idx}
                        className={classNames('tick-marker', {
                            'tick-marker--match': parseInt(tick) === referenceDigit,
                            'tick-marker--differ': parseInt(tick) !== referenceDigit,
                        })}
                    >
                        {parseInt(tick) === referenceDigit ? 'M' : 'D'}
                    </div>
                ))}
                {tickHistory.length > 12 && <div className='tick-more'>+ More</div>}
            </div>
        </div>
    );
};

const EvenOddSection: React.FC<{ digitPercentages: number[]; tickHistory: string[] }> = ({
    digitPercentages,
    tickHistory,
}) => {
    const evenPercent = [0, 2, 4, 6, 8].reduce((sum, d) => sum + (digitPercentages[d] || 0), 0);
    const oddPercent = [1, 3, 5, 7, 9].reduce((sum, d) => sum + (digitPercentages[d] || 0), 0);

    const recentTicks = tickHistory.slice(0, 12);

    return (
        <div className='analysis-section'>
            <div className='analysis-header'>
                <h3 className='analysis-title'>EVEN / ODD</h3>
                <span className='analysis-suggestion even-odd-suggestion'>
                    {evenPercent > oddPercent ? `${Math.max(1, Math.round(evenPercent / Math.max(1, oddPercent)))}x Even` : `${Math.max(1, Math.round(oddPercent / Math.max(1, evenPercent)))}x Odd`}
                </span>
            </div>
            <div className='progress-bars'>
                <div className='progress-row'>
                    <span className='progress-label even-label'>EVEN</span>
                    <div className='progress-track'>
                        <div className='progress-fill even-fill' style={{ width: `${evenPercent}%` }} />
                    </div>
                    <span className='progress-value'>{evenPercent.toFixed(1)}%</span>
                </div>
                <div className='progress-row'>
                    <span className='progress-label odd-label'>ODD</span>
                    <div className='progress-track'>
                        <div className='progress-fill odd-fill' style={{ width: `${oddPercent}%` }} />
                    </div>
                    <span className='progress-value'>{oddPercent.toFixed(1)}%</span>
                </div>
            </div>
            <div className='tick-history'>
                {recentTicks.map((tick, idx) => {
                    const isEven = parseInt(tick) % 2 === 0;
                    return (
                        <div key={idx} className={classNames('tick-marker', { 'tick-marker--even': isEven, 'tick-marker--odd': !isEven })}>
                            {isEven ? 'E' : 'O'}
                        </div>
                    );
                })}
                {tickHistory.length > 12 && <div className='tick-more'>+ More</div>}
            </div>
        </div>
    );
};

const RiseFallSection: React.FC<{ ticks: TickData[] }> = ({ ticks }) => {
    let riseCount = 0;
    let fallCount = 0;

    for (let i = 1; i < ticks.length; i++) {
        if (parseFloat(ticks[i].quote) > parseFloat(ticks[i - 1].quote)) riseCount++;
        else if (parseFloat(ticks[i].quote) < parseFloat(ticks[i - 1].quote)) fallCount++;
    }

    const total = riseCount + fallCount || 1;
    const risePercent = (riseCount / total) * 100;
    const fallPercent = (fallCount / total) * 100;

    const recentTicks = ticks.slice(-10);

    return (
        <div className='analysis-section'>
            <div className='analysis-header'>
                <h3 className='analysis-title'>RISE / FALL</h3>
                <span className='analysis-suggestion rise-fall-suggestion'>
                    {risePercent > fallPercent ? `${Math.max(1, Math.round(risePercent / Math.max(1, fallPercent)))}x Rise` : `${Math.max(1, Math.round(fallPercent / Math.max(1, risePercent)))}x Fall`}
                </span>
            </div>
            <div className='progress-bars'>
                <div className='progress-row'>
                    <span className='progress-label rise-label'>RISE</span>
                    <div className='progress-track'>
                        <div className='progress-fill rise-fill' style={{ width: `${risePercent}%` }} />
                    </div>
                    <span className='progress-value'>{risePercent.toFixed(1)}%</span>
                </div>
                <div className='progress-row'>
                    <span className='progress-label fall-label'>FALL</span>
                    <div className='progress-track'>
                        <div className='progress-fill fall-fill' style={{ width: `${fallPercent}%` }} />
                    </div>
                    <span className='progress-value'>{fallPercent.toFixed(1)}%</span>
                </div>
            </div>
            <div className='tick-history'>
                {recentTicks.map((tick, idx) => {
                    if (idx === 0) return null;
                    const prevQuote = parseFloat(recentTicks[idx - 1].quote);
                    const currQuote = parseFloat(tick.quote);
                    const isRise = currQuote >= prevQuote;
                    return (
                        <div key={idx} className={classNames('tick-marker', { 'tick-marker--rise': isRise, 'tick-marker--fall': !isRise })}>
                            {isRise ? 'R' : 'F'}
                        </div>
                    );
                })}
                {ticks.length > 10 && <div className='tick-more'>+ More</div>}
            </div>
        </div>
    );
};

const DCircleAnalysis: React.FC = () => {
    const { run_panel, client } = useStore();
    const [activeTab, setActiveTab] = useState<'circles' | 'scanner'>('circles');
    const [selectedMarket, setSelectedMarket] = useState('1HZ100V');
    const [tickCount, setTickCount] = useState(1000);
    const [ticks, setTicks] = useState<TickData[]>([]);
    const [livePrice, setLivePrice] = useState<string>('--');
    const [digitPercentages, setDigitPercentages] = useState<number[]>(Array(10).fill(0));
    const [tickHistory, setTickHistory] = useState<string[]>([]);
    const [lastDigit, setLastDigit] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const subscriptionIdRef = useRef<string | null>(null);
    const ticksArrayRef = useRef<TickData[]>([]);

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
    }, [getLastDigitPadded]);

    const fetchTicks = useCallback(async () => {
        if (!client.is_logged_in) {
            setIsConnected(false);
            return;
        }

        setIsLoading(true);
        try {
            if (subscriptionIdRef.current && api_base.api) {
                try {
                    await (api_base.api as any).forget(subscriptionIdRef.current);
                } catch (e) {}
                subscriptionIdRef.current = null;
            }

            const response = await (api_base.api as any)?.send({
                ticks_history: selectedMarket,
                subscribe: 1,
                end: 'latest',
                count: tickCount,
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
                        histPrices.push(formatQuote(t.quote, pipSize));
                        histEpochs.push(Number(t.epoch));
                    });
                }

                if (histPrices.length > 0) {
                    tickData = histPrices.map((quote, idx) => ({ quote: formatQuote(quote, pipSize), epoch: histEpochs[idx] ?? 0 }));
                } else if (resp.tick) {
                    tickData = [{ quote: formatQuote(resp.tick.quote, pipSize), epoch: resp.tick.epoch }];
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

                const prevTicks = ticksArrayRef.current;
                const updatedTicks = [...prevTicks, newTick];
                if (updatedTicks.length > tickCount) {
                    updatedTicks.splice(0, updatedTicks.length - tickCount);
                }
                ticksArrayRef.current = updatedTicks;
                analyzeDigits(updatedTicks);
            }
        });

        return () => {
            messageSubscription.unsubscribe();
            if (subscriptionIdRef.current && api_base.api) {
                (api_base.api as any).forget(subscriptionIdRef.current).catch(() => {});
            }
        };
    }, [selectedMarket, tickCount, client.is_logged_in, fetchTicks, analyzeDigits]);

    // Re-fetch when market or tick count changes
    useEffect(() => {
        if (client.is_logged_in) {
            fetchTicks();
        }
    }, [selectedMarket, tickCount, client.is_logged_in, fetchTicks]);

    return (
        <div className='d-circle-analysis'>
            {/* Tab Header */}
            <div className='d-circle-tabs'>
                <button
                    className={classNames('d-circle-tab', { 'd-circle-tab--active': activeTab === 'circles' })}
                    onClick={() => setActiveTab('circles')}
                >
                    Circles
                </button>
                <button
                    className={classNames('d-circle-tab', { 'd-circle-tab--active': activeTab === 'scanner' })}
                    onClick={() => setActiveTab('scanner')}
                >
                    Scanner
                </button>
            </div>

            {/* Controls Row */}
            <div className='d-circle-controls'>
                <select className='market-select' value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)}>
                    {MARKET_OPTIONS.map((market) => (
                        <option key={market.value} value={market.value}>
                            {market.label}
                        </option>
                    ))}
                </select>
                <div className='ticks-control'>
                    <span className='ticks-label'>TICKS</span>
                    <input
                        type='number'
                        className='ticks-input'
                        value={tickCount}
                        onChange={(e) => setTickCount(Math.max(100, Math.min(1000, parseInt(e.target.value) || 1000)))}
                        min={100}
                        max={1000}
                    />
                </div>
                <div className='live-price'>
                    <span className='live-label'>LIVE PRICE</span>
                    <span className='live-value'>{livePrice}</span>
                </div>
            </div>

            {/* Status indicator */}
            {!client.is_logged_in && (
                <div className='login-warning'>
                    Please log in to start analyzing market data.
                </div>
            )}
            {client.is_logged_in && !isConnected && !isLoading && (
                <div className='connection-warning'>
                    Waiting for market data...
                </div>
            )}
            {isLoading && (
                <div className='loading-indicator'>Loading ticks...</div>
            )}

            {activeTab === 'circles' ? (
                <>
                    <DigitsCircles digitPercentages={digitPercentages} lastDigit={lastDigit} />

                    <div className='analysis-container'>
                        <OverUnderSection digitPercentages={digitPercentages} tickHistory={tickHistory} />
                        <MatchDifferSection digitPercentages={digitPercentages} tickHistory={tickHistory} />
                        <EvenOddSection digitPercentages={digitPercentages} tickHistory={tickHistory} />
                        <RiseFallSection ticks={ticks} />
                    </div>
                </>
            ) : (
                <div className='scanner-view'>
                    <div className='scanner-grid'>
                        {MARKET_OPTIONS.map((market) => (
                            <div key={market.value} className='scanner-item'>
                                <span className='scanner-market'>{market.label}</span>
                                <div className='scanner-trend'>
                                    <span className='scanner-trend-up'>▲</span>
                                    <span className='scanner-trend-down'>▼</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default observer(DCircleAnalysis);
