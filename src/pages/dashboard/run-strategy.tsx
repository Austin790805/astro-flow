import React, { useState } from 'react';
import TradeAnimation from '@/components/trade-animation';
import DCircleAnalysis from '@/components/d-circle-analysis';

const RunStrategy = () => {
    const [showDCircle, setShowDCircle] = useState(true);

    return (
        <div className='toolbar__section' data-testid='dt_run_strategy'>
            {/* D Circle Analysis Tool - toggleable panel */}
            {showDCircle && (
                <div className='d-circle-panel'>
                    <div className='d-circle-panel-header'>
                        <span className='d-circle-panel-title'>D Circle Analysis Tool</span>
                        <button
                            className='d-circle-panel-toggle'
                            onClick={() => setShowDCircle(false)}
                            title='Minimize'
                        >
                            &times;
                        </button>
                    </div>
                    <DCircleAnalysis />
                </div>
            )}

            {!showDCircle && (
                <button
                    className='d-circle-show-btn'
                    onClick={() => setShowDCircle(true)}
                >
                    Show D Circle Analysis
                </button>
            )}

            <TradeAnimation className='toolbar__animation' />
        </div>
    );
};

export default RunStrategy;
