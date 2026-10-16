import type { ComponentProps, ReactNode } from 'react';
import { useNavigation } from 'react-router';
import { Button } from './ui/button';

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, 'type' | 'children'> & {
  children: ReactNode;
  pendingText?: string;
};

export function SubmitButton({ children, pendingText, className, isDisabled, ...rest }: SubmitButtonProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== 'idle';
  return (
    <Button {...rest} type="submit" size="touch" className={className}
      isDisabled={isDisabled} pending={pending} pendingLabel={pendingText}
      aria-busy={pending || undefined}>
      {children}
    </Button>
  );
}
