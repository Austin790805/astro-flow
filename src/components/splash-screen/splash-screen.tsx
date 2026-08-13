import React, { useState, useEffect } from 'react';
import './splash-screen.scss';

const SplashScreen: React.FC = () => {
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('Connecting to Volatility Markets...');
    const [activeDot, setActiveDot] = useState(0);

    const statusMessages = [
        'Connecting to Volatility Markets...',
        'Initializing trading engine...',
        'Loading market data...',
        'Preparing your workspace...',
        'Almost ready...',
    ];

    useEffect(() => {
        // Simulate loading progress
        const progressInterval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    return 100;
                }
                return prev + Math.random() * 15 + 5;
            });
        }, 300);

        // Cycle through status messages
        let msgIndex = 0;
        const msgInterval = setInterval(() => {
            msgIndex = (msgIndex + 1) % statusMessages.length;
            setStatusMessage(statusMessages[msgIndex]);
        }, 1500);

        // Animate dots
        const dotInterval = setInterval(() => {
            setActiveDot((prev) => (prev + 1) % 6);
        }, 400);

        return () => {
            clearInterval(progressInterval);
            clearInterval(msgInterval);
            clearInterval(dotInterval);
        };
    }, []);

    return (
        <div className='splash-screen'>
            <div className='splash-card'>
                {/* Logo */}
                <div className='splash-logo'>
                    <h1 className='splash-logo-text'>
                        <span className='splash-logo-astro'>ASTRO</span>
                        <span className='splash-logo-flow'>FLOW</span>
                    </h1>
                    <div className='splash-logo-sub'>
                        <span className='splash-logo-sub-text'>TRADING HUB</span>
                        <span className='splash-live-badge'>
                            <span className='splash-live-dot' />
                            LIVE
                        </span>
                    </div>
                </div>

                {/* Divider */}
                <div className='splash-divider' />

                {/* Welcome Text */}
                <h2 className='splash-title'>Welcome to Astro Flow</h2>
                <p className='splash-subtitle'>Empowering your financial journey.</p>

                {/* Progress Bar */}
                <div className='splash-progress-container'>
                    <div className='splash-progress-track'>
                        <div
                            className='splash-progress-fill'
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                    <span className='splash-progress-percent'>{Math.min(Math.round(progress), 100)}%</span>
                </div>

                {/* Status Message with Spinner */}
                <div className='splash-status'>
                    <div className='splash-spinner' />
                    <span>{statusMessage}</span>
                </div>

                {/* Pulsing Dots */}
                <div className='splash-dots'>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className={`splash-dot ${i === activeDot ? 'splash-dot--active' : ''}`}
                        />
                    ))}
                </div>

                {/* Feature Icons */}
                <div className='splash-features'>
                    <div className='splash-feature'>
                        <div className='splash-feature-icon'>📊</div>
                        <span className='splash-feature-label'>Advanced Charts</span>
                    </div>
                    <div className='splash-feature'>
                        <div className='splash-feature-icon'>🤖</div>
                        <span className='splash-feature-label'>Trading Bots</span>
                    </div>
                    <div className='splash-feature'>
                        <div className='splash-feature-icon'>🔄</div>
                        <span className='splash-feature-label'>Copy Trading</span>
                    </div>
                </div>

                {/* Bottom Message */}
                <p className='splash-footer-message'>
                    Preparing a seamless trading experience for you
                </p>
            </div>
        </div>
    );
};

export default SplashScreen;
