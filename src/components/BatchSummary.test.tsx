import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchSummary } from './BatchSummary';

describe('BatchSummary', () => {
  const mockStats = {
    total_files: 5,
    completed: 5,
    failed: 0,
    total_pages: 25,
    total_flagged: 8,
  };

  const mockHandlers = {
    onDownloadAllAudits: vi.fn(),
    onDownloadAllCleanedAsZip: vi.fn(),
    onClearAll: vi.fn(),
  };

  it('renders summary statistics correctly', () => {
    render(
      <BatchSummary
        stats={mockStats}
        completedJobsCount={5}
        jobsNeedingCleaningCount={3}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('5')).toBeInTheDocument(); // Files Analyzed
    expect(screen.getByText('25')).toBeInTheDocument(); // Total Pages
    expect(screen.getByText('8')).toBeInTheDocument(); // Flagged Pages
    expect(screen.getByText('17')).toBeInTheDocument(); // Clean Pages (25 - 8)
  });

  it('calls onDownloadAllAudits when audit button clicked', async () => {
    const user = userEvent.setup();
    render(
      <BatchSummary
        stats={mockStats}
        completedJobsCount={5}
        jobsNeedingCleaningCount={3}
        {...mockHandlers}
      />
    );

    await user.click(screen.getByText('Download All Audits (JSON)'));
    expect(mockHandlers.onDownloadAllAudits).toHaveBeenCalledTimes(1);
  });

  it('calls onDownloadAllCleanedAsZip when ZIP button clicked', async () => {
    const user = userEvent.setup();
    render(
      <BatchSummary
        stats={mockStats}
        completedJobsCount={5}
        jobsNeedingCleaningCount={3}
        {...mockHandlers}
      />
    );

    await user.click(screen.getByText('Download All Cleaned PDFs (ZIP)'));
    expect(mockHandlers.onDownloadAllCleanedAsZip).toHaveBeenCalledTimes(1);
  });

  it('calls onClearAll when clear button clicked', async () => {
    const user = userEvent.setup();
    render(
      <BatchSummary
        stats={mockStats}
        completedJobsCount={5}
        jobsNeedingCleaningCount={3}
        {...mockHandlers}
      />
    );

    await user.click(screen.getByText('Clear All'));
    expect(mockHandlers.onClearAll).toHaveBeenCalledTimes(1);
  });

  it('disables audit button when no completed jobs', () => {
    render(
      <BatchSummary
        stats={mockStats}
        completedJobsCount={0}
        jobsNeedingCleaningCount={0}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Download All Audits (JSON)')).toBeDisabled();
  });

  it('disables ZIP button when no jobs need cleaning', () => {
    render(
      <BatchSummary
        stats={mockStats}
        completedJobsCount={5}
        jobsNeedingCleaningCount={0}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Download All Cleaned PDFs (ZIP)')).toBeDisabled();
  });
});
