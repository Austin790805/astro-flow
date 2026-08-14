// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
// TODO: Complete MobX integration for popup functionality
// Some code is kept commented out pending popup integration
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import GoogleDrive from '@/components/load-modal/google-drive';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import {
    DerivLightBotBuilderIcon,
    DerivLightGoogleDriveIcon,
    DerivLightLocalDeviceIcon,
    DerivLightMyComputerIcon,
    DerivLightQuickStrategyIcon,
} from '@deriv/quill-icons/Illustration';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
/* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
/* [/AI] */
import DashboardBotList from './bot-list/dashboard-bot-list';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

type TCardArray = {
    id: string;
    icon: React.ReactElement;
    content: React.ReactElement;
    callback: () => void;
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal, quick_strategy, google_drive } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { isDesktop } = useDevice();
    const { onCloseDialog, dialog_options, is_dialog_open, setActiveTab, setPreviewOnPopup } = dashboard;
    const { setFormVisibility } = quick_strategy;

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openGoogleDriveDialog = () => {
        const google_drive_tab_index = isDesktop ? 2 : 1;
        toggleLoadModal();
        setActiveTabIndex(google_drive_tab_index); // Google Drive tab index
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const actions: TCardArray[] = [
        {
            id: 'upload-bot',
            icon: is_mobile ? (
                <DerivLightLocalDeviceIcon height='48px' width='48px' />
            ) : (
                <DerivLightMyComputerIcon height='48px' width='48px' />
            ),
            content: is_mobile ? <Localize i18n_default_text='Upload Bot' /> : <Localize i18n_default_text='Upload Bot' />,
            callback: () => {
                openFileLoader();
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
        {
            id: 'free-bots',
            icon: <DerivLightBotBuilderIcon height='48px' width='48px' />,
            content: <Localize i18n_default_text='Free Bots' />,
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
        {
            id: 'bot-editor',
            icon: <DerivLightBotBuilderIcon height='48px' width='48px' />,
            content: <Localize i18n_default_text='Bot Editor' />,
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
        {
            id: 'quick-strategy',
            icon: <DerivLightQuickStrategyIcon height='48px' width='48px' />,
            content: <Localize i18n_default_text='Quick Strategy' />,
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                setFormVisibility(true);
                /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                /* [/AI] */
            },
        },
    ];

    // Card color mapping to match screenshot
    const cardColors: Record<string, string> = {
        'upload-bot': '#ff4757',
        'free-bots': '#2ed573',
        'bot-editor': '#7c5cbf',
        'quick-strategy': '#ffa502',
    };

    const cardDescriptions: Record<string, string> = {
        'upload-bot': 'Import an XML bot from your computer',
        'free-bots': 'Browse ready-made trading strategies',
        'bot-editor': 'Build a custom bot with the visual editor',
        'quick-strategy': 'Start fast with a pre-built strategy template',
    };

    return React.useMemo(
        () => (
            <div className='quick-actions'>
                <div className='quick-actions__label'>QUICK ACTIONS</div>
                <div className='quick-actions__grid'>
                    {actions.map(action => {
                        const { icon, content, callback, id } = action;
                        const borderColor = cardColors[id] || '#57606f';
                        const description = cardDescriptions[id] || '';
                        return (
                            <div
                                key={id}
                                className='quick-actions__card'
                                style={{ borderTopColor: borderColor }}
                            >
                                <div className='quick-actions__card-header'>
                                    <div
                                        className='quick-actions__card-icon'
                                        style={{ background: `${borderColor}22` }}
                                        onClick={() => callback()}
                                    >
                                        {icon}
                                    </div>
                                    <button
                                        className='quick-actions__card-arrow'
                                        style={{ borderColor }}
                                        onClick={() => callback()}
                                    >
                                        →
                                    </button>
                                </div>
                                <h3 className='quick-actions__card-title'>{content}</h3>
                                <p className='quick-actions__card-description'>{description}</p>
                                <div className='quick-actions__card-footer' style={{ borderColor }}>
                                    <button
                                        className='quick-actions__card-open'
                                        style={{ color: borderColor }}
                                        onClick={() => callback()}
                                    >
                                        Open →
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {!isDesktop ? (
                    <Dialog
                        title={dialog_options.title}
                        is_visible={is_dialog_open}
                        onCancel={onCloseDialog}
                        is_mobile_full_width
                        className='dc-dialog__wrapper--google-drive'
                        has_close_icon
                    >
                        <GoogleDrive />
                    </Dialog>
                ) : (
                    <MobileFullPageModal
                        is_modal_open={is_dialog_open}
                        className='load-strategy__wrapper'
                        header={localize('Load strategy')}
                        onClickClose={() => {
                            setPreviewOnPopup(false);
                            onCloseDialog();
                        }}
                        height_offset='80px'
                    >
                        <div label='Google Drive' className='google-drive-label'>
                            <GoogleDrive />
                        </div>
                    </MobileFullPageModal>
                )}
                <DashboardBotList />
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies, is_google_drive_configured]
    );
});

export default Cards;
