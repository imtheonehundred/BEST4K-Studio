import React from 'react';
import type { ChannelStatus } from '@shared/types';

export function StatusBadge({ status }: { status: ChannelStatus }) {
  const labels: Record<ChannelStatus, string> = {
    stopped: 'Stopped',
    starting: 'Starting',
    running: 'Running',
    reconnecting: 'Reconnecting',
    error: 'Error',
  };
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {labels[status]}
    </span>
  );
}
