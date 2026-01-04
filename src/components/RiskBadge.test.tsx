import { render, screen } from '@testing-library/react';
import { RiskBadge } from './RiskBadge';

describe('RiskBadge', () => {
  it('renders flagged badge correctly', () => {
    render(<RiskBadge risk="flagged" />);
    expect(screen.getByText('⚠️ Flagged')).toBeInTheDocument();
    expect(screen.getByText('⚠️ Flagged')).toHaveClass('risk-badge', 'risk-flagged');
  });

  it('renders clean badge correctly', () => {
    render(<RiskBadge risk="none" />);
    expect(screen.getByText('✅ Clean')).toBeInTheDocument();
    expect(screen.getByText('✅ Clean')).toHaveClass('risk-badge', 'risk-none');
  });
});
