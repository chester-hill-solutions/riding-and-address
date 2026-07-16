import type { ComponentProps, ReactNode } from 'react';
import { useNavigation } from 'react-router';

type SubmitButtonProps = Omit<ComponentProps<'button'>, 'type'> & {
  children: ReactNode;
  /** Label shown while the submission is in flight (defaults to children). */
  pendingText?: string;
};

/**
 * Submit button that disables itself (and shows a pending label) while any
 * navigation submission is in flight, preventing double submits.
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  ...rest
}: SubmitButtonProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== 'idle';
  return (
    <button
      {...rest}
      type="submit"
      className={[className, pending ? 'is-loading' : ''].filter(Boolean).join(' ') || undefined}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
