import type { ComponentProps } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { Link } from 'react-router';
import { buttonVariants } from './ui/button';

/** React Router navigation with the shared CHS button appearance. */
export function ActionLink({ variant, size = 'touch', className, ...props }:
  ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link data-slot="button" data-variant={variant ?? 'default'}
    data-size={size} className={buttonVariants({ variant, size, className })} {...props} />;
}
