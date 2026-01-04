import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoFiles } from './DemoFiles';

describe('DemoFiles', () => {
  const mockOnLoadDemo = vi.fn();

  it('renders toggle button when collapsed', () => {
    render(<DemoFiles onLoadDemo={mockOnLoadDemo} isProcessing={false} />);

    expect(screen.getByText('Try demo files')).toBeInTheDocument();
    expect(screen.queryByText('test-overlay-black.pdf')).not.toBeInTheDocument();
  });

  it('expands to show demo files when toggle clicked', async () => {
    const user = userEvent.setup();
    render(<DemoFiles onLoadDemo={mockOnLoadDemo} isProcessing={false} />);

    await user.click(screen.getByText('Try demo files'));

    expect(screen.getByText('test-annotation-redact.pdf')).toBeInTheDocument();
    expect(screen.getByText('test-overlay-black.pdf')).toBeInTheDocument();
    expect(screen.getByText('test-multi-page.pdf')).toBeInTheDocument();
    expect(screen.getByText('test-clean.pdf')).toBeInTheDocument();
  });

  it('collapses when toggle clicked again', async () => {
    const user = userEvent.setup();
    render(<DemoFiles onLoadDemo={mockOnLoadDemo} isProcessing={false} />);

    // Expand
    await user.click(screen.getByText('Try demo files'));
    expect(screen.getByText('test-overlay-black.pdf')).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText('Try demo files'));
    expect(screen.queryByText('test-overlay-black.pdf')).not.toBeInTheDocument();
  });

  it('calls onLoadDemo when demo file clicked', async () => {
    const user = userEvent.setup();
    render(<DemoFiles onLoadDemo={mockOnLoadDemo} isProcessing={false} />);

    await user.click(screen.getByText('Try demo files'));
    await user.click(screen.getByText('Black rectangle overlay'));

    expect(mockOnLoadDemo).toHaveBeenCalledWith(
      '/redact-check/assets/test-overlay-black.pdf',
      'test-overlay-black.pdf'
    );
  });

  it('disables buttons when processing', () => {
    render(<DemoFiles onLoadDemo={mockOnLoadDemo} isProcessing={true} />);

    const toggleButton = screen.getByRole('button', { name: /Try demo files/i });
    expect(toggleButton).toBeDisabled();
  });

  it('shows risk badges for each demo file', async () => {
    const user = userEvent.setup();
    render(<DemoFiles onLoadDemo={mockOnLoadDemo} isProcessing={false} />);

    await user.click(screen.getByText('Try demo files'));

    const flaggedBadges = screen.getAllByText('⚠️ Flagged');
    const cleanBadges = screen.getAllByText('✅ Clean');

    expect(flaggedBadges).toHaveLength(3); // 3 flagged files
    expect(cleanBadges).toHaveLength(1); // 1 clean file
  });
});
