import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import DCircleAnalysis from '@/components/d-circle-analysis';
import './d-circle.scss';

const DCircle = observer(() => {
    const { dashboard } = useStore();
    const { active_tab } = dashboard;

    return (
        <div
            className={classNames('d-circle', {
                'd-circle--active': active_tab === 2,
                'd-circle--inactive': active_tab !== 2,
            })}
        >
            <DCircleAnalysis />
        </div>
    );
});

export default DCircle;
