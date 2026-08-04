import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { Field, Input } from '@/components/ui/field';
import { EmptyState, ErrorBoundary, ErrorState } from '@/components/ui/feedback';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

describe('Button', () => {
  it('blocks interaction and marks itself busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button, { pointerEventsCheck: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as a child element when asChild is set', () => {
    render(
      <Button asChild variant="primary">
        <a href="/studio">Open Studio</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: /open studio/i });
    expect(link).toHaveAttribute('href', '/studio');
    // CVA classes must still be applied to the delegated element.
    expect(link.className).toMatch(/inline-flex/);
  });

  it('is keyboard activatable', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);

    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('StatusBadge', () => {
  it('maps every generation status to a human label', () => {
    const { rerender } = render(<StatusBadge status="pending" />);
    expect(screen.getByText('Queued')).toBeInTheDocument();

    rerender(<StatusBadge status="running" />);
    expect(screen.getByText('Generating')).toBeInTheDocument();

    rerender(<StatusBadge status="completed" />);
    expect(screen.getByText('Done')).toBeInTheDocument();

    rerender(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('hides the decorative dot from assistive tech', () => {
    const { container } = render(<Badge dot>Live</Badge>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('Segmented', () => {
  const options = [
    { value: 'a' as const, label: 'Alpha' },
    { value: 'b' as const, label: 'Beta' },
  ];

  it('reports the active option to assistive tech', () => {
    render(
      <Segmented aria-label="Test group" value="a" onValueChange={vi.fn()} options={options} />,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('data-state', 'off');
  });

  it('emits the new value on selection', async () => {
    const onValueChange = vi.fn();
    render(
      <Segmented
        aria-label="Test group"
        value="a"
        onValueChange={onValueChange}
        options={options}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('never deselects down to no value', async () => {
    const onValueChange = vi.fn();
    render(
      <Segmented
        aria-label="Test group"
        value="a"
        onValueChange={onValueChange}
        options={options}
      />,
    );

    // Clicking the already-active item would clear it in raw Radix.
    await userEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(onValueChange).not.toHaveBeenCalledWith('');
    expect(onValueChange).not.toHaveBeenCalledWith(undefined);
  });
});

describe('Field', () => {
  it('associates the label with the control', () => {
    render(
      <Field label="Character name" htmlFor="name">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
  });

  it('announces errors and hides help text once invalid', () => {
    render(
      <Field label="Name" htmlFor="name" help="Helper text" error="Name is required">
        <Input id="name" />
      </Field>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    expect(screen.queryByText('Helper text')).not.toBeInTheDocument();
  });
});

describe('feedback states', () => {
  it('renders an empty state with an action', () => {
    render(
      <EmptyState title="Nothing here" description="Add one" action={<Button>Add</Button>} />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('exposes the error state as an alert with a retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Boom" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('ErrorBoundary', () => {
  function Boom(): React.ReactElement {
    throw new Error('render exploded');
  }

  it('catches a render crash instead of unmounting the tree', () => {
    // React logs the caught error; silence it so the run stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('render exploded');
    spy.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('uses alertdialog semantics and fires onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete Anika?"
        description="This cannot be undone."
        confirmLabel="Delete character"
        destructive
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete character' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables both actions while the confirmation is in flight', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete?"
        loading
        onConfirm={vi.fn()}
        confirmLabel="Delete"
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
