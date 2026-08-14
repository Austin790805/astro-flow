import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { useApiBase } from '@/hooks/useApiBase';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';

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

const QUOTE_ROTATION_INTERVAL = 4000;

const DashboardHero = () => {
    const { activeLoginid } = useApiBase();
    const [currentQuote, setCurrentQuote] = useState(0);
    const [isQuoteFading, setIsQuoteFading] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsQuoteFading(true);
            setTimeout(() => {
                setCurrentQuote(prev => (prev + 1) % TRADING_QUOTES.length);
                setIsQuoteFading(false);
            }, 300);
        }, QUOTE_ROTATION_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className='dashboard-hero'>
            <h2 className='dashboard-hero__greeting'>
                Hello {activeLoginid || 'Trader'} <span className='dashboard-hero__wave'>👋</span>
            </h2>
            <h1 className='dashboard-hero__headline'>LET&apos;S PRINT SOME DOLLARS 💵💰</h1>
            <div className='dashboard-hero__quote-container'>
                <p className={classNames('dashboard-hero__quote', { 'dashboard-hero__quote--fading': isQuoteFading })}>
                    {TRADING_QUOTES[currentQuote]}
                </p>
            </div>
        </div>
    );
};

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, google_drive } = useStore();
    const { dashboard_strategies } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();

    return (
        <React.Fragment>
            <div
                className={classNames('tab__dashboard', {
                    'tab__dashboard--tour-active': active_tour,
                })}
            >
                <div className='tab__dashboard__content'>
                    <DashboardHero />
                    {client.is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}
                    <div className='quick-panel'>
                        <div
                            className={classNames('tab__dashboard__header', {
                                'tab__dashboard__header--listed': isDesktop && has_dashboard_strategies,
                            })}
                        >
                            {!has_dashboard_strategies && (
                                <Text
                                    className='title'
                                    as='h2'
                                    color='prominent'
                                    size={isDesktop ? 'sm' : 's'}
                                    lineHeight='xxl'
                                    weight='bold'
                                >
                                    {localize('Load or build your bot')}
                                </Text>
                            )}
                            <Text
                                as='p'
                                color='prominent'
                                lineHeight='s'
                                size={isDesktop ? 's' : 'xxs'}
                                className={classNames('subtitle', { 'subtitle__has-list': has_dashboard_strategies })}
                            >
                                {is_google_drive_configured
                                    ? localize(
                                          'Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.'
                                      )
                                    : localize(
                                          'Import a bot from your computer, build it from scratch, or start with a quick strategy.'
                                      )}
                            </Text>
                        </div>
                        <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
