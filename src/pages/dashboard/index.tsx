import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../../hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
import './dashboard-upgrade.scss';

const TRADING_QUOTES = [
    '"Cut your losses short. Let your profits run."',
    '"The stock market is a device for transferring money from the impatient to the patient."',
    '"Risk comes from not knowing what you are doing."',
    '"Be fearful when others are greedy, and greedy when others are fearful."',
    '"The market can stay irrational longer than you can stay solvent."',
    '"In investing, what is comfortable is rarely profitable."',
    '"Plan your trade, trade your plan."',
    '"The best investment is in yourself."',
];

const QUOTE_ROTATION_INTERVAL = 4000; // 4 seconds

const QuickActionCard = ({
    icon,
    title,
    description,
    borderColor,
    onOpen,
}: {
    icon: string;
    title: string;
    description: string;
    borderColor: string;
    onOpen?: () => void;
}) => (
    <div className='dashboard__quick-action' style={{ borderTopColor: borderColor, borderLeftColor: borderColor }}>
        <div className='dashboard__quick-action-header'>
            <div className='dashboard__quick-action-icon-wrapper'>{icon}</div>
            <button className='dashboard__quick-action-arrow' onClick={onOpen} aria-label={`Open ${title}`}>
                →
            </button>
        </div>
        <h3 className='dashboard__quick-action-title'>{title}</h3>
        <p className='dashboard__quick-action-description'>{description}</p>
        <div className='dashboard__quick-action-footer'>
            <button className='dashboard__quick-action-open' style={{ color: borderColor }} onClick={onOpen}>
                Open <span aria-hidden>→</span>
            </button>
        </div>
    </div>
);

const Dashboard = observer(() => {
    const { ui, dashboard } = useStore();
    const { isAuthorized } = ui;
    const { activeLoginid } = useApiBase();
    const [currentQuote, setCurrentQuote] = useState(0);
    const [isQuoteFading, setIsQuoteFading] = useState(false);

    // Rotate trading quotes every 4 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setIsQuoteFading(true);
            setTimeout(() => {
                setCurrentQuote(prev => (prev + 1) % TRADING_QUOTES.length);
                setIsQuoteFading(false);
            }, 300); // Wait for fade-out animation
        }, QUOTE_ROTATION_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    const handleOpenBotBuilder = () => {
        dashboard?.setActiveTab?.(1); // Switch to Bot Builder tab
    };

    return (
        <div className='dashboard'>
            {/* Hero Section */}
            <div className='dashboard__hero'>
                <h1 className='dashboard__greeting'>
                    Hello {activeLoginid || 'Trader'} <span className='dashboard__wave'>👋</span>
                </h1>
                <h2 className='dashboard__headline'>LET&apos;S PRINT SOME DOLLARS 💵💰</h2>
                <div className='dashboard__quote-container'>
                    <p className={`dashboard__quote ${isQuoteFading ? 'dashboard__quote--fading' : ''}`}>
                        {TRADING_QUOTES[currentQuote]}
                    </p>
                </div>
            </div>

            {/* Quick Actions */}
            <div className='dashboard__quick-actions'>
                <h3 className='dashboard__quick-actions-label'>QUICK ACTIONS</h3>
                <div className='dashboard__quick-actions-grid'>
                    <QuickActionCard
                        icon='📁'
                        title='Upload Bot'
                        description='Import an XML bot from your computer'
                        borderColor='#ff4d4f'
                        onOpen={handleOpenBotBuilder}
                    />
                    <QuickActionCard
                        icon='🤖'
                        title='Free Bots'
                        description='Browse ready-made trading strategies'
                        borderColor='#52c41a'
                        onOpen={handleOpenBotBuilder}
                    />
                    <QuickActionCard
                        icon='🧩'
                        title='Bot Editor'
                        description='Build a custom bot with the visual editor'
                        borderColor='#722ed1'
                        onOpen={handleOpenBotBuilder}
                    />
                    <QuickActionCard
                        icon='⚡'
                        title='Quick Strategy'
                        description='Start fast with a pre-built strategy template'
                        borderColor='#faad14'
                        onOpen={handleOpenBotBuilder}
                    />
                </div>
            </div>
        </div>
    );
});

export default Dashboard;
