'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const toastVariants = cva(
  [
    'group pointer-events-auto relative flex w-full items-start gap-3',
    'rounded-[16px] border p-4 pr-10 shadow-[var(--pf-shadow-lg)]',
    'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4',
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
    'data-[swipe=end]:animate-out data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
    'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
  ],
  {
    variants: {
      tone: {
        neutral: 'border-[var(--pf-border)] bg-[var(--pf-surface)] text-[var(--pf-text-primary)]',
        success: 'border-[var(--pf-success)]/30 bg-[var(--pf-surface)] text-[var(--pf-text-primary)]',
        error: 'border-[var(--pf-error)]/35 bg-[var(--pf-surface)] text-[var(--pf-text-primary)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type ToastTone = NonNullable<VariantProps<typeof toastVariants>['tone']>;

interface ToastRecord {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

interface ToastContextValue {
  toast: (input: {
    title: string;
    description?: string;
    tone?: ToastTone;
    duration?: number;
  }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}

const TONE_ICON: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  neutral: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

const TONE_COLOR: Record<ToastTone, string> = {
  neutral: 'text-[var(--pf-text-tertiary)]',
  success: 'text-[var(--pf-success)]',
  error: 'text-[var(--pf-error)]',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const nextId = React.useRef(0);

  const toast = React.useCallback<ToastContextValue['toast']>(
    ({ title, description, tone = 'neutral', duration }) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current,
        {
          id,
          title,
          description,
          tone,
          // Errors linger: they usually carry a message the user must read.
          duration: duration ?? (tone === 'error' ? 8000 : 4000),
        },
      ]);
    },
    [],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
    }),
    [toast],
  );

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => {
          const Icon = TONE_ICON[item.tone];
          return (
            <ToastPrimitive.Root
              key={item.id}
              duration={item.duration}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id);
              }}
              className={toastVariants({ tone: item.tone })}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_COLOR[item.tone])} />
              <div className="flex min-w-0 flex-col gap-1">
                <ToastPrimitive.Title className="text-[13px] font-bold">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-[12px] leading-relaxed text-[var(--pf-text-secondary)] break-words">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss notification"
                className="absolute right-3 top-3 rounded-md p-1 text-[var(--pf-text-tertiary)] transition-colors hover:bg-[var(--pf-surface-muted)] hover:text-[var(--pf-text-primary)]"
              >
                <X className="size-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[400] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[400px]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
